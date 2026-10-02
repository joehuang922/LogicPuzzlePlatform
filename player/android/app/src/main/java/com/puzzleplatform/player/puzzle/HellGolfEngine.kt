package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Hell Golf (puzzle type 19). Ports:
 *  - answer extraction from frontend/src/extractors/hellGolf.ts
 *  - progress from frontend/src/progress/hellGolf.ts
 *  - move legality + completion from frontend/src/components/HellGolfBoard.tsx
 *    (tryMove / validateSolution).
 *
 * canonRepr: { lakes: int[][], balls: {r,c,n}[], goals: [r,c][] }
 *   - lakes: height x width, 1 = lake (may not be stopped on), 0 = normal. Board
 *     dimensions derive from this grid.
 *   - balls: starting cell (r,c) and starting number n (the length of the first move).
 *   - goals: 'H' marks; count equals balls.length.
 *
 * answer: { trails: { path: [r,c][] }[] } aligned by index with balls. Each trail is
 * the ordered list of cells its ball *stops* on, starting at the ball origin and
 * ending on a goal. The move from path[k] to path[k+1] is a straight run of length
 * (n - k); a ball lands on a goal to finish.
 *
 * User input rides in the flat userValues map, matching the web client's transport
 * exactly so extracted answers are identical: a stop is keyed "t:<ballIdx>:<stepIdx>"
 * -> encoded cell (r*cols + c + 1). stepIdx is the 1-based position in the ball's
 * path (the origin, position 0, is implicit and never stored). There is no digit
 * entry and no pencil-mark notes — the board commits whole moves.
 */
object HellGolfEngine : PuzzleEngine {
    override val puzzleType: Int = 19

    data class Ball(val r: Int, val c: Int, val n: Int)
    data class Cell(val r: Int, val c: Int)

    /** Parsed canonical board. [cols] is 0 for a malformed/empty lakes grid. */
    class Canon(
        val lakes: List<List<Int>>,
        val balls: List<Ball>,
        val goals: List<Cell>,
    ) {
        val rows: Int = lakes.size
        val cols: Int = lakes.firstOrNull()?.size ?: 0
        val goalKeys: Set<String> = goals.map { "${it.r},${it.c}" }.toHashSet()
        val originKeys: Set<String> = balls.map { "${it.r},${it.c}" }.toHashSet()

        fun isLake(r: Int, c: Int): Boolean =
            r in 0 until rows && c in 0 until cols && lakes[r].getOrNull(c) == 1
    }

    /** Flat userValues key for the [step]-th stop of ball [ball] (1-based). */
    fun stepKey(ball: Int, step: Int): String = "t:$ball:$step"

    /** Encode a cell as it rides in userValues (r*cols + c + 1); 0 is never a cell. */
    fun encode(r: Int, c: Int, cols: Int): Int = r * cols + c + 1

