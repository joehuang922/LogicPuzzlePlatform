package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Shared pieces of [PuzzleEngine.matchesSolution] (the "on track" check), the twin of
 * frontend/src/utils/solutionCheck.ts. A type builds an [Expect] from its stored
 * solution and [matches] runs it over the player's marks: any mark that disagrees makes
 * it false; keys it doesn't read (notes, cleared cells) are skipped.
 */
internal object SolutionCheck {
    /** Does mark [value] at [key] agree with the solution? null: not a mark the check reads. */
    fun interface Expect {
        fun check(key: String, value: Int): Boolean?
    }

    fun matches(userValues: Map<String, Int>, expect: Expect?): Boolean? {
        expect ?: return null
        for ((key, value) in userValues) if (expect.check(key, value) == false) return false
        return true
    }

    /** [element] as a rows x cols grid of integers, or null when absent or another shape. */
    fun grid(element: Any?, rows: Int, cols: Int): Array<IntArray>? {
        val outer = element as? JsonArray ?: return null
        if (outer.size != rows) return null
        return Array(rows) { r ->
            val row = outer[r] as? JsonArray ?: return null
            if (row.size != cols) return null
            IntArray(cols) { c -> (row[c] as? JsonPrimitive)?.intOrNull ?: return null }
        }
    }

    /** "a,b" after [prefix] -> (a, b); null for any other key. */
    fun pair(key: String, prefix: String = ""): Pair<Int, Int>? {
        if (!key.startsWith(prefix)) return null
        val parts = key.substring(prefix.length).split(",")
        if (parts.size != 2) return null
        val a = parts[0].toIntOrNull() ?: return null
        val b = parts[1].toIntOrNull() ?: return null
        return a to b
    }

    /** A digit entered at "col,row" must be the solution's digit there (notes ignored). */
    fun digits(solution: Array<IntArray>) = Expect { key, value ->
        val (c, r) = pair(key) ?: return@Expect null
        if (value !in 1..9) return@Expect null
        solution.getOrNull(r)?.getOrNull(c) == value
    }

    /**
     * A two-state mark under [prefix]: [on] must be 1 in the solution, [off] must be 0.
     * Keys are "row,col" when [rowFirst], else "col,row".
     */
    fun onOff(solution: Array<IntArray>, prefix: String, on: Int, off: Int, rowFirst: Boolean) = Expect { key, value ->
        val (a, b) = pair(key, prefix) ?: return@Expect null
        if (value != on && value != off) return@Expect null
        val (r, c) = if (rowFirst) a to b else b to a
        val want = solution.getOrNull(r)?.getOrNull(c) ?: return@Expect null
        want == (if (value == on) 1 else 0)
    }
}
