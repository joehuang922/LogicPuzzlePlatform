package com.puzzleplatform.player.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlin.math.max

/**
 * Turns an album image (a content:// Uri from the system photo picker) into the
 * base64 JPEG the OCR parser expects.
 *
 * Phone photos are often 10+ MP; sending them whole both risks the Function
 * URL's ~6 MB request cap and slows OCR for no accuracy gain. We downscale the
 * longest side to [MAX_DIMENSION] and re-encode JPEG at [JPEG_QUALITY], which
 * keeps grid lines and printed digits crisp while cutting payload size.
 */
object ImageInput {

    private const val MAX_DIMENSION = 2000
    private const val JPEG_QUALITY = 85

    /**
     * Decode, downscale, re-encode, and base64-encode [uri].
     *
     * @throws IllegalArgumentException if the Uri can't be opened or decoded.
     */
    fun toBase64Jpeg(context: Context, uri: Uri): String {
        val bitmap = decodeDownsampled(context, uri)
            ?: throw IllegalArgumentException("Could not read the selected image")
        val scaled = scaleToMax(bitmap)
        if (scaled !== bitmap) bitmap.recycle()
        return try {
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } finally {
            scaled.recycle()
        }
    }

    /**
     * Decode with an inSampleSize that gets us near [MAX_DIMENSION] without
     * loading the full-resolution bitmap into memory first (a bounds-only pass
     * reads the dimensions, then we pick a power-of-two subsample).
     */
    private fun decodeDownsampled(context: Context, uri: Uri): Bitmap? {
        val resolver = context.contentResolver

        // Bounds-only pass: inJustDecodeBounds makes decodeStream return null by
        // design (it only fills bounds.outWidth/outHeight), so guard the *stream*,
        // not the decode result — otherwise this throws on every successful open.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        (resolver.openInputStream(uri)
            ?: throw IllegalArgumentException("Could not open the selected image"))
            .use { BitmapFactory.decodeStream(it, null, bounds) }

        val longest = max(bounds.outWidth, bounds.outHeight)
        if (longest <= 0) return null

        var sample = 1
        while (longest / (sample * 2) >= MAX_DIMENSION) sample *= 2

        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        return resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
    }

    /** Exactly scale [bitmap] so its longest side is [MAX_DIMENSION] (down only). */
    private fun scaleToMax(bitmap: Bitmap): Bitmap {
        val longest = max(bitmap.width, bitmap.height)
        if (longest <= MAX_DIMENSION) return bitmap
        val ratio = MAX_DIMENSION.toFloat() / longest
        val w = (bitmap.width * ratio).toInt().coerceAtLeast(1)
        val h = (bitmap.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, w, h, true)
    }
}
