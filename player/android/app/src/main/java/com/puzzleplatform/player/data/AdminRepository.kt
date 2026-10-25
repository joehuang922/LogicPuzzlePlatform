package com.puzzleplatform.player.data

import android.content.Context
import android.net.Uri
import com.puzzleplatform.player.BuildConfig
import com.puzzleplatform.player.data.api.ParserApi
import com.puzzleplatform.player.data.api.PuzzleApi
import com.puzzleplatform.player.data.local.AppDatabase
import com.puzzleplatform.player.data.local.toEntity
import com.puzzleplatform.player.data.local.toLocalEntity
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CreateCollectionRequest
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import com.puzzleplatform.player.data.model.DEFAULT_COLLECTION_ID
import com.puzzleplatform.player.data.model.ParseImageRequest
import com.puzzleplatform.player.data.model.ParseImageResponse
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.UpdatePuzzleRequest
import com.puzzleplatform.player.data.model.defaultCollection
import com.puzzleplatform.player.data.model.sortedForDisplay
import com.puzzleplatform.player.data.sync.SyncClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import retrofit2.HttpException

/**
 * Authoring-side data access for the in-app Admin screens: create a collection,
 * parse a puzzle image, create a question, and browse / edit / delete existing ones.
 * Thin wrapper over [PuzzleApi] + [ParserApi] + [ImageInput], matching how screens
 * lean on [PuzzleRepository].
 *
 * Create endpoints run the server's solver gate and answer 400 with a JSON
 * `{ error }` on a bad board; [serverMessage] surfaces that text so the UI can
 * show the real reason ("multiple solutions", …) instead of "HTTP 400".
 *
 * Creating, editing and deleting a question write through to Room (see [createPuzzle],
 * [updatePuzzle], [deletePuzzle]), so the change shows on this device without another
 * pull-sync.
 */
