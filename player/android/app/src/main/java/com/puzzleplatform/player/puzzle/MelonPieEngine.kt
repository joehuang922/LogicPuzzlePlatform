package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Melon Pie (puzzle type 49). Ports frontend/src/components/melonPieRules.ts, the extractor
 * (frontend/src/extractors/melonPie.ts) and progress (frontend/src/progress/melonPie.ts).
 *
 * canonRepr: { width, height, circles: [{ r, c, color }] }: circles on grid points
 * (r 0..height, c 0..width), color 0 white / 1 black / 2 gray.
 *
 * userValues: "h:r,c" = segment (r, c)-(r, c+1), "v:r,c" = segment (r, c)-(r+1, c);
 * value 1 = drawn, 2 = × mark (no line). answer: { edges: { h, v } } holding both.
 */
object MelonPieEngine : PuzzleEngine {
    override val puzzleType: Int = 49

    const val LINE = 1
    const val CROSS = 2

    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    data class Circle(val r: Int, val c: Int, val color: Int)

    data class Board(val width: Int, val height: Int, val circles: List<Circle>) {
        fun circleAt(r: Int, c: Int): Circle? = circles.firstOrNull { it.r == r && it.c == c }
    }

    /** h: (height+1) x width, v: height x (width+1); 0 / LINE / CROSS. */
    class Segments(val h: Array<IntArray>, val v: Array<IntArray>)

    fun parseBoard(puzzle: Puzzle): Board = boardFromCanon(puzzle.canonRepr)

    fun boardFromCanon(canon: JsonObject): Board {
        fun int(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.intOrNull
        val circles = (canon["circles"] as? JsonArray)?.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            Circle(int(o, "r") ?: return@mapNotNull null, int(o, "c") ?: return@mapNotNull null, int(o, "color") ?: 0)
        } ?: emptyList()
        return Board(int(canon, "width") ?: 0, int(canon, "height") ?: 0, circles)
    }

    fun canonOf(board: Board): JsonObject = JsonObject(
        mapOf(
            "width" to JsonPrimitive(board.width),
            "height" to JsonPrimitive(board.height),
            "circles" to JsonArray(board.circles.map { k ->
                JsonObject(mapOf("r" to JsonPrimitive(k.r), "c" to JsonPrimitive(k.c), "color" to JsonPrimitive(k.color)))
            }),
        )
    )

    fun segments(board: Board, userValues: Map<String, Int>): Segments {
        fun value(key: String) = when (val v = userValues[key]) {
            LINE, CROSS -> v
            else -> 0
        }
        return Segments(
            Array(board.height + 1) { r -> IntArray(board.width) { c -> value(hKey(r, c)) } },
            Array(board.height) { r -> IntArray(board.width + 1) { c -> value(vKey(r, c)) } },
        )
    }

    /** The points the drawn segments at (r, c) lead to (web: neighbours). */
    fun neighbours(board: Board, seg: Segments, r: Int, c: Int): List<Pair<Int, Int>> = buildList {
        if (c > 0 && seg.h.getOrNull(r)?.getOrNull(c - 1) == LINE) add(r to c - 1)
        if (c < board.width && seg.h.getOrNull(r)?.getOrNull(c) == LINE) add(r to c + 1)
        if (r > 0 && seg.v.getOrNull(r - 1)?.getOrNull(c) == LINE) add(r - 1 to c)
        if (r < board.height && seg.v.getOrNull(r)?.getOrNull(c) == LINE) add(r + 1 to c)
    }

    private fun segKey(a: Pair<Int, Int>, b: Pair<Int, Int>): String {
        val (p, q) = if (a.first < b.first || (a.first == b.first && a.second < b.second)) a to b else b to a
        return if (p.first == q.first) hKey(p.first, p.second) else vKey(p.first, p.second)
    }

    /** A strand from a circle: the circle it reaches (or null) and the segments walked. */
    data class Strand(val to: Pair<Int, Int>?, val segments: List<String>)

