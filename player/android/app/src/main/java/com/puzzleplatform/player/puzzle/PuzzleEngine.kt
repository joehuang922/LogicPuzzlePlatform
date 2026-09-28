package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Per-type puzzle logic, the Kotlin analog of the web client's
 * renderer/extractor/progress triple (frontend/src/{renderers,extractors,progress}).
 *
 * Rendering/input lives in Compose composables (see ui/board), dispatched by
 * [puzzleType]; this interface holds only the pure, unit-testable logic so the
 * answer/progress contract can be verified without an emulator.
 *
 * User input is modeled as a map keyed "col,row" -> value, matching the web
 * client's userValues convention exactly so extracted answers are identical.
 */
interface PuzzleEngine {
    val puzzleType: Int

    /** Convert the player's in-progress input into the canonical answer JSON to save. */
    fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject

    /** Completion percentage in the range 0..100. */
    fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double

    /** Rebuild the "col,row" -> value input map from a previously saved answer. */
    fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int>

    /** True when the current input is a full, valid solution (triggers auto-complete). */
    fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean
}

/** Registry mapping puzzleType id -> engine. Add engines here as more types are ported. */
object PuzzleEngines {
    private val engines: Map<Int, PuzzleEngine> = listOf(
        SudokuEngine,
        KakuroEngine,
    ).associateBy { it.puzzleType }

    fun forType(puzzleType: Int): PuzzleEngine? = engines[puzzleType]

    fun isSupported(puzzleType: Int): Boolean = engines.containsKey(puzzleType)
}
