package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * The Skeleton Puzzle rules shared by play and authoring, a port of
 * frontend/src/components/skeletonPuzzleRules.ts. Pure, so it's unit-testable.
 *
 * Cells: 1 = a cell, 0 = not a cell. A slot is a maximal across or down run of 2+ cells;
 * slots are numbered across first in reading order, then down in reading order, from the
 * canon alone. The player places whole words: userValues "p:<slot>" -> word index + 1.
 * Small kana are written full-size and words compare after that normalisation.
 */
object SkeletonRules {
    data class Word(val word: String, val hint: String? = null)
    data class Mark(val r: Int, val c: Int, val label: String)

    /** The canon, also the authoring draft. */
    data class Board(
        val cells: List<List<Int>> = emptyList(),
        val words: List<Word> = emptyList(),
        val marks: List<Mark> = emptyList(),
    ) {
        val rows: Int get() = cells.size
        val cols: Int get() = cells.firstOrNull()?.size ?: 0
    }

    enum class Dir(val json: String) { ACROSS("across"), DOWN("down") }

    data class Slot(val index: Int, val r: Int, val c: Int, val dir: Dir, val length: Int) {
        val cells: List<Pair<Int, Int>>
            get() = List(length) { i -> if (dir == Dir.ACROSS) r to c + i else r + i to c }
    }

    /** Kana a word may hold: hiragana, katakana (small ones included), ー and iteration marks. Mirrors the API. */
    val KANA = Regex("^[ぁ-ゖゝゞァ-ヺー-ヾ]+$")

    private val SMALL_TO_LARGE = mapOf(
        'ぁ' to 'あ', 'ぃ' to 'い', 'ぅ' to 'う', 'ぇ' to 'え', 'ぉ' to 'お', 'っ' to 'つ',
        'ゃ' to 'や', 'ゅ' to 'ゆ', 'ょ' to 'よ', 'ゎ' to 'わ', 'ゕ' to 'か', 'ゖ' to 'け',
        'ァ' to 'ア', 'ィ' to 'イ', 'ゥ' to 'ウ', 'ェ' to 'エ', 'ォ' to 'オ', 'ッ' to 'ツ',
        'ャ' to 'ヤ', 'ュ' to 'ユ', 'ョ' to 'ヨ', 'ヮ' to 'ワ', 'ヵ' to 'カ', 'ヶ' to 'ケ',
    )

    /** The word's letters as written on the board: small kana full-size. */
    fun boardLetters(word: String): List<String> = word.map { (SMALL_TO_LARGE[it] ?: it).toString() }

