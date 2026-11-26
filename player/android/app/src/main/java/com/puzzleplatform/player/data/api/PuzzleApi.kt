package com.puzzleplatform.player.data.api

import com.puzzleplatform.player.data.model.AttemptListResponse
import com.puzzleplatform.player.data.model.CollectionListResponse
import com.puzzleplatform.player.data.model.CollectionManifestResponse
import com.puzzleplatform.player.data.model.CollectionProgressResponse
import com.puzzleplatform.player.data.model.CreateAttemptRequest
import com.puzzleplatform.player.data.model.MissionsResponse
import com.puzzleplatform.player.data.model.CreateAttemptResponse
import com.puzzleplatform.player.data.model.CreateCollectionRequest
import com.puzzleplatform.player.data.model.CreateCollectionResponse
import com.puzzleplatform.player.data.model.UpdateCollectionRequest
import com.puzzleplatform.player.data.model.UpdateCollectionResponse
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import com.puzzleplatform.player.data.model.CreatePuzzleResponse
import com.puzzleplatform.player.data.model.HistoryResponse
import com.puzzleplatform.player.data.model.ProfileResponse
import com.puzzleplatform.player.data.model.ProgressChangesResponse
import com.puzzleplatform.player.data.model.PuzzleListResponse
import com.puzzleplatform.player.data.model.PuzzleResponse
import com.puzzleplatform.player.data.model.PuzzleTypeListResponse
import com.puzzleplatform.player.data.model.SaveSnapshotRequest
import com.puzzleplatform.player.data.model.SaveSnapshotResponse
import com.puzzleplatform.player.data.model.SnapshotResponse
import com.puzzleplatform.player.data.model.SnapshotSummaryListResponse
import com.puzzleplatform.player.data.model.SolvedQuestionsResponse
import com.puzzleplatform.player.data.model.SyncRequest
import com.puzzleplatform.player.data.model.SyncResponse
import com.puzzleplatform.player.data.model.UpdatePuzzleRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The player-facing endpoints, mirroring player/frontend/src/api/client.ts.
 * The several /attempts query-param variants are exposed as distinct methods
 * so callers don't have to hand-build query strings.
 */
interface PuzzleApi {

    @GET("puzzles")
    suspend fun listPuzzles(
        @Query("puzzleType") puzzleType: String? = null,
        @Query("srcCollection") srcCollection: String? = null,
        @Query("limit") limit: Int? = null,
    ): PuzzleListResponse

    @GET("puzzles/{id}")
    suspend fun getPuzzle(@Path("id") id: String): PuzzleResponse

    @GET("puzzle-types")
    suspend fun listPuzzleTypes(): PuzzleTypeListResponse

    @GET("collections")
    suspend fun listCollections(): CollectionListResponse

    // --- Admin authoring (no auth: the API has no authorizer) ---

    @POST("collections")
    suspend fun createCollection(@Body body: CreateCollectionRequest): CreateCollectionResponse

    @PATCH("collections/{id}")
    suspend fun updateCollection(
        @Path("id") id: Int,
        @Body body: UpdateCollectionRequest,
    ): UpdateCollectionResponse

    @POST("puzzles")
    suspend fun createPuzzle(@Body body: CreatePuzzleRequest): CreatePuzzleResponse

    @PATCH("puzzles/{id}")
    suspend fun updatePuzzle(@Path("id") id: String, @Body body: UpdatePuzzleRequest): PuzzleResponse

    // Soft delete; answers 204 with no body, hence the bare Response.
    @DELETE("puzzles/{id}")
    suspend fun deletePuzzle(@Path("id") id: String): Response<Unit>

    @GET("collections/{id}/manifest")
    suspend fun getCollectionManifest(@Path("id") id: Int): CollectionManifestResponse

    @POST("attempts")
    suspend fun createAttempt(@Body body: CreateAttemptRequest): CreateAttemptResponse

    @GET("attempts")
    suspend fun listAttempts(
        @Query("player") player: Int,
        @Query("question") question: String,
        @Query("finished") finished: Boolean? = null,
    ): AttemptListResponse

    @GET("attempts")
    suspend fun getSolvedQuestions(
        @Query("player") player: Int,
        @Query("questions") questions: String,
    ): SolvedQuestionsResponse

    @GET("attempts")
    suspend fun getCollectionProgress(
        @Query("player") player: Int,
        @Query("collectionProgress") collectionProgress: String,
    ): CollectionProgressResponse

    @GET("attempts/{id}/snapshot")
    suspend fun getAttemptSnapshot(@Path("id") attemptId: String): SnapshotResponse

    @GET("attempts/{id}/snapshots")
    suspend fun listSnapshots(@Path("id") attemptId: String): SnapshotSummaryListResponse

    @GET("attempts/{id}/snapshots")
    suspend fun getSnapshotById(
        @Path("id") attemptId: String,
        @Query("snapshotId") snapshotId: String,
    ): SnapshotResponse

    @POST("attempts/{id}/snapshot")
    suspend fun saveSnapshot(
        @Path("id") attemptId: String,
        @Body body: SaveSnapshotRequest,
    ): SaveSnapshotResponse

    @GET("profile")
    suspend fun getProfile(@Query("player") player: Int): ProfileResponse

    /** Solves per day over [from]..[to] (YYYY-MM-DD, inclusive) in time zone [tz]. */
    @GET("history")
    suspend fun getHistory(
        @Query("player") player: Int,
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("tz") tz: String,
        @Query("metric") metric: String = "solved",
    ): HistoryResponse

    @GET("profile/missions")
    suspend fun getMissions(@Query("player") player: Int, @Query("tz") tz: String): MissionsResponse

    @POST("sync")
    suspend fun sync(@Body body: SyncRequest): SyncResponse

    /** Progress changed since [since] (null => all); pass [until]/[after] for later pages. */
    @GET("sync")
    suspend fun pullChanges(
        @Query("player") player: Int,
        @Query("since") since: String? = null,
        @Query("until") until: String? = null,
        @Query("after") after: String? = null,
    ): ProgressChangesResponse
}
