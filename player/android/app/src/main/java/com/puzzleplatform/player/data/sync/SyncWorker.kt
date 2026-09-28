package com.puzzleplatform.player.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.puzzleplatform.player.data.ServiceLocator

/**
 * Background push of unsynced progress. Runs only when connected, survives the
 * app being backgrounded, and retries with backoff on failure. Idempotent by
 * client UUID, so a duplicate run after a partial push is safe.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            ServiceLocator.syncManager.push()
            Result.success()
        } catch (_: Exception) {
            // Network/cold-start failure — let WorkManager retry with backoff.
            Result.retry()
        }
    }

    companion object {
        private const val UNIQUE_WORK = "puzzle-sync-push"

        /** Enqueue a one-off push, coalescing with any already-queued one. */
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}
