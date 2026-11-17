package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Whimsical Knight (puzzle type 37). Ports frontend/src/components/whimsicalKnightRules.ts
 * and its extractor (extractors/whimsicalKnight.ts) and progress (progress/whimsicalKnight.ts).
 *
 * canonRepr: { rows, cols (dot counts), gray: (rows-1) x (cols-1) 0/1,
 *   circles: [{dr, dc}], squares: [{dr, dc}] } — doubled lattice coordinates, dot (r, c)
 *   is (2r, 2c); a circle sits on a dot or an orthogonal midpoint, a square on a dot.
 *
 * answer: { segments: [[[r1, c1], [r2, c2]], ...] } — smaller dot first, sorted.
 *
 * userValues: "s:r1,c1,r2,c2" -> 1 for each drawn segment (smaller dot first), matching
 * the web board exactly.
 */
object WhimsicalKnightEngine : PuzzleEngine {
    override val puzzleType: Int = 37

    /** A dot as (row, col). */
    data class Dot(val r: Int, val c: Int) : Comparable<Dot> {
        override fun compareTo(other: Dot): Int = compareValuesBy(this, other, { it.r }, { it.c })
    }

    /** A segment, smaller dot first. */
    data class Segment(val a: Dot, val b: Dot)

    data class Point(val dr: Int, val dc: Int) {
        val onDot: Boolean get() = dr % 2 == 0 && dc % 2 == 0
    }

    data class Board(
        val rows: Int,
        val cols: Int,
        val gray: List<List<Int>>,
        val circles: List<Point>,
        val squares: List<Point>,
    ) {
        fun isGray(r: Int, c: Int): Boolean = gray.getOrNull(r)?.getOrNull(c) == 1

        /** Circles then squares, the order clue indices refer to. */
        val clues: List<Pair<Boolean, Point>> get() = circles.map { true to it } + squares.map { false to it }
    }

    fun segment(p: Dot, q: Dot): Segment = if (p <= q) Segment(p, q) else Segment(q, p)

    fun key(s: Segment): String = "s:${s.a.r},${s.a.c},${s.b.r},${s.b.c}"

    fun parseKey(key: String): Segment? {
        if (!key.startsWith("s:")) return null
        val n = key.substring(2).split(",").map { it.toIntOrNull() ?: return null }
        if (n.size != 4) return null
        return segment(Dot(n[0], n[1]), Dot(n[2], n[3]))
    }

    fun isStep(p: Dot, q: Dot): Boolean {
        val dr = abs(p.r - q.r)
        val dc = abs(p.c - q.c)
        return dr + dc == 1 || (dr == 1 && dc == 2) || (dr == 2 && dc == 1)
    }

    fun isKnight(s: Segment): Boolean = abs(s.a.r - s.b.r) + abs(s.a.c - s.b.c) == 3

    /** The two cells (row, col) of a knight segment's 1x2 rectangle. */
    fun knightCells(s: Segment): List<Pair<Int, Int>> {
        val r0 = min(s.a.r, s.b.r)
        val c0 = min(s.a.c, s.b.c)
        return if (abs(s.a.c - s.b.c) == 2) listOf(r0 to c0, r0 to c0 + 1) else listOf(r0 to c0, r0 + 1 to c0)
    }

    fun overGray(board: Board, s: Segment): Boolean = isKnight(s) && knightCells(s).any { (r, c) -> board.isGray(r, c) }

    private fun orient(a: Dot, b: Dot, c: Dot): Int = (b.r - a.r) * (c.c - a.c) - (b.c - a.c) * (c.r - a.r)

    private fun within(a: Dot, b: Dot, c: Dot): Boolean =
        orient(a, b, c) == 0 && c.r in min(a.r, b.r)..max(a.r, b.r) && c.c in min(a.c, b.c)..max(a.c, b.c)

    /** Whether two segments meet anywhere but a shared end dot. */
    fun crosses(s: Segment, t: Segment): Boolean {
        if (s.a == t.a || s.a == t.b || s.b == t.a || s.b == t.b) return false
        val d1 = orient(t.a, t.b, s.a)
        val d2 = orient(t.a, t.b, s.b)
        val d3 = orient(s.a, s.b, t.a)
        val d4 = orient(s.a, s.b, t.b)
        if (d1 * d2 < 0 && d3 * d4 < 0) return true
        return within(t.a, t.b, s.a) || within(t.a, t.b, s.b) || within(s.a, s.b, t.a) || within(s.a, s.b, t.b)
    }

    fun parseBoard(puzzle: Puzzle): Board = parseBoard(puzzle.canonRepr)