    /** Follow the line from a circle, straight through crossings (web: strandFrom). */
    fun strandFrom(board: Board, seg: Segments, from: Pair<Int, Int>): Strand {
        val first = neighbours(board, seg, from.first, from.second)
        if (first.size != 1) return Strand(null, emptyList())
        val walked = ArrayList<String>()
        var prev = from
        var cur = first[0]
        val limit = 2 * (board.width + 1) * (board.height + 1)
        repeat(limit) {
            walked.add(segKey(prev, cur))
            if (board.circleAt(cur.first, cur.second) != null) return Strand(cur, walked)
            val nb = neighbours(board, seg, cur.first, cur.second)
            val next = when (nb.size) {
                2 -> nb.firstOrNull { it != prev }
                4 -> (2 * cur.first - prev.first) to (2 * cur.second - prev.second)
                else -> null
            } ?: return Strand(null, walked)
            prev = cur
            cur = next
        }
        return Strand(null, walked)
    }

    private fun drawnCount(seg: Segments): Int =
        seg.h.sumOf { row -> row.count { it == LINE } } + seg.v.sumOf { row -> row.count { it == LINE } }

    /** All drawn segments in one piece through shared points (web: connected). */
    fun connected(board: Board, seg: Segments): Boolean {
        val pts = ArrayList<Pair<Int, Int>>()
        for (r in 0..board.height) for (c in 0..board.width) if (neighbours(board, seg, r, c).isNotEmpty()) pts.add(r to c)
        if (pts.isEmpty()) return false
        val seen = hashSetOf(pts[0])
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.addLast(pts[0])
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            for (n in neighbours(board, seg, r, c)) if (seen.add(n)) stack.addLast(n)
        }
        return seen.size == pts.size
    }

    /** The four rules (web: validateMelonPie). */
    fun solved(board: Board, seg: Segments): Boolean {
        if (board.circles.isEmpty()) return false
        for (r in 0..board.height) for (c in 0..board.width) {
            val d = neighbours(board, seg, r, c).size
            val ok = if (board.circleAt(r, c) != null) d == 1 else d == 0 || d == 2 || d == 4
            if (!ok) return false
        }
        val covered = HashSet<String>()
        for (k in board.circles) {
            val s = strandFrom(board, seg, k.r to k.c)
            val end = s.to?.let { board.circleAt(it.first, it.second) } ?: return false
            if (end.color != k.color) return false
            covered.addAll(s.segments)
        }
        if (covered.size != drawnCount(seg)) return false
        return connected(board, seg)
    }

    /** Circles (by index) and plain points ("r,c" pairs) the drawn lines already break. */
    data class Broken(val circles: Set<Int>, val points: Set<Pair<Int, Int>>)

    fun brokenClues(board: Board, userValues: Map<String, Int>): Broken {
        val seg = segments(board, userValues)
        val circles = HashSet<Int>()
        board.circles.forEachIndexed { i, k ->
            if (neighbours(board, seg, k.r, k.c).size > 1) {
                circles.add(i)
                return@forEachIndexed
            }
            val end = strandFrom(board, seg, k.r to k.c).to ?: return@forEachIndexed
            val j = board.circles.indexOfFirst { it.r == end.first && it.c == end.second }
            if (j >= 0 && board.circles[j].color != k.color) {
                circles.add(i)
                circles.add(j)
            }
        }
        val points = HashSet<Pair<Int, Int>>()
        for (r in 0..board.height) for (c in 0..board.width) {
            if (board.circleAt(r, c) == null && neighbours(board, seg, r, c).size == 3) points.add(r to c)
        }
        return Broken(circles, points)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val seg = segments(parseBoard(puzzle), userValues)
        fun grid(a: Array<IntArray>) = JsonArray(a.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(mapOf("edges" to JsonObject(mapOf("h" to grid(seg.h), "v" to grid(seg.v)))))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val edges = answer["edges"] as? JsonObject ?: return emptyMap()
        val out = HashMap<String, Int>()
        for ((kind, key) in listOf("h" to ::hKey, "v" to ::vKey)) {
            (edges[kind] as? JsonArray)?.forEachIndexed { r, row ->
                (row as? JsonArray)?.forEachIndexed { c, x ->
                    val v = (x as? JsonPrimitive)?.intOrNull
                    if (v == LINE || v == CROSS) out[key(r, c)] = v
                }
            }
        }
        return out
    }

    /** Circles whose strand reaches a circle of the same colour, over all circles (web: melonPieProgress). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        if (board.circles.isEmpty()) return 0.0
        val seg = segments(board, userValues)
        val done = board.circles.count { k ->
            val end = strandFrom(board, seg, k.r to k.c).to
            end != null && board.circleAt(end.first, end.second)?.color == k.color
        }
        return done.toDouble() / board.circles.size * 100.0
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return solved(board, segments(board, userValues))
    }
}