class AdminRepository(
    private val api: PuzzleApi,
    private val parserApi: ParserApi,
    private val db: AppDatabase,
    private val json: Json,
    private val context: Context,
) {
    /** True when a parser URL is configured; the image-parse step needs it. */
    val parserConfigured: Boolean = BuildConfig.PARSER_URL.isNotBlank()

    suspend fun listCollections(): List<Collection> =
        api.listCollections().collections.sortedForDisplay()

    suspend fun createCollection(req: CreateCollectionRequest): Int =
        api.createCollection(req).id

    /**
     * Every collection for the Admin browser, in display order: the real ones plus, when
     * any puzzle has none, the default collection ([DEFAULT_COLLECTION_ID]) holding them.
     * Always read from the server, so the browser shows what's live.
     */
    suspend fun listBrowsableCollections(): List<Collection> {
        val res = api.listCollections()
        val all = if (res.uncollectedCount > 0) {
            res.collections + defaultCollection(res.uncollectedCount)
        } else res.collections
        return all.sortedForDisplay()
    }

    /** One collection's live questions from the server; [DEFAULT_COLLECTION_ID] lists the uncollected. */
    suspend fun listCollectionPuzzles(collectionId: Int): List<Puzzle> =
        api.listPuzzles(
            srcCollection = if (collectionId == DEFAULT_COLLECTION_ID) "none" else collectionId.toString(),
        ).puzzles

    suspend fun getPuzzle(id: String): Puzzle = api.getPuzzle(id).puzzle

    /**
     * PATCH the question and return the server's updated row. It's written through to
     * Room, keeping the cached row's sync fields; if it moved collection the cached
     * counts follow. Best-effort, as for [createPuzzle].
     */
    suspend fun updatePuzzle(id: String, req: UpdatePuzzleRequest): Puzzle {
        val updated = api.updatePuzzle(id, req).puzzle
        runCatching {
            val existing = db.puzzleDao().getById(id)
            db.puzzleDao().upsert(
                updated.toEntity(json, updatedAt = existing?.updatedAt, deletedAt = existing?.deletedAt)
            )
            if (existing != null && existing.srcCollection != updated.srcCollection) {
                bumpCollectionCount(existing.srcCollection, -1)
                bumpCollectionCount(updated.srcCollection, +1)
            }
        }
        return updated
    }

    /**
     * Soft-delete the question on the server, then mark the cached row deleted (hidden
     * from listings, kept for any attempt on it, as a pull-sync would) and drop it from
     * its collection's cached count.
     */
    suspend fun deletePuzzle(id: String) {
        val res = api.deletePuzzle(id)
        if (!res.isSuccessful) throw HttpException(res)
        runCatching {
            val existing = db.puzzleDao().getById(id) ?: return@runCatching
            if (existing.deletedAt == null) {
                db.puzzleDao().markDeleted(id, SyncClock.nowDatetime())
                bumpCollectionCount(existing.srcCollection, -1)
            }
        }
    }

    /** Adjust a cached collection's puzzle count; a null id is the default collection. */
    private suspend fun bumpCollectionCount(collectionId: Int?, delta: Int) {
        val cid = collectionId ?: DEFAULT_COLLECTION_ID
        db.collectionDao().getAll().firstOrNull { it.id == cid }?.let {
            db.collectionDao().upsertAll(listOf(it.copy(puzzleCount = maxOf(0, it.puzzleCount + delta))))
        }
    }

    /**
     * POST the question, then write it through to Room so local-first reads see it
     * at once. The server's row is preferred (it carries the gate's stored solution
     * and the joined type/collection labels); if that read fails, the row is built
     * from [req] and the cached lookups instead. The cached collection's count is
     * bumped too. The local write is best-effort: the server already has the
     * puzzle, so a failure here never fails the create — the next sync fills it in.
     */
    suspend fun createPuzzle(req: CreatePuzzleRequest): String {
        val id = api.createPuzzle(req).id
        runCatching { writeThrough(id, req) }
        return id
    }

    private suspend fun writeThrough(id: String, req: CreatePuzzleRequest) {
        val entity = runCatching {
            api.getPuzzle(id).puzzle.toEntity(json, updatedAt = null, deletedAt = null)
        }.getOrElse {
            req.toLocalEntity(
                id = id,
                json = json,
                type = db.puzzleTypeDao().getAll().firstOrNull { it.id == req.puzzleType },
                collection = req.srcCollection?.let { cid ->
                    db.collectionDao().getAll().firstOrNull { it.id == cid }
                },
            )
        }
        db.puzzleDao().upsert(entity)
        bumpCollectionCount(req.srcCollection, +1)
    }

    /**
     * Downscale + base64-encode [uri] off the main thread, POST it to the parser
     * as [puzzleType], and return the parsed canon JSON (sudoku: `{ hints }`) plus
     * the best-effort title/author read from around the board.
     *
     * @throws IllegalStateException if no parser URL is configured.
     */
    suspend fun parseImage(uri: Uri, puzzleType: Int): ParseImageResponse {
        check(parserConfigured) { "No parser URL configured" }
        val base64 = withContext(Dispatchers.IO) {
            ImageInput.toBase64Jpeg(context, uri)
        }
        return parserApi.parse(
            url = BuildConfig.PARSER_URL,
            body = ParseImageRequest(image = base64, puzzleType = puzzleType),
        )
    }

    /** A failed call's message plus the API's machine-readable `code`, if it sent one. */
    data class ServerError(val message: String, val code: String?) {
        /** The gate rejected the board only because the solver timed out; overridable. */
        val isGateTimeout: Boolean get() = code == GATE_UNKNOWN_CODE
    }

    /**
     * Best-effort extraction of the API's `{ error, code }` from a failed call.
     * The message is the HTTP error body's error field when present, else the
     * exception's own message. (The error body can only be read once, so read
     * both fields here.)
     */
    fun serverError(e: Throwable): ServerError {
        if (e is HttpException) {
            val raw = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
            if (!raw.isNullOrBlank()) {
                val body = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull()
                fun field(name: String) =
                    (body?.get(name) as? kotlinx.serialization.json.JsonPrimitive)?.content
                val message = field("error")
                if (!message.isNullOrBlank()) return ServerError(message, field("code"))
            }
        }
        return ServerError(e.message ?: "Something went wrong", null)
    }

    fun serverMessage(e: Throwable): String = serverError(e).message

    companion object {
        /** API error code for a create the solver gate timed out on. */
        const val GATE_UNKNOWN_CODE = "gate_unknown"
    }
}
