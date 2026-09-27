package com.puzzleplatform.player.data

import com.puzzleplatform.player.data.api.PuzzleApi
import com.puzzleplatform.player.data.model.Attempt
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CollectionProgress
import com.puzzleplatform.player.data.model.CreateAttemptRequest
import com.puzzleplatform.player.data.model.CreateAttemptResponse
import com.puzzleplatform.player.data.model.ProfileResponse
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.PuzzleType
import com.puzzleplatform.player.data.model.SaveSnapshotRequest
import com.puzzleplatform.player.data.model.SaveSnapshotResponse
import com.puzzleplatform.player.data.model.Snapshot
import com.puzzleplatform.player.data.model.SnapshotSummary
import com.puzzleplatform.player.data.model.SolvedQuestionsResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * Thin wrapper over [PuzzleApi]. Suspend functions run on Retrofit's own
 * dispatcher, so callers just launch them from a coroutine scope.
 */
class PuzzleRepository(
    private val api: PuzzleApi,
    private val json: Json,
) {
    suspend fun listPuzzles(
        puzzleType: String? = null,
        srcCollection: String? = null,
        limit: Int? = null,
    ): List<Puzzle> = api.listPuzzles(puzzleType, srcCollection, limit).puzzles

    suspend fun getPuzzle(id: String): Puzzle = api.getPuzzle(id).puzzle

    suspend fun listPuzzleTypes(): List<PuzzleType> = api.listPuzzleTypes().puzzleTypes

    suspend fun listCollections(): List<Collection> = api.listCollections().collections

    suspend fun createAttempt(question: String, initialAnswer: JsonObject): CreateAttemptResponse =
        api.createAttempt(CreateAttemptRequest(PLAYER_ID, question, initialAnswer))

    suspend fun listAttempts(question: String, finished: Boolean? = null): List<Attempt> =
        api.listAttempts(PLAYER_ID, question, finished).attempts

    suspend fun getSolvedQuestions(questionIds: List<String>): SolvedQuestionsResponse =
        api.getSolvedQuestions(PLAYER_ID, questionIds.joinToString(","))

    suspend fun getCollectionProgress(collectionIds: List<Int>): List<CollectionProgress> =
        api.getCollectionProgress(PLAYER_ID, collectionIds.joinToString(",")).collectionProgress

    suspend fun getAttemptSnapshot(attemptId: String): Snapshot =
        api.getAttemptSnapshot(attemptId).snapshot

    suspend fun listSnapshots(attemptId: String): List<SnapshotSummary> =
        api.listSnapshots(attemptId).snapshots

    suspend fun getSnapshotById(attemptId: String, snapshotId: String): Snapshot =
        api.getSnapshotById(attemptId, snapshotId).snapshot

    suspend fun saveSnapshot(
        attemptId: String,
        currentAnswer: JsonObject,
        progress: Double,
        elapsedSeconds: Int,
        finished: Boolean? = null,
    ): SaveSnapshotResponse =
        api.saveSnapshot(
            attemptId,
            SaveSnapshotRequest(currentAnswer, progress, elapsedSeconds, finished),
        )

    suspend fun getProfile(): ProfileResponse = api.getProfile(PLAYER_ID)

    /** Parse a snapshot's stringified currentAnswer into a JsonObject. */
    fun parseAnswer(currentAnswer: String): JsonObject =
        json.parseToJsonElement(currentAnswer) as JsonObject

    companion object {
        // No auth on the backend; the web client hardcodes player id = 1, so we match it.
        const val PLAYER_ID = 1
    }
}
