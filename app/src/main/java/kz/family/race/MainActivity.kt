package kz.family.race

import android.Manifest
import android.annotation.SuppressLint
import android.app.UiModeManager
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.app.RecoverableSecurityException
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.speech.tts.TextToSpeech
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingName: String? = null
    private var askedPermission = false

    private val pickPhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        val name = pendingName
        pendingName = null
        if (uri == null || name == null) {
            js("window.onPlayerAdded && window.onPlayerAdded(false)")
        } else {
            executor.execute {
                val ok = PhotoStore.addPlayer(this, uri, name)
                js("window.onPlayerAdded && window.onPlayerAdded($ok)")
                sendPlayers()
            }
        }
    }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { loadPlayers() }

    private val deleteLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { loadPlayers() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Телевизор — горизонтально, телефон — вертикально
        requestedOrientation = if (isTv()) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        setContentView(webView)
        hideSystemBars()

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            textZoom = 100
        }
        webView.setBackgroundColor(0xFF2B1E5C.toInt())
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.addJavascriptInterface(Bridge(), "Android")
        webView.loadUrl("https://appassets.androidplatform.net/assets/game/index.html")

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val r = tts?.setLanguage(Locale("ru", "RU")) ?: TextToSpeech.LANG_NOT_SUPPORTED
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
                tts?.setSpeechRate(1.08f)
                tts?.setPitch(1.05f)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("(window.onBack && window.onBack()) ? 1 : 0") { res ->
                    if (res != "1") finish()
                }
            }
        })
    }

    private fun isTv(): Boolean {
        val ui = (getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager)?.currentModeType
        return ui == Configuration.UI_MODE_TYPE_TELEVISION ||
            packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    private fun hideSystemBars() {
        val c = WindowInsetsControllerCompat(window, webView)
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        c.hide(WindowInsetsCompat.Type.systemBars())
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        super.onPause()
        js("window.onAppPause && window.onAppPause()")
        tts?.stop()
    }

    override fun onResume() {
        super.onResume()
        js("window.onAppResume && window.onAppResume()")
    }

    override fun onDestroy() {
        tts?.shutdown()
        executor.shutdown()
        webView.destroy()
        super.onDestroy()
    }

    private fun js(code: String) {
        main.post { if (!isFinishing) webView.evaluateJavascript(code, null) }
    }

    private fun neededPermissions(): Array<String> = when {
        Build.VERSION.SDK_INT >= 34 -> arrayOf(
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
        )
        Build.VERSION.SDK_INT >= 33 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
        Build.VERSION.SDK_INT >= 29 -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        else -> arrayOf(
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        )
    }

    private fun hasFullAccess(): Boolean {
        val p = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES
        else Manifest.permission.READ_EXTERNAL_STORAGE
        return ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED
    }

    private fun loadPlayers() {
        if (!hasFullAccess() && !askedPermission) {
            askedPermission = true
            permissionLauncher.launch(neededPermissions())
            return
        }
        executor.execute { sendPlayers() }
    }

    private fun sendPlayers() {
        val json = PhotoStore.loadPlayersJson(this)
        val access = if (hasFullAccess()) "true" else "false"
        js("window.onPlayers && window.onPlayers(" + JSONObject.quote(json) + ", $access)")
    }

    private fun deletePlayer(id: String) {
        val uri = Uri.parse(id)
        try {
            contentResolver.delete(uri, null, null)
            loadPlayers()
        } catch (e: SecurityException) {
            try {
                if (Build.VERSION.SDK_INT >= 30) {
                    val pi = MediaStore.createDeleteRequest(contentResolver, listOf(uri))
                    deleteLauncher.launch(IntentSenderRequest.Builder(pi.intentSender).build())
                } else if (Build.VERSION.SDK_INT == 29 && e is RecoverableSecurityException) {
                    deleteLauncher.launch(IntentSenderRequest.Builder(e.userAction.actionIntent.intentSender).build())
                } else {
                    js("window.onToast && window.onToast('Не удалось удалить фото')")
                }
            } catch (e2: Throwable) {
                js("window.onToast && window.onToast('Не удалось удалить фото')")
            }
        } catch (e: Throwable) {
            js("window.onToast && window.onToast('Не удалось удалить фото')")
        }
    }

    private fun vibrate(ms: Long) {
        try {
            val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            v?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (e: Throwable) {
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun isAndroid(): Boolean = true

        @JavascriptInterface
        fun isTv(): Boolean = this@MainActivity.isTv()

        @JavascriptInterface
        fun requestPlayers() {
            main.post { loadPlayers() }
        }

        @JavascriptInterface
        fun requestAccess() {
            main.post {
                askedPermission = false
                loadPlayers()
            }
        }

        @JavascriptInterface
        fun addPlayer(name: String) {
            main.post {
                pendingName = name
                pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
        }

        @JavascriptInterface
        fun deletePlayer(id: String) {
            main.post { this@MainActivity.deletePlayer(id) }
        }

        @JavascriptInterface
        fun speak(text: String) {
            if (ttsReady) tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "c")
        }

        @JavascriptInterface
        fun stopSpeak() {
            tts?.stop()
        }

        @JavascriptInterface
        fun hasVoice(): Boolean = ttsReady

        @JavascriptInterface
        fun vibrate(ms: Int) {
            main.post { this@MainActivity.vibrate(ms.toLong()) }
        }

        @JavascriptInterface
        fun exitApp() {
            main.post { finish() }
        }
    }
}
