package com.puzzleplatform.player.data.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Data classes mirroring the web client's API contract
 * (player/frontend/src/api/client.ts). Field names match the API's camelCase
 * JSON exactly, so no @SerialName is needed.
 */

@Serializable
data class Puzzle(
    val id: String,
    val puzzleType: Int,
    val puzzleTypeName: String,
    val puzzleTypeJpLabel: String,
    val title: String? = null,
    val author: String? = null,
    val difficulty: Int,
    val width: Int? = null,
    val height: Int? = null,
    // Arbitrary per-type puzzle JSON; parsed by the matching PuzzleEngine.
    // The API stores this stringified and passes it through untouched, so it
    // arrives over the wire as a JSON *string*, not a nested object.
    @Serializable(with = StringifiedJsonObjectSerializer::class)
    val canonRepr: JsonObject,
    val srcCollection: Int? = null,
    val srcCollectionName: String? = null,
    val srcCollectionCoverSrc: String? = null,
    // MySQL BOOLEAN comes back over the Data API as 0/1 or a bool; tolerate both.
    @Serializable(with = FlexibleBooleanSerializer::class)
    val special: Boolean = false,
    // Auto-solve gate output (docs/auto-solve). The stored solution, delivered like
    // canonRepr (stringified over the wire, so the same serializer applies); null for
    // types with no solver or puzzles predating the gate/backfill. Backs the offline
    // "reveal" fallback when the on-device hinter finds no logical next step.
    @Serializable(with = StringifiedJsonObjectSerializer::class)
    val solutionRepr: JsonObject? = null,
)

@Serializable
data class PuzzleResponse(val puzzle: Puzzle)

@Serializable
data class PuzzleListResponse(val puzzles: List<Puzzle>)

@Serializable
data class Collection(
    val id: Int,
    val name: String,
    val publisher: String? = null,
    val publishAt: String? = null,
    val coverSrc: String? = null,
    val puzzleCount: Int,
)

@Serializable
data class CollectionListResponse(val collections: List<Collection>)

@Serializable
data class PuzzleType(
    val id: Int,
    val name: String,
    val jpLabel: String,
    val rule: String,
)

@Serializable
data class PuzzleTypeListResponse(val puzzleTypes: List<PuzzleType>)

@Serializable
data class Attempt(
    val id: String,
    val createdAt: String,
    val latestProgress: Double = 0.0,
    val latestElapsedSeconds: Int = 0,
)

@Serializable
data class AttemptListResponse(val attempts: List<Attempt>)

@Serializable
data class SolvedQuestionsResponse(
    val solvedQuestions: List<String> = emptyList(),
    val attemptedQuestions: List<String> = emptyList(),
)

@Serializable
data class CollectionProgress(
    val collectionId: Int,
    val total: Int,
    val solved: Int,
)

@Serializable
data class CollectionProgressResponse(val collectionProgress: List<CollectionProgress>)

@Serializable
data class CreateAttemptRequest(
    val player: Int,
    val question: String,
    val initialAnswer: JsonObject,
    // Client-generated ids so an attempt can be created offline and replayed.
    val attemptId: String? = null,
    val snapshotId: String? = null,
)

@Serializable
data class CreateAttemptResponse(
    val attemptId: String,
    val snapshotId: String,
)

@Serializable
data class Snapshot(
    val id: String,
    val attempt: String,
    // Stored as a stringified JSON column server-side; parse on demand.
    val currentAnswer: String,
    val progress: Double = 0.0,
    val elapsedSeconds: Int = 0,
    @Serializable(with = FlexibleBooleanSerializer::class)
    val finished: Boolean = false,
    val createdAt: String,
)

@Serializable
data class SnapshotResponse(val snapshot: Snapshot)

@Serializable
data class SnapshotSummary(
    val id: String,
    val progress: Double = 0.0,
    val elapsedSeconds: Int = 0,
    val createdAt: String,
)

@Serializable
data class SnapshotSummaryListResponse(val snapshots: List<SnapshotSummary>)

@Serializable
data class SaveSnapshotRequest(
    val currentAnswer: JsonObject,
    val progress: Double,
    val elapsedSeconds: Int,
    val finished: Boolean? = null,
    // Client-generated id so an offline save replays idempotently on sync.
    val snapshotId: String? = null,
)

// --- Offline sync DTOs ---

