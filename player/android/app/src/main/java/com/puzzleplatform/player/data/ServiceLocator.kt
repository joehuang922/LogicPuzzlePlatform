package com.puzzleplatform.player.data

import android.content.Context
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.puzzleplatform.player.BuildConfig
import com.puzzleplatform.player.data.api.PuzzleApi
import com.puzzleplatform.player.data.api.RetryInterceptor
import com.puzzleplatform.player.data.local.AppDatabase
import com.puzzleplatform.player.data.sync.SyncManager
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Hand-rolled dependency wiring, mirroring the reference project's lightweight
 * "no DI framework" approach (FitnessDatabase.get()-style singletons).
 *
 * Room and WorkManager need a Context, so [init] must be called once from
 * PlayerApp.onCreate() before the repository/sync manager are used.
 */
object ServiceLocator {

    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    // Lenient so unexpected/extra server fields never crash deserialization.
    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
    }

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(RetryInterceptor())
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = if (BuildConfig.DEBUG) {
                        HttpLoggingInterceptor.Level.BASIC
                    } else {
                        HttpLoggingInterceptor.Level.NONE
                    }
                }
            )
            // Generous read timeout: an Aurora cold start can take 10-25s.
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    val api: PuzzleApi by lazy {
        // BuildConfig.API_BASE_URL has no trailing slash; Retrofit needs one.
        val base = BuildConfig.API_BASE_URL.trimEnd('/') + "/"
        Retrofit.Builder()
            .baseUrl(base)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(PuzzleApi::class.java)
    }

    private val database: AppDatabase by lazy { AppDatabase.get(appContext) }

    val syncManager: SyncManager by lazy {
        SyncManager(api, database, json, PuzzleRepository.PLAYER_ID)
    }

    val repository: PuzzleRepository by lazy {
        PuzzleRepository(api, database, syncManager, json, appContext)
    }
}
