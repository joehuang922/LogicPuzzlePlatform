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
import com.puzzleplatform.player.data.model.sortedForDisplay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import retrofit2.HttpException

/**
 * Authoring-side data access for the in-app Admin screens: create a collection,
 * parse a puzzle image, and create a question. Thin wrapper over [PuzzleApi] +
 * [ParserApi] + [ImageInput], matching how screens lean on [PuzzleRepository].
 *
 * Create endpoints run the server's solver gate and answer 400 with a JSON
 * `{ error }` on a bad board; [serverMessage] surfaces that text so the UI can
 * show the real reason ("multiple solutions", …) instead of "HTTP 400".
 *
 * Creating a question writes through to Room (see [createPuzzle]), so the new
 * puzzle is playable and listed on this device without another pull-sync.
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
        val collectionId = req.srcCollection ?: DEFAULT_COLLECTION_ID
        db.collectionDao().getAll().firstOrNull { it.id == collectionId }?.let {
            db.collectionDao().upsertAll(listOf(it.copy(puzzleCount = it.puzzleCount + 1)))
        }
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