/** One puzzle's change-detection info from GET /collections/{id}/manifest. */
@Serializable
data class ManifestPuzzle(
    val id: String,
    val updatedAt: String? = null,
    val deletedAt: String? = null,
)

@Serializable
data class CollectionManifestResponse(val puzzles: List<ManifestPuzzle> = emptyList())

@Serializable
data class SyncSnapshotInput(
    val id: String,
    val currentAnswer: JsonObject,
    val progress: Double,
    val elapsedSeconds: Int,
    val finished: Boolean = false,
    val createdAt: String,
)

@Serializable
data class SyncAttemptInput(
    val id: String,
    val question: String,
    val createdAt: String,
    val snapshots: List<SyncSnapshotInput> = emptyList(),
)

@Serializable
data class SyncRequest(
    val player: Int,
    val attempts: List<SyncAttemptInput> = emptyList(),
)

@Serializable
data class SyncResponse(
    val syncedAttemptIds: List<String> = emptyList(),
    val syncedSnapshotIds: List<String> = emptyList(),
    val newAchievements: List<AchievementUnlock> = emptyList(),
)

@Serializable
data class AchievementUnlock(
    val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val category: String,
    val unlockedAt: String? = null,
)

@Serializable
data class SaveSnapshotResponse(
    val snapshotId: String,
    val newAchievements: List<AchievementUnlock> = emptyList(),
)

@Serializable
data class ProfileQuestionStat(
    val typeId: Int,
    val typeName: String,
    val typeJpLabel: String,
    val total: Int,
    val solved: Int,
    val tried: Int,
)

@Serializable
data class ProfileCollectionRow(
    val collectionId: Int,
    val collectionName: String,
    val typeId: Int,
    val typeName: String,
    val typeJpLabel: String,
    val total: Int,
    val solved: Int,
)

@Serializable
data class ProfileAchievement(
    val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val category: String,
    val unlocked: Boolean = false,
    val unlockedAt: String? = null,
)

@Serializable
data class ProfilePlayer(val id: Int, val name: String)

@Serializable
data class ProfileResponse(
    val player: ProfilePlayer,
    val questionStats: List<ProfileQuestionStat> = emptyList(),
    val collectionStats: List<ProfileCollectionRow> = emptyList(),
    val achievements: List<ProfileAchievement> = emptyList(),
)

/**
 * The RDS Data API returns MySQL BOOLEAN as 0/1, but the same field may be a
 * real JSON boolean elsewhere. Accept integers, booleans, or numeric strings.
 */
object FlexibleBooleanSerializer : KSerializer<Boolean> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("FlexibleBoolean", PrimitiveKind.BOOLEAN)

    override fun deserialize(decoder: Decoder): Boolean {
        val jsonDecoder = decoder as? JsonDecoder
            ?: return decoder.decodeBoolean()
        val element = jsonDecoder.decodeJsonElement()
        val primitive = element as? JsonPrimitive ?: return false
        primitive.booleanOrNull?.let { return it }
        primitive.intOrNull?.let { return it != 0 }
        return primitive.content.equals("true", ignoreCase = true) || primitive.content == "1"
    }

    override fun serialize(encoder: Encoder, value: Boolean) {
        encoder.encodeBoolean(value)
    }
}

/**
 * Reads a JSON object that the API may deliver either inline (a real object) or
 * stringified (a JSON string whose contents are the object). The `canonRepr`
 * column is stored stringified server-side and passed through untouched, so it
 * arrives as a string; other paths may inline it. Accept both.
 */
object StringifiedJsonObjectSerializer : KSerializer<JsonObject> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("StringifiedJsonObject", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): JsonObject {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw SerializationException("StringifiedJsonObjectSerializer requires a JSON input")
        return when (val element = jsonDecoder.decodeJsonElement()) {
            is JsonObject -> element
            is JsonPrimitive -> jsonDecoder.json.parseToJsonElement(element.content) as? JsonObject
                ?: throw SerializationException("Expected a JSON object, got: ${element.content}")
            else -> throw SerializationException("Expected an object or stringified object, got: $element")
        }
    }

    override fun serialize(encoder: Encoder, value: JsonObject) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw SerializationException("StringifiedJsonObjectSerializer requires a JSON output")
        jsonEncoder.encodeJsonElement(value)
    }
}
