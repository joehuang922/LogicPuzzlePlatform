package com.puzzleplatform.player.data.sync

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Time helpers for sync. created_at values are formatted as UTC MySQL DATETIME
 * literals ('YYYY-MM-DD HH:MM:SS') so the server stores them verbatim and
 * ordering of a batch of offline snapshots is preserved.
 */
object SyncClock {
    private val datetimeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun nowMillis(): Long = System.currentTimeMillis()

    fun nowDatetime(): String = datetimeFormat.format(Date())
}
