package com.puzzleplatform.player.data.api

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Replicates the web client's cold-start resilience (client.ts:1-42).
 *
 * The backend runs on Aurora Serverless v2, which scales to zero and cold-starts
 * (~10-25s) after idle. During that window the gateway returns 502/503/504 or the
 * connection fails outright. These are transient, so retry with exponential
 * backoff (1s, 2s, 4s capped at 6s) up to [maxRetries] times before giving up.
 */
class RetryInterceptor(
    private val maxRetries: Int = 3,
) : Interceptor {

    private val retryableStatuses = setOf(502, 503, 504)

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var lastError: IOException? = null

        var attempt = 0
        while (true) {
            try {
                val response = chain.proceed(request)
                if (response.code in retryableStatuses && attempt < maxRetries) {
                    response.close()
                    sleepBackoff(attempt)
                    attempt++
                    continue
                }
                return response
            } catch (e: IOException) {
                // Network-level failure (DB waking, connection dropped).
                lastError = e
                if (attempt >= maxRetries) throw e
                sleepBackoff(attempt)
                attempt++
            }
        }
    }

    private fun sleepBackoff(attempt: Int) {
        val delayMs = minOf(1000L * (1L shl attempt), 6000L)
        try {
            Thread.sleep(delayMs)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            throw IOException("Interrupted during retry backoff", e)
        }
    }
}
