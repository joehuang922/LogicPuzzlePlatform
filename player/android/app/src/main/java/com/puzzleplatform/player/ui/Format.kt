package com.puzzleplatform.player.ui

/** Format seconds as HH:MM:SS, matching the web client's formatElapsed. */
fun formatElapsed(seconds: Int): String {
    val safe = seconds.coerceAtLeast(0)
    val h = safe / 3600
    val m = (safe % 3600) / 60
    val s = safe % 60
    return "%02d:%02d:%02d".format(h, m, s)
}

val DIFFICULTY_LABELS = mapOf(
    1 to "Very easy",
    2 to "Easy",
    3 to "Normal",
    4 to "Hard",
    5 to "Super hard",
)