    /** Parse the canonical board; missing/invalid pieces degrade to empty lists. */
    fun parseCanon(puzzle: Puzzle): Canon {
        val obj = puzzle.canonRepr
        val lakes = (obj["lakes"] as? JsonArray)?.map { rowEl ->
            (rowEl as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList()
        } ?: emptyList()
        val balls = (obj["balls"] as? JsonArray)?.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val r = (o["r"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val c = (o["c"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val n = (o["n"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            Ball(r, c, n)
        } ?: emptyList()
        val goals = (obj["goals"] as? JsonArray)?.mapNotNull { el ->
            val a = el as? JsonArray ?: return@mapNotNull null
            val r = (a.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val c = (a.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            Cell(r, c)
        } ?: emptyList()
        return Canon(lakes, balls, goals)
    }

    /**
     * Rebuild each ball's trail (ordered stop cells, origin first) from the flat
     * userValues map — the materialized form the board and the pure logic share.
     */
    fun trailsFrom(canon: Canon, userValues: Map<String, Int>): List<List<Cell>> {
        val cols = canon.cols
        val steps = List(canon.balls.size) { sortedMapOf<Int, Cell>() }
        if (cols > 0) {
            for ((key, v) in userValues) {
                if (v == 0 || !key.startsWith("t:")) continue
                val parts = key.removePrefix("t:").split(":")
                if (parts.size != 2) continue
                val b = parts[0].toIntOrNull() ?: continue
                val s = parts[1].toIntOrNull() ?: continue
                if (b !in canon.balls.indices) continue
                val encoded = v - 1
                steps[b][s] = Cell(encoded / cols, encoded % cols)
            }
        }
        return canon.balls.mapIndexed { i, ball ->
            buildList {
                add(Cell(ball.r, ball.c))
                addAll(steps[i].values)
            }
        }
    }

    /** Current number of ball [i] = starting number minus moves already made. */
    fun currentNumber(canon: Canon, trails: List<List<Cell>>, i: Int): Int =
        canon.balls[i].n - (trails[i].size - 1)

    /** The ball's current resting cell (the head of its trail). */
    fun headOf(trails: List<List<Cell>>, i: Int): Cell = trails[i].last()

    /** True once ball [i]'s trail ends on a goal cell. */
    fun endedOn(canon: Canon, trails: List<List<Cell>>, i: Int): Boolean {
        val h = headOf(trails, i)
        return canon.goalKeys.contains("${h.r},${h.c}")
    }

    /** A ball can move while it hasn't landed on a goal and still has moves left. */
    fun canMove(canon: Canon, trails: List<List<Cell>>, i: Int): Boolean =
        !endedOn(canon, trails, i) && currentNumber(canon, trails, i) > 0

    // Cells traversed going straight from `a` to `b`, inclusive of `b`, exclusive of `a`.
    private fun cellsBetween(a: Cell, b: Cell): List<Cell> {
        val dr = Integer.signum(b.r - a.r)
        val dc = Integer.signum(b.c - a.c)
        val out = mutableListOf<Cell>()
        var r = a.r
        var c = a.c
        while (r != b.r || c != b.c) {
            r += dr; c += dc
            out.add(Cell(r, c))
        }
        return out
    }

    // Every cell a trail occupies: all stops plus the cells its segments slide over.
    private fun coveredCells(path: List<Cell>): List<Cell> {
        if (path.isEmpty()) return emptyList()
        val out = mutableListOf(path[0])
        for (i in 1 until path.size) out.addAll(cellsBetween(path[i - 1], path[i]))
        return out
    }

    /**
     * The landing cell if moving ball [i] by its current number in (dr,dc) is legal,
     * else null (port of HellGolfBoard.tsx tryMove). A move may slide over a lake but
     * not stop on one, may not cross any trail (incl. its own) or a ball origin, and
     * may only reach an unclaimed goal as its final landing.
     */
    fun tryMove(canon: Canon, trails: List<List<Cell>>, i: Int, dr: Int, dc: Int): Cell? {
        val k = currentNumber(canon, trails, i)
        if (k <= 0) return null
        val from = headOf(trails, i)
        val traversed = cellsBetween(from, Cell(from.r + dr * k, from.c + dc * k))
        if (traversed.isEmpty()) return null
        val landing = traversed.last()

        val otherCovered = HashSet<String>()
        trails.forEachIndexed { j, path ->
            if (j != i) for (cell in coveredCells(path)) otherCovered.add("${cell.r},${cell.c}")
        }
        val selfCovered = coveredCells(trails[i]).map { "${it.r},${it.c}" }.toHashSet()
        val occupiedGoals = HashSet<String>()
        trails.forEachIndexed { j, path ->
            if (j != i) {
                val last = path.last()
                val kk = "${last.r},${last.c}"
                if (canon.goalKeys.contains(kk)) occupiedGoals.add(kk)
            }
        }

        val fromKey = "${from.r},${from.c}"
        for ((idx, cell) in traversed.withIndex()) {
            val isLast = idx == traversed.size - 1
            if (cell.r < 0 || cell.r >= canon.rows || cell.c < 0 || cell.c >= canon.cols) return null
            val kk = "${cell.r},${cell.c}"
            if (otherCovered.contains(kk)) return null // would cross another trail
            if (selfCovered.contains(kk)) return null // would self-intersect
            if (canon.originKeys.contains(kk) && kk != fromKey) return null // crosses a ball
            if (canon.goalKeys.contains(kk)) {
                if (!isLast) return null // may not slide over a goal
                if (occupiedGoals.contains(kk)) return null // goal already taken
            }
        }
        if (canon.isLake(landing.r, landing.c)) return null // may not stop on a lake
        return landing
    }

    /** Legal landing cells for ball [i] in its current state (the four orthogonals). */
    fun reachable(canon: Canon, trails: List<List<Cell>>, i: Int): List<Cell> {
        if (i !in canon.balls.indices || !canMove(canon, trails, i)) return emptyList()
        return listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)
            .mapNotNull { (dr, dc) -> tryMove(canon, trails, i, dr, dc) }
    }

    /** The ball (if any) currently resting on [cell]. */
    fun ballAtHead(canon: Canon, trails: List<List<Cell>>, cell: Cell): Int? {
        for (i in canon.balls.indices) {
            val h = headOf(trails, i)
            if (h.r == cell.r && h.c == cell.c) return i
        }
        return null
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val canon = parseCanon(puzzle)
        val trails = trailsFrom(canon, userValues)
        val arr = JsonArray(trails.map { path ->
            JsonObject(
                mapOf(
                    "path" to JsonArray(path.map { cell ->
                        JsonArray(listOf(JsonPrimitive(cell.r), JsonPrimitive(cell.c)))
                    }),
                ),
            )
        })
        return JsonObject(mapOf("trails" to arr))
    }

    /**
     * Progress = (balls currently resting on a goal / total balls) * 100, matching
     * progress/hellGolf.ts. 100% only when every ball rests on a distinct goal.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val canon = parseCanon(puzzle)
        val total = canon.balls.size
        if (total == 0) return 0.0
        val trails = trailsFrom(canon, userValues)
        var onGoal = 0
        for (i in 0 until total) if (endedOn(canon, trails, i)) onGoal++
        return onGoal.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val canon = parseCanon(puzzle)
        val cols = canon.cols
        if (cols == 0) return emptyMap()
        val trailsArr = answer["trails"] as? JsonArray ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        for (i in canon.balls.indices) {
            val t = trailsArr.getOrNull(i) as? JsonObject ?: continue
            val path = t["path"] as? JsonArray ?: continue
            // Position 0 is the implicit origin; store stops 1..n.
            for (s in 1 until path.size) {
                val cell = path[s] as? JsonArray ?: continue
                val r = (cell.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: continue
                val c = (cell.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: continue
                result[stepKey(i, s)] = encode(r, c, cols)
            }
        }
        return result
    }

    /**
     * True when every ball's trail ends on a distinct goal (port of HellGolfBoard.tsx
     * validateSolution). Per-move legality is enforced incrementally by [tryMove], so
     * completion only has to confirm the endpoints form a ball/goal bijection.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val canon = parseCanon(puzzle)
        if (canon.balls.isEmpty()) return false
        val trails = trailsFrom(canon, userValues)
        val used = HashSet<String>()
        for (path in trails) {
            if (path.isEmpty()) return false
            val last = path.last()
            val kk = "${last.r},${last.c}"
            if (!canon.goalKeys.contains(kk)) return false // must end on a goal
            if (!used.add(kk)) return false // bijection
        }
        return used.size == canon.goals.size
    }
}
