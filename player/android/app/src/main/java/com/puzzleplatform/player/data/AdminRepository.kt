package com.puzzleplatform.player.data

import android.content.Context
import android.net.Uri
import com.puzzleplatform.player.BuildConfig
import com.puzzleplatform.player.data.api.ParserApi
import com.puzzleplatform.player.data.api.PuzzleApi
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CreateCollectionRequest
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import com.puzzleplatform.player.data.model.ParseImageRequest
import com.puzzleplatform.player.data.model.ParseImageResponse
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
 */
class AdminRepository(
    private val api: PuzzleApi,
    private val parserApi: ParserApi,
    private val json: Json,
    private val context: Context,
) {
    /** True when a parser URL is configured; the image-parse step needs it. */
    val parserConfigured: Boolean = BuildConfig.PARSER_URL.isNotBlank()

    suspend fun listCollections(): List<Collection> =
        api.listCollections().collections

    suspend fun createCollection(req: CreateCollectionRequest): Int =
        api.createCollection(req).id

    suspend fun createPuzzle(req: CreatePuzzleRequest): String =
        api.createPuzzle(req).id

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

    /**
     * Best-effort extraction of the API's `{ error }` message from a failed
     * call. Returns the HTTP error body's error field when present, else the
     * exception's own message.
     */
    fun serverMessage(e: Throwable): String {
        if (e is HttpException) {
            val raw = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
            if (!raw.isNullOrBlank()) {
                val parsed = runCatching {
                    json.parseToJsonElement(raw).jsonObject["error"]?.let { el ->
                        (el as? kotlinx.serialization.json.JsonPrimitive)?.content
                    }
                }.getOrNull()
                if (!parsed.isNullOrBlank()) return parsed
            }
        }
        return e.message ?: "Something went wrong"
    }
}
