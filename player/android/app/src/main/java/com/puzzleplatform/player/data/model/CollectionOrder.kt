package com.puzzleplatform.player.data.model

/**
 * Id of the default collection that holds puzzles with no collection. The API
 * reads 0 as "no collection" in the puzzle list, progress and manifest endpoints,
 * and Room's listByCollection matches it to rows whose srcCollection is null.
 */
const val DEFAULT_COLLECTION_ID = 0

fun defaultCollection(puzzleCount: Int) = Collection(
    id = DEFAULT_COLLECTION_ID,
    name = "Uncategorized",
    puzzleCount = puzzleCount,
)

/**
 * The order every collection list shows (Home, admin pickers): publisher, then
 * name (both case-insensitive, missing last), then newest publish date first;
 * the default collection always last. Mirrors sortCollections in
 * frontend/src/api/client.ts.
 */
fun List<Collection>.sortedForDisplay(): List<Collection> {
    val (defaults, real) = partition { it.id == DEFAULT_COLLECTION_ID }
    return real.sortedWith(
        compareBy<Collection, String?>(nullsLast()) { it.publisher?.lowercase() }
            .thenBy(nullsLast()) { it.name.lowercase() }
            .thenByDescending(nullsFirst()) { it.publishAt }
    ) + defaults
}
