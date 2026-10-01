package com.puzzleplatform.player.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

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
    version = 2,
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

        /**
         * v1 -> v2: add puzzles.solutionRepr for the offline hint "reveal" fallback.
         * A plain additive column migration — reference data is server-authoritative
         * and re-synced, but attempts/snapshots live in this same DB, so we migrate
         * rather than drop (which would lose unsynced progress).
         */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE puzzles ADD COLUMN solutionRepr TEXT")
            }
        }

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "puzzle-player.db",
                ).addMigrations(MIGRATION_1_2).build().also { instance = it }
            }
    }
}
