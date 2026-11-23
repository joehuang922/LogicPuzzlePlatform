package com.puzzleplatform.player.puzzle

/**
 * Title normalizer for a collection's questions; twin of the web admin's
 * `utils/titleNormalize.ts`. Parsers name questions with a number ("12",
 * "Q12. Name", "第12問"); without leading zeros, title sorting reads 1, 10, 11, ...,
 * 2, 20. A pattern like "Q<number>. <text>" rewrites every numbered title with its
 * number zero-padded to the widest number in the set.
 *
 * A title splits at its first number: what comes before it is dropped (the pattern
 * supplies it), what follows it, past any separator, is the text. Titles with no
 * number are left alone.
 */
object TitleNormalize {
    const val NUMBER_TOKEN = "<number>"
    const val TEXT_TOKEN = "<text>"

    data class Parsed(
        val prefix: String,
        val number: Long,
        val separator: String,
        val text: String,
    )

    data class Item(val id: String, val puzzleType: Int, val title: String?)

    data class Change(
        val id: String,
        val puzzleType: Int,
        val oldTitle: String?,
        val newTitle: String?,
        /** A rename leaves two questions of the same type with the same title. */
        val conflict: Boolean,
    ) {
        val renamed: Boolean get() = newTitle != oldTitle
    }

    private val NUMBER_RE = Regex("[0-9０-９]+")
    private val SEPARATOR_RE = Regex("^[\\s.:：．、。,，\\-–—)）]*")

    private fun toAscii(digits: String): String =
        digits.map { if (it in '０'..'９') '0' + (it - '０') else it }.joinToString("")

    fun parse(title: String?): Parsed? {
        if (title.isNullOrEmpty()) return null
        val m = NUMBER_RE.find(title) ?: return null
        val rest = title.substring(m.range.last + 1)
        val separator = SEPARATOR_RE.find(rest)!!.value
        return Parsed(
            prefix = title.substring(0, m.range.first),
            number = toAscii(m.value).toBigInteger().toLong(),
            separator = separator,
            text = rest.substring(separator.length).trim(),
        )
    }

    private fun count(s: String, token: String) = s.split(token).size - 1

    /** A pattern must hold exactly one <number>; <text> is optional. */
    fun patternError(pattern: String): String? = when {
        count(pattern, NUMBER_TOKEN) == 0 -> "Pattern needs $NUMBER_TOKEN"
        count(pattern, NUMBER_TOKEN) > 1 -> "Pattern can hold only one $NUMBER_TOKEN"
        count(pattern, TEXT_TOKEN) > 1 -> "Pattern can hold only one $TEXT_TOKEN"
        else -> null
    }

    /** The pattern most numbered titles already follow, e.g. "Q<number>. <text>". */
    fun suggestPattern(titles: List<String?>): String {
        val counts = LinkedHashMap<String, Int>()
        for (t in titles) {
            val p = parse(t) ?: continue
            val shape = p.prefix + NUMBER_TOKEN + if (p.text.isNotEmpty()) p.separator + TEXT_TOKEN else ""
            counts[shape] = (counts[shape] ?: 0) + 1
        }
        // First shape seen wins a tie, as on web.
        var best = NUMBER_TOKEN
        var bestCount = 0
        for ((shape, c) in counts) if (c > bestCount) { best = shape; bestCount = c }
        return best
    }

    /**
     * Apply the pattern to every item. Numbers are padded to the widest number among
     * all numbered titles; when the pattern has no <text>, a title's text is dropped.
     * Items without a number keep their title. Conflicts are checked per puzzle type
     * (different types may share a title) against every final title, renamed or not.
     */
    fun normalize(items: List<Item>, pattern: String): List<Change> {
        val parsed = items.map { parse(it.title) }
        val width = maxOf(1, parsed.maxOfOrNull { it?.number?.toString()?.length ?: 1 } ?: 1)
        val changes = items.mapIndexed { i, it ->
            val p = parsed[i]
            val newTitle = if (p == null) it.title else pattern
                .replaceFirst(NUMBER_TOKEN, p.number.toString().padStart(width, '0'))
                .replaceFirst(TEXT_TOKEN, p.text)
                .trim()
            Change(it.id, it.puzzleType, it.title, newTitle, conflict = false)
        }
        // Duplicates the normalizer didn't touch were there before; not its conflict.
        val conflicted = changes
            .filter { !it.newTitle.isNullOrEmpty() }
            .groupBy { it.puzzleType to it.newTitle }
            .values
            .filter { g -> g.size > 1 && g.any { it.renamed } }
            .flatten()
            .mapTo(HashSet()) { it.id }
        return changes.map { if (it.id in conflicted) it.copy(conflict = true) else it }
    }
}
