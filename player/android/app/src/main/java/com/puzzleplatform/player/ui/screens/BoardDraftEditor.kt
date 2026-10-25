package com.puzzleplatform.player.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.Dp
import com.puzzleplatform.player.puzzle.AuthoringType
import com.puzzleplatform.player.puzzle.AkariAuthoring
import com.puzzleplatform.player.puzzle.BoardDraft
import com.puzzleplatform.player.puzzle.NumberLinkAuthoring
import com.puzzleplatform.player.puzzle.ShakashakaAuthoring
import com.puzzleplatform.player.puzzle.ShikakuAuthoring
import com.puzzleplatform.player.puzzle.SudokuAuthoring
import com.puzzleplatform.player.ui.board.AkariBoard
import com.puzzleplatform.player.ui.board.BlackCellMiniBoard
import com.puzzleplatform.player.ui.board.ClueGridMiniBoard
import com.puzzleplatform.player.ui.board.DigitBar
import com.puzzleplatform.player.ui.board.HeyawakeMiniBoard
import com.puzzleplatform.player.ui.board.KakuroMiniBoard
import com.puzzleplatform.player.ui.board.MasyuMiniBoard
import com.puzzleplatform.player.ui.board.NonogramMiniBoard
import com.puzzleplatform.player.ui.board.NurikabeMiniBoard
import com.puzzleplatform.player.ui.board.PictoLinkMiniBoard
import com.puzzleplatform.player.ui.board.RippleEffectMiniBoard
import com.puzzleplatform.player.ui.board.NumberLinkBoard
import com.puzzleplatform.player.ui.board.ShakashakaBoard
import com.puzzleplatform.player.ui.board.ShikakuBoard
import com.puzzleplatform.player.ui.board.SlalomMiniBoard
import com.puzzleplatform.player.ui.board.SlitherlinkMiniBoard
import com.puzzleplatform.player.ui.board.SudokuBoard
import com.puzzleplatform.player.ui.board.SudokuMiniBoard
import com.puzzleplatform.player.ui.board.YajilinMiniBoard

/**
 * The editor for a [BoardDraft] of [type], shared by the batch review and the question
 * editor: for sudoku the interactive player board (reused verbatim; an all-zero-hints
 * puzzle keeps every cell editable, the givens ride in as userValues) with a digit bar;
 * for nonogram [NonogramClueEditor]; for kakuro [KakuroCellEditor]; for slitherlink
 * [SlitherlinkClueEditor]; for nurikabe [NurikabeClueEditor]; for heyawake
 * [HeyawakeRoomEditor]; for picto link [PictoLinkClueEditor]; for yajilin
 * [YajilinClueEditor]; for ripple effect [RippleEffectRoomEditor]; for masyu
 * [MasyuCircleEditor]; for slalom [SlalomGateEditor]; for shakashaka and akari
 * [BlackCellEditor]; for number link and shikaku [ClueGridEditor], each on its own player
 * board (whose play input has nothing to write into here, so it's dropped). Each lists
 * its own problems.
 */
