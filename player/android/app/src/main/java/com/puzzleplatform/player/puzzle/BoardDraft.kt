package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.JsonObject

/**
 * An editable board for one of the [AuthoringType]s, shared by the Admin batch flow
 * (a tile parsed from a photo) and the Admin question editor (an existing question
 * loaded from its canon). Only the field matching the type in hand is meaningful: a
 * sudoku's givens ride in [userValues] ("col,row" -> digit, the map the player's
 * SudokuBoard renders and edits), a nonogram's clue lists in [nonogram], and so on.
 *
 * Pure (no Android types), so the canon round-trip stays JVM-unit-testable.
 */
data class BoardDraft(
    val userValues: Map<String, Int> = emptyMap(),
    val nonogram: NonogramDraft = NonogramDraft(),
    val kakuro: KakuroDraft = KakuroDraft(),
    val slitherlink: SlitherlinkDraft = SlitherlinkDraft(),
    val nurikabe: NurikabeDraft = NurikabeDraft(),
    val heyawake: HeyawakeDraft = HeyawakeDraft(),
    val pictoLink: PictoLinkDraft = PictoLinkDraft(),
    val yajilin: YajilinDraft = YajilinDraft(),
    val rippleEffect: RippleEffectDraft = RippleEffectDraft(),
    val masyu: MasyuDraft = MasyuDraft(),
    val slalom: SlalomDraft = SlalomDraft(),
    val shakashaka: BlackCellDraft = BlackCellDraft(),
    val akari: BlackCellDraft = BlackCellDraft(),
    val numberLink: ClueGridDraft = ClueGridDraft(),
    val shikaku: ClueGridDraft = ClueGridDraft(),
    val fillomino: ClueGridDraft = ClueGridDraft(),
) {
    /**
     * What the type's misread check finds wrong with this board — the list that turns
     * a batch tile red. Sudoku has no such check.
     */
    fun problems(type: AuthoringType): List<String> = when (type) {
        AuthoringType.SUDOKU -> emptyList()
        AuthoringType.NONOGRAM -> NonogramAuthoring.problems(nonogram)
        AuthoringType.KAKURO -> KakuroAuthoring.problems(kakuro)
        AuthoringType.SLITHERLINK -> SlitherlinkAuthoring.problems(slitherlink)
        AuthoringType.NURIKABE -> NurikabeAuthoring.problems(nurikabe)
        AuthoringType.HEYAWAKE -> HeyawakeAuthoring.problems(heyawake)
        AuthoringType.PICTO_LINK -> PictoLinkAuthoring.problems(pictoLink)
        AuthoringType.YAJILIN -> YajilinAuthoring.problems(yajilin)
        AuthoringType.RIPPLE_EFFECT -> RippleEffectAuthoring.problems(rippleEffect)
        AuthoringType.MASYU -> MasyuAuthoring.problems(masyu)
        AuthoringType.SLALOM -> SlalomAuthoring.problems(slalom)
        AuthoringType.SHAKASHAKA -> ShakashakaAuthoring.problems(shakashaka)
        AuthoringType.AKARI -> AkariAuthoring.problems(akari)
        AuthoringType.NUMBER_LINK -> NumberLinkAuthoring.problems(numberLink)
        AuthoringType.SHIKAKU -> ShikakuAuthoring.problems(shikaku)
        AuthoringType.FILLOMINO -> FillominoAuthoring.problems(fillomino)
    }

    /**
     * The part of [problems] that makes the board unrepresentable as its type's canon
     * (heyawake rooms that aren't rectangles, ripple effect walls that end inside a room,
     * a slalom gate with two numbers). Unlike the rest these can't be overridden: the
     * board can't be created or saved until they're fixed.
     */
    fun formatProblems(type: AuthoringType): List<String> = when (type) {
        AuthoringType.HEYAWAKE -> HeyawakeAuthoring.formatProblems(heyawake)
        AuthoringType.RIPPLE_EFFECT -> RippleEffectAuthoring.formatProblems(rippleEffect)
        AuthoringType.SLALOM -> SlalomAuthoring.formatProblems(slalom)
        else -> emptyList()
    }

    /** The board as its type's canon, plus the width/height stored beside it. */
    fun toCanon(type: AuthoringType): CanonBoard = when (type) {
        AuthoringType.SUDOKU -> CanonBoard(
            SudokuAuthoring.canonFromUserValues(userValues),
            SudokuAuthoring.SIZE,
            SudokuAuthoring.SIZE,
        )
        AuthoringType.NONOGRAM ->
            CanonBoard(NonogramAuthoring.canonFromDraft(nonogram), nonogram.cols, nonogram.rows)
        AuthoringType.KAKURO ->
            CanonBoard(KakuroAuthoring.canonFromDraft(kakuro), kakuro.cols, kakuro.rows)
        AuthoringType.SLITHERLINK ->
            CanonBoard(SlitherlinkAuthoring.canonFromDraft(slitherlink), slitherlink.cols, slitherlink.rows)
        AuthoringType.NURIKABE ->
            CanonBoard(NurikabeAuthoring.canonFromDraft(nurikabe), nurikabe.cols, nurikabe.rows)
        AuthoringType.HEYAWAKE ->
            CanonBoard(HeyawakeAuthoring.canonFromDraft(heyawake), heyawake.width, heyawake.height)
        AuthoringType.PICTO_LINK ->
            CanonBoard(PictoLinkAuthoring.canonFromDraft(pictoLink), pictoLink.cols, pictoLink.rows)
        AuthoringType.YAJILIN ->
            CanonBoard(YajilinAuthoring.canonFromDraft(yajilin), yajilin.cols, yajilin.rows)
        AuthoringType.RIPPLE_EFFECT ->
            CanonBoard(RippleEffectAuthoring.canonFromDraft(rippleEffect), rippleEffect.width, rippleEffect.height)
        AuthoringType.MASYU ->
            CanonBoard(MasyuAuthoring.canonFromDraft(masyu), masyu.cols, masyu.rows)
        AuthoringType.SLALOM ->
            CanonBoard(SlalomAuthoring.canonFromDraft(slalom), slalom.cols, slalom.rows)
        AuthoringType.SHAKASHAKA ->
            CanonBoard(ShakashakaAuthoring.canonFromDraft(shakashaka), shakashaka.cols, shakashaka.rows)
        AuthoringType.AKARI ->
            CanonBoard(AkariAuthoring.canonFromDraft(akari), akari.cols, akari.rows)
        AuthoringType.NUMBER_LINK ->
            CanonBoard(NumberLinkAuthoring.canonFromDraft(numberLink), numberLink.cols, numberLink.rows)
        AuthoringType.SHIKAKU ->
            CanonBoard(ShikakuAuthoring.canonFromDraft(shikaku), shikaku.cols, shikaku.rows)
        AuthoringType.FILLOMINO ->
            CanonBoard(FillominoAuthoring.canonFromDraft(fillomino), fillomino.cols, fillomino.rows)
    }

    companion object {
        /** Seed a board of [type] from a canon (a parser result or a stored question's). */
        fun fromCanon(type: AuthoringType, canon: JsonObject): BoardDraft = when (type) {
            AuthoringType.SUDOKU -> BoardDraft(userValues = SudokuAuthoring.userValuesFromCanon(canon))
            AuthoringType.NONOGRAM -> BoardDraft(nonogram = NonogramAuthoring.draftFromCanon(canon))
            AuthoringType.KAKURO -> BoardDraft(kakuro = KakuroAuthoring.draftFromCanon(canon))
            AuthoringType.SLITHERLINK -> BoardDraft(slitherlink = SlitherlinkAuthoring.draftFromCanon(canon))
            AuthoringType.NURIKABE -> BoardDraft(nurikabe = NurikabeAuthoring.draftFromCanon(canon))
            AuthoringType.HEYAWAKE -> BoardDraft(heyawake = HeyawakeAuthoring.draftFromCanon(canon))
            AuthoringType.PICTO_LINK -> BoardDraft(pictoLink = PictoLinkAuthoring.draftFromCanon(canon))
            AuthoringType.YAJILIN -> BoardDraft(yajilin = YajilinAuthoring.draftFromCanon(canon))
            AuthoringType.RIPPLE_EFFECT -> BoardDraft(rippleEffect = RippleEffectAuthoring.draftFromCanon(canon))
            AuthoringType.MASYU -> BoardDraft(masyu = MasyuAuthoring.draftFromCanon(canon))
            AuthoringType.SLALOM -> BoardDraft(slalom = SlalomAuthoring.draftFromCanon(canon))
            AuthoringType.SHAKASHAKA -> BoardDraft(shakashaka = ShakashakaAuthoring.draftFromCanon(canon))
            AuthoringType.AKARI -> BoardDraft(akari = AkariAuthoring.draftFromCanon(canon))
            AuthoringType.NUMBER_LINK -> BoardDraft(numberLink = NumberLinkAuthoring.draftFromCanon(canon))
            AuthoringType.SHIKAKU -> BoardDraft(shikaku = ShikakuAuthoring.draftFromCanon(canon))
            AuthoringType.FILLOMINO -> BoardDraft(fillomino = FillominoAuthoring.draftFromCanon(canon))
        }
    }
}

/** A board serialized for the API: its canon JSON and the stored width/height. */
data class CanonBoard(val canon: JsonObject, val width: Int, val height: Int)
