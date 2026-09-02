package com.veyotracker.app

import android.app.Activity
import android.app.AlertDialog
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = WebViewClient()

        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsConfirm(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(R.string.app_name)
                    .setMessage(message)
                    .setPositiveButton(R.string.confirm_yes) { _, _ -> result?.confirm() }
                    .setNegativeButton(R.string.confirm_no) { _, _ -> result?.cancel() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }

            override fun onJsAlert(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(R.string.app_name)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok) { _, _ -> result?.confirm() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }
        }

        webView.addJavascriptInterface(
            object {
                @android.webkit.JavascriptInterface
                fun setTheme(dark: Boolean) {
                    runOnUiThread {
                        applySystemBars(dark)
                    }
                }
            },
            "AndroidBridge"
        )

        setContentView(webView)
        webView.loadUrl("file:///android_asset/index.html")
    }

    private fun applySystemBars(dark: Boolean) {
        val color = if (dark) 0xFF1A1A2E.toInt() else 0xFFF0F2F5.toInt()
        window.statusBarColor = color
        window.navigationBarColor = color
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val flags = window.decorView.systemUiVisibility
            window.decorView.systemUiVisibility = if (dark) {
                flags and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
            } else {
                flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
            return
        }

        webView.evaluateJavascript(
            "(function(){var m=document.getElementById('modalOverlay');" +
                "var c=document.getElementById('confirmOverlay');" +
                "return ((m&&m.classList.contains('active'))||(c&&c.classList.contains('active')))" +
                "?'open':'closed';})()"
        ) { result ->
            if (result.contains("open")) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))",
                    null
                )
            } else {
                super.onBackPressed()
            }
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
