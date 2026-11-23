package com.puzzleplatform.player.data.api

import kotlinx.coroutines.delay
import retrofit2.HttpException
import java.io.IOException

/**
 * Retry [block] on a server-side failure (an HTTP 5xx, including a throttled Lambda,
 * or no response at all), backing off 1s, 2s, 4s; twin of the web's `withRetry`.
 * Only for idempotent requests. [RetryInterceptor] covers 502-504 already; a
 * throttled Lambda comes back as another 5xx, which it leaves alone because
 * retrying that blindly isn't safe for creates. A 4xx is thrown at once.
 */
suspend fun <T> retryServerErrors(
    retries: Int = 3,
    pause: suspend (Long) -> Unit = { delay(it) },
    block: suspend () -> T,
): T {
    var attempt = 0
    while (true) {
        try {
            return block()
        } catch (e: Exception) {
            val retryable = (e is HttpException && e.code() >= 500) || e is IOException
            if (!retryable || attempt >= retries) throw e
            pause(1000L shl attempt)
            attempt++
        }
    }
}
