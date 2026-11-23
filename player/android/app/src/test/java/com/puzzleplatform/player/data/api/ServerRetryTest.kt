package com.puzzleplatform.player.data.api

import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class ServerRetryTest {
    private fun http(code: Int) = HttpException(Response.error<Any>(code, "".toResponseBody()))

    @Test
    fun retriesServerErrorsUntilSuccess() = runTest {
        var calls = 0
        val v = retryServerErrors(pause = {}) {
            if (++calls < 3) throw http(500)
            "ok"
        }
        assertEquals("ok" to 3, v to calls)
    }

    @Test
    fun givesUpAfterRetries() {
        var calls = 0
        assertThrows(IOException::class.java) {
            kotlinx.coroutines.runBlocking {
                retryServerErrors(retries = 2, pause = {}) { calls++; throw IOException("down") }
            }
        }
        assertEquals(3, calls)
    }

    @Test
    fun doesNotRetryClientErrors() {
        var calls = 0
        assertThrows(HttpException::class.java) {
            kotlinx.coroutines.runBlocking {
                retryServerErrors(pause = {}) { calls++; throw http(400) }
            }
        }
        assertEquals(1, calls)
    }
}
