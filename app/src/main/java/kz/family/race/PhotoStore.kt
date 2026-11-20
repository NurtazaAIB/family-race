package kz.family.race

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Игроки = фотографии в папке Pictures/FamilyRace.
 * Имя файла (без расширения) — имя игрока.
 */
object PhotoStore {
    const val FOLDER = "FamilyRace"
    const val RELATIVE_PATH = "Pictures/FamilyRace/"

    fun loadPlayersJson(ctx: Context): String {
        val arr = JSONArray()
        val seen = HashSet<String>()
        for ((uri, displayName) in queryImages(ctx)) {
            val name = displayName.substringBeforeLast('.').replace('_', ' ').trim()
            if (name.isEmpty() || !seen.add(name.lowercase())) continue
            var dataUrl: String? = null
            try {
                val bmp = loadSquare(ctx, uri, 256)
                if (bmp != null) {
                    dataUrl = toDataUrl(bmp, 88)
                    bmp.recycle()
                }
            } catch (e: Throwable) {
                dataUrl = null
            }
            if (dataUrl == null) continue
            val o = JSONObject()
            o.put("id", uri.toString())
            o.put("name", name)
            o.put("src", dataUrl)
            arr.put(o)
        }
        return arr.toString()
    }

    private fun queryImages(ctx: Context): List<Pair<Uri, String>> {
        val out = ArrayList<Pair<Uri, String>>()
        val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        val projection: Array<String>
        val selection: String
        val args: Array<String>
        if (Build.VERSION.SDK_INT >= 29) {
            projection = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME)
            selection = MediaStore.Images.Media.RELATIVE_PATH + " LIKE ?"
            args = arrayOf("%$RELATIVE_PATH%")
        } else {
            @Suppress("DEPRECATION")
            val data = MediaStore.Images.Media.DATA
            projection = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME)
            selection = "$data LIKE ?"
            args = arrayOf("%/Pictures/$FOLDER/%")
        }
        try {
            ctx.contentResolver.query(
                collection, projection, selection, args,
                MediaStore.Images.Media.DISPLAY_NAME + " ASC"
            )?.use { c ->
                val idCol = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val nameCol = c.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                while (c.moveToNext()) {
                    val id = c.getLong(idCol)
                    val name = c.getString(nameCol) ?: continue
                    out.add(Pair(ContentUris.withAppendedId(collection, id), name))
                }
            }
        } catch (e: Throwable) {
            // нет доступа — вернём пустой список
        }
        return out
    }

    /** Читает фото, поворачивает по EXIF, обрезает в квадрат по центру. */
    fun loadSquare(ctx: Context, uri: Uri, size: Int): Bitmap? {
        val cr = ctx.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        val minSide = minOf(bounds.outWidth, bounds.outHeight)
        while (minSide / (sample * 2) >= size) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val raw = cr.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null

        var rotation = 0f
        var flip = false
        try {
            cr.openInputStream(uri)?.use { s ->
                when (ExifInterface(s).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> rotation = 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> rotation = 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> rotation = 270f
                    ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> flip = true
                    ExifInterface.ORIENTATION_TRANSPOSE -> { rotation = 90f; flip = true }
                    ExifInterface.ORIENTATION_TRANSVERSE -> { rotation = 270f; flip = true }
                    else -> {}
                }
            }
        } catch (e: Throwable) {
        }

        val side = minOf(raw.width, raw.height)
        val x = (raw.width - side) / 2
        val y = (raw.height - side) / 2
        val m = Matrix()
        val scale = size.toFloat() / side
        m.postScale(scale, scale)
        if (flip) m.postScale(-1f, 1f)
        if (rotation != 0f) m.postRotate(rotation)
        val out = Bitmap.createBitmap(raw, x, y, side, side, m, true)
        if (out != raw) raw.recycle()
        return out
    }

    fun toDataUrl(bmp: Bitmap, quality: Int): String {
        val bos = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, quality, bos)
        return "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
    }

    fun sanitize(name: String): String =
        name.replace(Regex("[\\\\/:*?\"<>|\\n\\r\\t]"), "").trim().take(30)

    /** Сохраняет выбранное фото в папку FamilyRace под именем игрока. */
    fun addPlayer(ctx: Context, src: Uri, rawName: String): Boolean {
        val name = sanitize(rawName)
        if (name.isEmpty()) return false
        val bmp = loadSquare(ctx, src, 512) ?: return false
        val fileName = "$name.jpg"
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                val cr = ctx.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                    put(MediaStore.Images.Media.RELATIVE_PATH, RELATIVE_PATH)
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
                val uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
                cr.openOutputStream(uri)?.use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                cr.update(uri, values, null, null)
            } else {
                @Suppress("DEPRECATION")
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FOLDER)
                if (!dir.exists()) dir.mkdirs()
                val f = File(dir, fileName)
                FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
                MediaScannerConnection.scanFile(ctx, arrayOf(f.absolutePath), arrayOf("image/jpeg"), null)
                Thread.sleep(600)
            }
            true
        } catch (e: Throwable) {
            false
        } finally {
            bmp.recycle()
        }
    }
}