    fun parse(canon: JsonObject): Board {
        val cells = (canon["cells"] as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull?.takeIf { v -> v == 1 } ?: 0 } ?: emptyList()
        } ?: emptyList()
        val cols = cells.maxOfOrNull { it.size } ?: 0
        val words = (canon["words"] as? JsonArray)?.mapNotNull { w ->
            val obj = w as? JsonObject ?: return@mapNotNull null
            val word = (obj["word"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            Word(word, (obj["hint"] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() })
        } ?: emptyList()
        val marks = (canon["marks"] as? JsonArray)?.mapNotNull { m ->
            val obj = m as? JsonObject ?: return@mapNotNull null
            val r = (obj["r"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val c = (obj["c"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            Mark(r, c, (obj["label"] as? JsonPrimitive)?.contentOrNull ?: "")
        } ?: emptyList()
        return Board(cells.map { it + List(cols - it.size) { 0 } }, words, marks)
    }

    fun toCanon(board: Board): JsonObject = JsonObject(buildMap {
        put("cells", JsonArray(board.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }))
        put("words", JsonArray(board.words.map { w ->
            JsonObject(buildMap {
                put("word", JsonPrimitive(w.word))
                if (!w.hint.isNullOrBlank()) put("hint", JsonPrimitive(w.hint))
            })
        }))
        if (board.marks.isNotEmpty()) {
            put("marks", JsonArray(board.marks.map { m ->
                JsonObject(mapOf("r" to JsonPrimitive(m.r), "c" to JsonPrimitive(m.c), "label" to JsonPrimitive(m.label)))
            }))
        }
    })

    fun isCell(cells: List<List<Int>>, r: Int, c: Int): Boolean = cells.getOrNull(r)?.getOrNull(c) == 1

    fun findSlots(cells: List<List<Int>>): List<Slot> {
        val rows = cells.size
        val cols = cells.firstOrNull()?.size ?: 0
        val found = mutableListOf<Slot>()
        for (dir in listOf(Dir.ACROSS, Dir.DOWN)) {
            for (r in 0 until rows) for (c in 0 until cols) {
                if (!isCell(cells, r, c)) continue
                val (pr, pc) = if (dir == Dir.ACROSS) r to c - 1 else r - 1 to c
                if (isCell(cells, pr, pc)) continue
                var len = 0
                while (if (dir == Dir.ACROSS) isCell(cells, r, c + len) else isCell(cells, r + len, c)) len++
                if (len >= 2) found += Slot(found.size, r, c, dir, len)
            }
        }
        return found
    }

    /** Slots through (r, c), across first. */
    fun slotsAt(slots: List<Slot>, r: Int, c: Int): List<Slot> = slots.filter { (r to c) in it.cells }

    fun slotKey(slot: Int) = "p:$slot"

    /** slot index -> word index, from userValues "p:<slot>" -> word index + 1. */
    fun placements(values: Map<String, Int>, slotCount: Int, wordCount: Int): Map<Int, Int> = buildMap {
        for ((key, v) in values) {
            if (!key.startsWith("p:")) continue
            val slot = key.drop(2).toIntOrNull() ?: continue
            val word = v - 1
            if (slot in 0 until slotCount && word in 0 until wordCount) put(slot, word)
        }
    }

    /** The letter in each cell, "" where no placed word covers it (across wins a clash). */
    fun grid(board: Board, slots: List<Slot>, placed: Map<Int, Int>): List<List<String>> {
        val grid = board.cells.map { row -> MutableList(row.size) { "" } }
        for (slot in slots.reversed()) {
            val w = placed[slot.index] ?: continue
            val letters = boardLetters(board.words[w].word)
            slot.cells.forEachIndexed { i, (r, c) -> grid[r][c] = letters.getOrElse(i) { "" } }
        }
        return grid
    }

    /** Words that could go in [slot]: its length, unused elsewhere, agreeing with letters already there. */
    fun candidates(board: Board, slots: List<Slot>, placed: Map<Int, Int>, slot: Slot): List<Int> {
        val others = placed - slot.index
        val used = others.values.toSet()
        val grid = grid(board, slots, others)
        return board.words.indices.filter { i ->
            if (i in used) return@filter false
            val letters = boardLetters(board.words[i].word)
            letters.size == slot.length &&
                slot.cells.withIndex().all { (k, rc) -> grid[rc.first][rc.second].let { it == "" || it == letters[k] } }
        }
    }

    fun countCells(cells: List<List<Int>>): Int = cells.sumOf { row -> row.count { it == 1 } }

    fun filledCells(board: Board, slots: List<Slot>, placed: Map<Int, Int>): Int =
        grid(board, slots, placed).sumOf { row -> row.count { it != "" } }

    /** Every word placed once, every slot filled, and crossing words agree. */
    fun isSolved(board: Board, slots: List<Slot>, placed: Map<Int, Int>): Boolean {
        if (slots.isEmpty() || placed.size != slots.size || board.words.size != slots.size) return false
        if (placed.values.toSet().size != placed.size) return false
        val seen = HashMap<Pair<Int, Int>, String>()
        for (slot in slots) {
            val w = placed[slot.index] ?: return false
            val letters = boardLetters(board.words[w].word)
            if (letters.size != slot.length) return false
            for ((k, rc) in slot.cells.withIndex()) {
                val prev = seen.put(rc, letters[k])
                if (prev != null && prev != letters[k]) return false
            }
        }
        return true
    }

    /** Format problems: block create/save (the API's semanticChecks rejects the same). */
    fun formatProblems(board: Board): List<String> = buildList {
        if (board.rows == 0 || board.cols == 0) {
            add("No cells")
            return@buildList
        }
        val slotLengths = findSlots(board.cells).groupingBy { it.length }.eachCount()
        val wordLengths = board.words.groupingBy { it.word.length }.eachCount()
        board.words.forEachIndexed { i, w ->
            if (!KANA.matches(w.word)) add("Word ${i + 1} \"${w.word}\" must be kana (and ー) only")
            if (w.word.length < 2) add("Word ${i + 1} \"${w.word}\" is under 2 letters")
        }
        for (len in (slotLengths.keys + wordLengths.keys).toSortedSet()) {
            val s = slotLengths[len] ?: 0
            val w = wordLengths[len] ?: 0
            if (s != w) {
                add("$s slot${if (s == 1) "" else "s"} of length $len but $w word${if (w == 1) "" else "s"} of $len letter${if (len == 1) "" else "s"}")
            }
        }
        for (m in board.marks) {
            if (!isCell(board.cells, m.r, m.c)) add("Mark ${m.label} at R${m.r + 1}C${m.c + 1} is not on a cell")
        }
    }

    /** Overridable misread warnings: cells in no slot. */
    fun warnings(board: Board): List<String> {
        val covered = findSlots(board.cells).flatMap { it.cells }.toSet()
        return buildList {
            for (r in 0 until board.rows) for (c in 0 until board.cols) {
                if (board.cells[r][c] == 1 && (r to c) !in covered) add("R${r + 1}C${c + 1} is a cell in no slot")
            }
        }
    }

    private val HINTED = Regex("^(.*?)\\s*[（(](.*)[)）]\\s*$")

    /** Parse the editor's word text: one word per line, optional "(hint)" (full- or half-width). */
    fun parseWordLines(text: String): List<Word> = text.lines().map { it.trim() }.filter { it.isNotEmpty() }.map { line ->
        val m = HINTED.matchEntire(line) ?: return@map Word(line)
        Word(m.groupValues[1].trim(), m.groupValues[2].trim().takeIf { it.isNotEmpty() })
    }

    fun wordLines(words: List<Word>): String =
        words.joinToString("\n") { if (it.hint.isNullOrBlank()) it.word else "${it.word} (${it.hint})" }
}

/**
 * Skeleton Puzzle (puzzle type 35). Ports frontend/src/{extractors,progress}/skeletonPuzzle.ts
 * and the completion check in skeletonPuzzleRules.ts. The answer is
 * `{ placements: [{ word, r, c, dir }] }`; userValues are keyed "p:<slot>" -> word index + 1.
 */
object SkeletonPuzzleEngine : PuzzleEngine {
    override val puzzleType: Int = 35

    fun parse(puzzle: Puzzle): SkeletonRules.Board = SkeletonRules.parse(puzzle.canonRepr)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parse(puzzle)
        val slots = SkeletonRules.findSlots(board.cells)
        val placed = SkeletonRules.placements(userValues, slots.size, board.words.size)
        val placements = slots.mapNotNull { s ->
            val w = placed[s.index] ?: return@mapNotNull null
            JsonObject(mapOf(
                "word" to JsonPrimitive(w),
                "r" to JsonPrimitive(s.r),
                "c" to JsonPrimitive(s.c),
                "dir" to JsonPrimitive(s.dir.json),
            ))
        }
        return JsonObject(mapOf("placements" to JsonArray(placements)))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val board = parse(puzzle)
        val slots = SkeletonRules.findSlots(board.cells)
        val list = answer["placements"] as? JsonArray ?: return emptyMap()
        return buildMap {
            for (p in list) {
                val obj = p as? JsonObject ?: continue
                val word = (obj["word"] as? JsonPrimitive)?.intOrNull ?: continue
                val r = (obj["r"] as? JsonPrimitive)?.intOrNull ?: continue
                val c = (obj["c"] as? JsonPrimitive)?.intOrNull ?: continue
                val dir = (obj["dir"] as? JsonPrimitive)?.contentOrNull
                val slot = slots.firstOrNull { it.r == r && it.c == c && it.dir.json == dir } ?: continue
                if (word in board.words.indices) put(SkeletonRules.slotKey(slot.index), word + 1)
            }
        }
    }

    /** Cells holding a kana / all cells * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parse(puzzle)
        val total = SkeletonRules.countCells(board.cells)
        if (total == 0) return 0.0
        val slots = SkeletonRules.findSlots(board.cells)
        val placed = SkeletonRules.placements(userValues, slots.size, board.words.size)
        return (SkeletonRules.filledCells(board, slots, placed).toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parse(puzzle)
        val slots = SkeletonRules.findSlots(board.cells)
        return SkeletonRules.isSolved(board, slots, SkeletonRules.placements(userValues, slots.size, board.words.size))
    }
}
