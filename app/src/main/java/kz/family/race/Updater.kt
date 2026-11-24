package kz.family.race

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Самообновление из GitHub Releases:
 * при запуске проверяет последнюю версию, скачивает APK и устанавливает его.
 */
object Updater {
    private const val API = "https://api.github.com/repos/NurtazaAIB/family-race/releases/latest"
    const val ACTION_STATUS = "kz.family.race.INSTALL_STATUS"

    data class Release(val build: Int, val name: String, val url: String)

    fun currentBuild(ctx: Context): Int = try {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) {
            pi.longVersionCode.toInt()
        } else {
            @Suppress("DEPRECATION")
            val vc = pi.versionCode
            vc
        }
    } catch (e: Throwable) {
        Int.MAX_VALUE
    }

    /** Возвращает новую версию, если она есть. Вызывать в фоновом потоке. */
    fun check(ctx: Context): Release? {
        val conn = URL(API).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("User-Agent", "FamilyRace-Android")
        try {
            if (conn.responseCode != 200) return null
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            val o = JSONObject(text)
            val tag = o.optString("tag_name", "")
            val build = tag.substringAfterLast('.').toIntOrNull() ?: return null
            if (build <= currentBuild(ctx)) return null
            val assets = o.optJSONArray("assets") ?: return null
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                if (a.optString("name").endsWith(".apk")) {
                    return Release(build, tag.removePrefix("v"), a.getString("browser_download_url"))
                }
            }
            return null
        } finally {
            conn.disconnect()
        }
    }

    /** Скачивает APK, сообщая прогресс 0..100. Вызывать в фоновом потоке. */
    fun download(ctx: Context, r: Release, progress: (Int) -> Unit): File? {
        val out = File(ctx.cacheDir, "update.apk")
        var url = URL(r.url)
        var conn: HttpURLConnection
        var redirects = 0
        while (true) {
            conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("User-Agent", "FamilyRace-Android")
            val code = conn.responseCode
            if (code in 300..399 && redirects < 5) {
                val loc = conn.getHeaderField("Location") ?: return null
                conn.disconnect()
                url = URL(url, loc)
                redirects++
                continue
            }
            if (code != 200) {
                conn.disconnect()
                return null
            }
            break
        }
        try {
            val total = conn.contentLengthLong
            var done = 0L
            var last = -1
            conn.inputStream.use { input ->
                FileOutputStream(out).use { output ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        output.write(buf, 0, n)
                        done += n
                        if (total > 0) {
                            val p = (done * 100 / total).toInt()
                            if (p != last) { last = p; progress(p) }
                        }
                    }
                }
            }
            if (total > 0 && done != total) return null
            return out
        } catch (e: Throwable) {
            return null
        } finally {
            conn.disconnect()
        }
    }

    fun canInstall(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

    fun openInstallPermission(ctx: Context) {
        val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName))
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(i)
    }

    /** Устанавливает APK через PackageInstaller. На Android 12+ — без лишних вопросов, если это возможно. */
    fun install(ctx: Context, apk: File): Boolean {
        return try {
            val pi = ctx.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= 31) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val id = pi.createSession(params)
            pi.openSession(id).use { session ->
                apk.inputStream().use { input ->
                    session.openWrite("base.apk", 0, apk.length()).use { os ->
                        input.copyTo(os)
                        session.fsync(os)
                    }
                }
                val intent = Intent(ctx, InstallReceiver::class.java).setAction(ACTION_STATUS)
                var flags = PendingIntent.FLAG_UPDATE_CURRENT
                if (Build.VERSION.SDK_INT >= 31) flags = flags or PendingIntent.FLAG_MUTABLE
                val sender = PendingIntent.getBroadcast(ctx, id, intent, flags)
                session.commit(sender.intentSender)
            }
            true
        } catch (e: Throwable) {
            false
        }
    }
}

/** Получает статус установки; если системе нужно подтверждение — показывает его. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try {
                        context.startActivity(confirm)
                    } catch (e: Throwable) {
                    }
                }
            }
            PackageInstaller.STATUS_SUCCESS -> {}
            else -> {
                val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""
                Toast.makeText(context, "Обновление не установлено. $msg", Toast.LENGTH_LONG).show()
            }
        }
    }
}
