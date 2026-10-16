package com.puzzleplatform.player.ui.board

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage

/** Furthest zoom-in; past this, pinching does nothing more. */
private const val MAX_SCALE = 5f

/**
 * A pinch-to-zoom / drag-to-pan image, used so the Admin reviewer can read a source
 * puzzle photo closely while fixing OCR'd digits on the board beside it. Fit-centered
 * at rest; pan is clamped to the scaled bounds so the image can't be flung off-screen,
 * and a double-tap toggles between fit and 2× (and recenters). Reusable, but today
 * only the batch-authoring review uses it.
 */
@Composable
fun ZoomableImage(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier.clipToBounds()) {
        val maxW = constraints.maxWidth.toFloat()
        val maxH = constraints.maxHeight.toFloat()

        var scale by remember { mutableStateOf(1f) }
        var offset by remember { mutableStateOf(Offset.Zero) }

        // At scale s the content overflows the viewport by (s-1) on each axis; allow
        // panning only within that overflow (half on each side), so edges stay reachable
        // but the image never leaves the frame.
        fun clamp(o: Offset, s: Float): Offset {
            val maxX = maxW * (s - 1f) / 2f
            val maxY = maxH * (s - 1f) / 2f
            return Offset(o.x.coerceIn(-maxX, maxX), o.y.coerceIn(-maxY, maxY))
        }

        val transformState = rememberTransformableState { zoomChange, panChange, _ ->
            val newScale = (scale * zoomChange).coerceIn(1f, MAX_SCALE)
            scale = newScale
            offset = clamp(offset + panChange, newScale)
        }

        AsyncImage(
            model = model,
            contentDescription = contentDescription,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offset.x
                    translationY = offset.y
                }
                .transformable(transformState)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = {
                            if (scale > 1f) {
                                scale = 1f
                                offset = Offset.Zero
                            } else {
                                scale = 2f
                            }
                        },
                    )
                },
        )
    }
}