    fun parseBoard(canon: JsonObject): Board {
        val rows = ((canon["rows"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val cols = ((canon["cols"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val gray = (canon["gray"] as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList()
        } ?: emptyList()
        fun points(name: String) = (canon[name] as? JsonArray)?.mapNotNull { el ->
            val obj = el as? JsonObject ?: return@mapNotNull null
            val dr = (obj["dr"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val dc = (obj["dc"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            Point(dr, dc).takeIf { dr in 0..2 * (rows - 1) && dc in 0..2 * (cols - 1) }
        } ?: emptyList()
        return Board(rows, cols, gray, points("circles"), points("squares").filter { it.onDot })
    }

    /** Drawn segments, in bounds and legal steps only. */
    fun segments(board: Board, userValues: Map<String, Int>): List<Segment> =
        userValues.mapNotNull { (k, v) -> if (v == 1) parseKey(k) else null }
            .filter { s ->
                listOf(s.a, s.b).all { it.r in 0 until board.rows && it.c in 0 until board.cols } && isStep(s.a, s.b)
            }
            .sortedWith(compareBy({ it.a }, { it.b }))

    private fun dirsAt(segs: List<Segment>, d: Dot): List<Pair<Int, Int>> = segs.mapNotNull { s ->
        when (d) {
            s.a -> (s.b.r - d.r) to (s.b.c - d.c)
            s.b -> (s.a.r - d.r) to (s.a.c - d.c)
            else -> null
        }
    }

    fun clueHolds(isCircle: Boolean, p: Point, segs: List<Segment>): Boolean {
        if (isCircle && !p.onDot) return segs.any { it.a.r + it.b.r == p.dr && it.a.c + it.b.c == p.dc }
        val dirs = dirsAt(segs, Dot(p.dr / 2, p.dc / 2))
        if (dirs.size != 2) return false
        val (u, v) = dirs
        return if (isCircle) u.first == -v.first && u.second == -v.second else u.first * v.first + u.second * v.second == 0
    }

    /** A dot clue with 3+ segments, or 2 that don't go straight (circle) / turn square (square). */
    fun clueBroken(isCircle: Boolean, p: Point, segs: List<Segment>): Boolean {
        if (isCircle && !p.onDot) return false
        val n = dirsAt(segs, Dot(p.dr / 2, p.dc / 2)).size
        return n > 2 || (n == 2 && !clueHolds(isCircle, p, segs))
    }

    /** Indices into [segs] of segments that cross another or are a knight over gray. */
    fun badSegments(board: Board, segs: List<Segment>): Set<Int> {
        val bad = mutableSetOf<Int>()
        for (i in segs.indices) {
            if (overGray(board, segs[i])) bad += i
            for (j in i + 1 until segs.size) {
                if (crosses(segs[i], segs[j])) {
                    bad += i
                    bad += j
                }
            }
        }
        return bad
    }

    fun isSolved(board: Board, segs: List<Segment>): Boolean {
        if (segs.isEmpty() || badSegments(board, segs).isNotEmpty()) return false
        val adj = mutableMapOf<Dot, MutableList<Dot>>()
        for (s in segs) {
            adj.getOrPut(s.a) { mutableListOf() } += s.b
            adj.getOrPut(s.b) { mutableListOf() } += s.a
        }
        if (adj.values.any { it.size != 2 }) return false
        val start = adj.keys.first()
        val seen = mutableSetOf(start)
        val stack = ArrayDeque(listOf(start))
        while (stack.isNotEmpty()) {
            for (n in adj.getValue(stack.removeLast())) if (seen.add(n)) stack.addLast(n)
        }
        if (seen.size != adj.size) return false
        return board.clues.all { (isCircle, p) -> clueHolds(isCircle, p, segs) }
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val segs = segments(parseBoard(puzzle), userValues)
        fun dot(d: Dot) = JsonArray(listOf(JsonPrimitive(d.r), JsonPrimitive(d.c)))
        return JsonObject(mapOf("segments" to JsonArray(segs.map { JsonArray(listOf(dot(it.a), dot(it.b))) })))
    }

    /** Satisfied clues / all clues * 100. Mirrors frontend/src/progress/whimsicalKnight.ts. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val clues = board.clues
        if (clues.isEmpty()) return 0.0
        val segs = segments(board, userValues)
        return clues.count { (isCircle, p) -> clueHolds(isCircle, p, segs) } * 100.0 / clues.size
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val board = parseBoard(puzzle)
        val result = mutableMapOf<String, Int>()
        (answer["segments"] as? JsonArray)?.forEach { el ->
            val pair = el as? JsonArray ?: return@forEach
            fun dot(i: Int): Dot? {
                val d = pair.getOrNull(i) as? JsonArray ?: return null
                val r = (d.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: return null
                val c = (d.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: return null
                return Dot(r, c)
            }
            val p = dot(0) ?: return@forEach
            val q = dot(1) ?: return@forEach
            val inside = listOf(p, q).all { it.r in 0 until board.rows && it.c in 0 until board.cols }
            if (inside && isStep(p, q)) result[key(segment(p, q))] = 1
        }
        return result
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return isSolved(board, segments(board, userValues))
    }
}
