package com.puzzleplatform.player.data.api

import com.puzzleplatform.player.data.model.ParseImageRequest
import com.puzzleplatform.player.data.model.ParseImageResponse
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Url

/**
 * The OCR parser (parsers/lambda_handler.py), reached as a standalone Lambda
 * Function URL — not under the API base. Because the full URL comes from config
 * (BuildConfig.PARSER_URL) rather than a fixed path, [parse] takes it via @Url;
 * the Retrofit baseUrl set in ServiceLocator is only a placeholder.
 *
 * Mirrors parseImage() in player/frontend/src/api/client.ts.
 */
interface ParserApi {

    @POST
    suspend fun parse(
        @Url url: String,
        @Body body: ParseImageRequest,
    ): ParseImageResponse
}
