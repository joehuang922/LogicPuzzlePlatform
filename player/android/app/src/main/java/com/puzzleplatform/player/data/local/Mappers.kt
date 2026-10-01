package com.puzzleplatform.player.data.local

import com.puzzleplatform.player.data.model.Attempt
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.PuzzleType
import com.puzzleplatform.player.data.model.Snapshot
import com.puzzleplatform.player.data.model.SnapshotSummary
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * Conversions between the wire DTOs (data.model) and Room entities (data.local).
 * canonRepr / currentAnswer are kept as raw JSON strings on both sides.
 */

fun PuzzleType.toEntity() = PuzzleTypeEntity(id, name, jpLabel, rule)

fun PuzzleTypeEntity.toModel() = PuzzleType(id, name, jpLabel, rule)

fun Collection.toEntity() =
    CollectionEntity(id, name, publisher, publishAt, coverSrc, puzzleCount)

fun CollectionEntity.toModel() =
    Collection(id, name, publisher, publishAt, coverSrc, puzzleCount)

fun Puzzle.toEntity(json: Json, updatedAt: String?, deletedAt: String?) = PuzzleEntity(
    id = id,
    puzzleType = puzzleType,
    puzzleTypeName = puzzleTypeName,
    puzzleTypeJpLabel = puzzleTypeJpLabel,
    title = title,
    author = author,
    difficulty = difficulty,
    width = width,
    height = height,
    canonRepr = json.encodeToString(JsonObject.serializer(), canonRepr),
    srcCollection = srcCollection,
    srcCollectionName = srcCollectionName,
    srcCollectionCoverSrc = srcCollectionCoverSrc,
    special = special,
    solutionRepr = solutionRepr?.let { json.encodeToString(JsonObject.serializer(), it) },
    updatedAt = updatedAt,
    deletedAt = deletedAt,
)

fun PuzzleEntity.toModel(json: Json) = Puzzle(
    id = id,
    puzzleType = puzzleType,
    puzzleTypeName = puzzleTypeName,
    puzzleTypeJpLabel = puzzleTypeJpLabel,
    title = title,
    author = author,
    difficulty = difficulty,
    width = width,
    height = height,
    canonRepr = json.parseToJsonElement(canonRepr) as JsonObject,
    srcCollection = srcCollection,
    srcCollectionName = srcCollectionName,
    srcCollectionCoverSrc = srcCollectionCoverSrc,
    special = special,
    solutionRepr = solutionRepr?.let { json.parseToJsonElement(it) as JsonObject },
)

fun SnapshotEntity.toModel() = Snapshot(
    id = id,
    attempt = attempt,
    currentAnswer = currentAnswer,
    progress = progress,
    elapsedSeconds = elapsedSeconds,
    finished = finished,
    createdAt = createdAt,
)

fun SnapshotEntity.toSummary() =
    SnapshotSummary(id = id, progress = progress, elapsedSeconds = elapsedSeconds, createdAt = createdAt)

/** An Attempt DTO carries the latest snapshot's progress/elapsed for the list UI. */
fun AttemptEntity.toModel(latest: SnapshotEntity?) = Attempt(
    id = id,
    createdAt = createdAt,
    latestProgress = latest?.progress ?: 0.0,
    latestElapsedSeconds = latest?.elapsedSeconds ?: 0,
)