@Composable
fun BoardDraftEditor(
    type: AuthoringType,
    board: BoardDraft,
    selectedCell: String?,
    onSelectCell: (String?) -> Unit,
    onChange: ((BoardDraft) -> BoardDraft) -> Unit,
) {
    when (type) {
        AuthoringType.SUDOKU -> {
            val reviewPuzzle = remember { SudokuAuthoring.blankPuzzle() }
            SudokuBoard(
                puzzle = reviewPuzzle,
                userValues = board.userValues,
                liveValidate = true,
                selectedCell = selectedCell,
                onSelectCell = onSelectCell,
            )
            if (selectedCell != null) {
                DigitBar(
                    onDigit = { digit ->
                        if (digit in 1..9) onChange { it.copy(userValues = it.userValues + (selectedCell to digit)) }
                    },
                    onClear = { onChange { it.copy(userValues = it.userValues - selectedCell) } },
                    onDismiss = { onSelectCell(null) },
                )
            }
        }
        AuthoringType.NONOGRAM -> NonogramClueEditor(
            draft = board.nonogram,
            onChange = { t -> onChange { it.copy(nonogram = t(it.nonogram)) } },
        )
        AuthoringType.KAKURO -> KakuroCellEditor(
            draft = board.kakuro,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(kakuro = t(it.kakuro)) } },
        )
        AuthoringType.SLITHERLINK -> SlitherlinkClueEditor(
            draft = board.slitherlink,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(slitherlink = t(it.slitherlink)) } },
        )
        AuthoringType.NURIKABE -> NurikabeClueEditor(
            draft = board.nurikabe,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(nurikabe = t(it.nurikabe)) } },
        )
        AuthoringType.HEYAWAKE -> HeyawakeRoomEditor(
            draft = board.heyawake,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(heyawake = t(it.heyawake)) } },
        )
        AuthoringType.PICTO_LINK -> PictoLinkClueEditor(
            draft = board.pictoLink,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(pictoLink = t(it.pictoLink)) } },
        )
        AuthoringType.YAJILIN -> YajilinClueEditor(
            draft = board.yajilin,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(yajilin = t(it.yajilin)) } },
        )
        AuthoringType.RIPPLE_EFFECT -> RippleEffectRoomEditor(
            draft = board.rippleEffect,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(rippleEffect = t(it.rippleEffect)) } },
        )
        AuthoringType.MASYU -> MasyuCircleEditor(
            draft = board.masyu,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(masyu = t(it.masyu)) } },
        )
        AuthoringType.SLALOM -> SlalomGateEditor(
            draft = board.slalom,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(slalom = t(it.slalom)) } },
        )
        AuthoringType.SHAKASHAKA -> BlackCellEditor(
            authoring = ShakashakaAuthoring,
            draft = board.shakashaka,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(shakashaka = t(it.shakashaka)) } },
        ) { puzzle, onTap, selected ->
            ShakashakaBoard(
                puzzle = puzzle,
                userValues = emptyMap(),
                onPutValue = { _, _ -> },
                onTapCell = onTap,
                selectedCell = selected,
            )
        }
        AuthoringType.AKARI -> BlackCellEditor(
            authoring = AkariAuthoring,
            draft = board.akari,
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(akari = t(it.akari)) } },
        ) { puzzle, onTap, selected ->
            AkariBoard(
                puzzle = puzzle,
                userValues = emptyMap(),
                liveValidate = false,
                onTapCell = onTap,
                selectedCell = selected,
            )
        }
        AuthoringType.NUMBER_LINK -> ClueGridEditor(
            authoring = NumberLinkAuthoring,
            draft = board.numberLink,
            clueLabel = "Number",
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(numberLink = t(it.numberLink)) } },
        ) { puzzle, onTap, selected ->
            NumberLinkBoard(
                puzzle = puzzle,
                userValues = emptyMap(),
                onSetEdge = { _, _ -> },
                onTapCell = onTap,
                selectedCell = selected,
            )
        }
        AuthoringType.SHIKAKU -> ClueGridEditor(
            authoring = ShikakuAuthoring,
            draft = board.shikaku,
            clueLabel = "Area",
            selectedCell = selectedCell,
            onSelectCell = onSelectCell,
            onChange = { t -> onChange { it.copy(shikaku = t(it.shikaku)) } },
        ) { puzzle, onTap, selected ->
            ShikakuBoard(
                puzzle = puzzle,
                userValues = emptyMap(),
                onApplyChanges = {},
                onTapCell = onTap,
                selectedCell = selected,
            )
        }
    }
}

/** A thumbnail of a [BoardDraft] of [type]; red-tinted where the type's problem check flags it. */
@Composable
fun BoardDraftMiniBoard(type: AuthoringType, board: BoardDraft, size: Dp) {
    val hasProblems = board.problems(type).isNotEmpty()
    when (type) {
        AuthoringType.SUDOKU -> SudokuMiniBoard(givens = board.userValues, size = size)
        AuthoringType.NONOGRAM -> NonogramMiniBoard(
            rows = board.nonogram.rows,
            cols = board.nonogram.cols,
            hasProblems = hasProblems,
            size = size,
        )
        AuthoringType.KAKURO -> KakuroMiniBoard(draft = board.kakuro, hasProblems = hasProblems, size = size)
        AuthoringType.SLITHERLINK ->
            SlitherlinkMiniBoard(draft = board.slitherlink, hasProblems = hasProblems, size = size)
        AuthoringType.NURIKABE -> NurikabeMiniBoard(draft = board.nurikabe, hasProblems = hasProblems, size = size)
        AuthoringType.HEYAWAKE -> HeyawakeMiniBoard(draft = board.heyawake, hasProblems = hasProblems, size = size)
        AuthoringType.PICTO_LINK ->
            PictoLinkMiniBoard(draft = board.pictoLink, hasProblems = hasProblems, size = size)
        AuthoringType.YAJILIN -> YajilinMiniBoard(draft = board.yajilin, hasProblems = hasProblems, size = size)
        AuthoringType.RIPPLE_EFFECT ->
            RippleEffectMiniBoard(draft = board.rippleEffect, hasProblems = hasProblems, size = size)
        AuthoringType.MASYU -> MasyuMiniBoard(draft = board.masyu, hasProblems = hasProblems, size = size)
        AuthoringType.SLALOM -> SlalomMiniBoard(draft = board.slalom, hasProblems = hasProblems, size = size)
        AuthoringType.SHAKASHAKA ->
            BlackCellMiniBoard(draft = board.shakashaka, hasProblems = hasProblems, size = size)
        AuthoringType.AKARI -> BlackCellMiniBoard(draft = board.akari, hasProblems = hasProblems, size = size)
        AuthoringType.NUMBER_LINK ->
            ClueGridMiniBoard(draft = board.numberLink, hasProblems = hasProblems, size = size)
        AuthoringType.SHIKAKU -> ClueGridMiniBoard(draft = board.shikaku, hasProblems = hasProblems, size = size)
    }
}
