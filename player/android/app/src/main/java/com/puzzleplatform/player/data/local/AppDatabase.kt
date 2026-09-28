package com.puzzleplatform.player.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * The on-device mirror of the remote data. Reference data is cached for offline
 * play; attempts/snapshots are created locally and synced upstream.
 */
@Database(
    entities = [
        PuzzleTypeEntity::class,
        CollectionEntity::class,
        PuzzleEntity::class,
        AttemptEntity::class,
        SnapshotEntity::class,
        CollectionDownloadEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun puzzleTypeDao(): PuzzleTypeDao
    abstract fun collectionDao(): CollectionDao
    abstract fun puzzleDao(): PuzzleDao
    abstract fun attemptDao(): AttemptDao
    abstract fun snapshotDao(): SnapshotDao
    abstract fun syncDao(): SyncDao
    abstract fun collectionDownloadDao(): CollectionDownloadDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "puzzle-player.db",
                ).build().also { instance = it }
            }
    }
}
