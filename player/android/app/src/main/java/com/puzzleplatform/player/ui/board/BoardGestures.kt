package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.positionChanged

/**
 * Board input gesture detector shared by every puzzle renderer, replacing the
 * one-finger-pans model (which fought drawing puzzles for the single-finger drag).
 *
 * The gesture model here separates content from navigation by finger count:
 *  - one finger, released without moving      -> [onTap]      (select a cell)
 *  - one finger, dragged (only if [drawEnabled]) -> [onDragStart]/[onDrag]/[onDragEnd]
 *    (draw a loop/edge; the caller maps positions to cells)
 *  - two or more fingers (only if [transformEnabled]) -> [onTransform] (pan + pinch-zoom)
 *
 * When [drawEnabled] is false (digit boards), a one-finger drag is left unconsumed
 * so the surrounding scroll container can take it — the board only reacts to taps.
 * A second finger landing mid-draw cancels the draw and switches to pan/zoom.
 */
suspend fun PointerInputScope.detectBoardGestures(
    transformEnabled: Boolean,
    drawEnabled: Boolean,
    onTap: (Offset) -> Unit,
    onDragStart: (Offset) -> Unit,
    onDrag: (Offset) -> Unit,
    onDragEnd: () -> Unit,
    onTransform: (centroid: Offset, pan: Offset, zoom: Float) -> Unit,
) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val touchSlop = viewConfiguration.touchSlop

        // 0 = undecided, 1 = one-finger draw, 2 = two-finger transform.
        var mode = 0
        var slopExceeded = false
        var everMultiTouch = false
        var dragging = false

        while (true) {
            val event = awaitPointerEvent()
            val pressed = event.changes.filter { it.pressed }
            if (pressed.isEmpty()) break
            if (pressed.size >= 2) everMultiTouch = true

            when (mode) {
                0 -> {
                    if (pressed.size >= 2) {
                        if (transformEnabled) mode = 2
                        // else: ignore the extra finger; can't draw with two.
                    } else {
                        val c = event.changes.firstOrNull { it.id == down.id } ?: pressed.first()
                        if ((c.position - down.position).getDistance() > touchSlop) {
                            slopExceeded = true
                            if (drawEnabled) {
                                mode = 1
                                onDragStart(down.position)
                                dragging = true
                                onDrag(c.position)
                                c.consume()
                            }
                            // else: leave unconsumed so a parent scroll can claim it.
                        }
                    }
                }
                1 -> {
                    if (pressed.size >= 2 && transformEnabled) {
                        if (dragging) { onDragEnd(); dragging = false }
                        mode = 2
                    } else {
                        val c = pressed.firstOrNull { it.id == down.id } ?: pressed.first()
                        onDrag(c.position)
                        c.consume()
                    }
                }
                else -> { // 2: pan + pinch-zoom about the touch centroid
                    val zoom = event.calculateZoom()
                    val pan = event.calculatePan()
                    if (zoom != 1f || pan != Offset.Zero) {
                        onTransform(event.calculateCentroid(useCurrent = true), pan, zoom)
                    }
                    event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            }
        }

        when {
            mode == 0 && !slopExceeded && !everMultiTouch -> onTap(down.position)
            mode == 1 && dragging -> onDragEnd()
        }
    }
}
