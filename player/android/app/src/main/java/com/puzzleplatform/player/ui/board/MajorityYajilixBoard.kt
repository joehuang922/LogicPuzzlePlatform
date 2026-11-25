package com.puzzleplatform.player.ui.board

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.MajorityYajilixEngine

/**
 * Majority Yajilix (puzzle type 47): [YajilixBoard] with letter-only clues and the majority
 * rule for Errors: On; the analog of frontend/src/components/MajorityYajilixBoard.tsx.
 */
@Composable
fun MajorityYajilixBoard(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    onTapCell: (col: Int, row: Int) -> Unit,
    onApplyChanges: (Map<String, Int>) -> Unit,
    modifier: Modifier = Modifier,
    liveValidate: Boolean = false,
) = YajilixBoard(
    puzzle = puzzle,
    userValues = userValues,
    onTapCell = onTapCell,
    onApplyChanges = onApplyChanges,
    modifier = modifier,
    liveValidate = liveValidate,
    findBroken = MajorityYajilixEngine::brokenClues,
)
