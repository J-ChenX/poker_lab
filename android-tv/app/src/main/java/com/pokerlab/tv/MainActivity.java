package com.pokerlab.tv;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.window.OnBackInvokedDispatcher;
import android.webkit.HttpAuthHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Android TV shell for the canonical web display.
 *
 * The APK deliberately does not duplicate the dashboard in native Android views. Rendering the
 * same /display route keeps typography, layout, state and future visual refinements identical to
 * the browser version. Android is only responsible for TV viewport sizing, immersive mode,
 * connection recovery and translating remote-control keys into DOM keyboard events.
 */
public final class MainActivity extends Activity {
    private static final String DISPLAY_URL = "https://tv.example.com/display?tvapp=1&apk=2.2.0";
    private static final String PREFS = "poker_lab_tv";
    private static final String PREF_AUTH_USERNAME = "auth_username";
    private static final String PREF_AUTH_PASSWORD = "auth_password";
    private static final int BACKGROUND = Color.rgb(7, 24, 18);
    private static final int PANEL = Color.rgb(10, 43, 32);
    private static final int LIME = Color.rgb(200, 241, 90);
    private static final int TEXT = Color.rgb(234, 244, 238);
    private static final int MUTED = Color.rgb(145, 167, 155);

    private WebView webView;
    private View connectionError;
    private TextView connectionErrorDetail;
    private String authUsername;
    private String authPassword;
    private boolean pageReady;
    private boolean mainFrameFailed;
    private boolean savedAuthAttempted;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();

        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        authUsername = preferences.getString(PREF_AUTH_USERNAME, "");
        authPassword = preferences.getString(PREF_AUTH_PASSWORD, "");

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);

        webView = new WebView(this);
        webView.setBackgroundColor(BACKGROUND);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setInitialScale(0);
        webView.clearCache(true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setMinimumFontSize(1);
        settings.setMinimumLogicalFontSize(1);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.NORMAL);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setUserAgentString(settings.getUserAgentString() + " PokerLabTV/2.2");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                view.setInitialScale(0);
                pageReady = false;
                mainFrameFailed = false;
                hideConnectionError();
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                installTvRuntime();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (mainFrameFailed) return;
                pageReady = true;
                installTvRuntime();
                hideConnectionError();
                view.requestFocus();
            }

            @Override
            @TargetApi(Build.VERSION_CODES.M)
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    pageReady = false;
                    mainFrameFailed = true;
                    showConnectionError(error == null ? null : error.getDescription().toString());
                }
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.equals(view.getUrl())) {
                    pageReady = false;
                    mainFrameFailed = true;
                    showConnectionError(description);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                // HTTP Basic authentication starts with an expected 401 challenge. The dedicated
                // authentication callback below resolves it, so it must not trigger the error UI.
                if (response.getStatusCode() == 401) return;
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    pageReady = false;
                    mainFrameFailed = true;
                    showConnectionError("服务器返回 " + response.getStatusCode());
                }
            }

            @Override
            public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
                if (!authUsername.isEmpty() && !savedAuthAttempted) {
                    savedAuthAttempted = true;
                    handler.proceed(authUsername, authPassword);
                } else {
                    showAuthenticationPrompt(handler, host);
                }
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        connectionError = createConnectionError();
        connectionError.setVisibility(View.GONE);
        root.addView(connectionError, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::handleBack
            );
        }

        loadDisplay();
        webView.requestFocus();
    }

    private void loadDisplay() {
        pageReady = false;
        savedAuthAttempted = false;
        hideConnectionError();
        webView.loadUrl(DISPLAY_URL);
    }

    /** Keeps the 1920px canvas fitted to the TV and installs the remote-control event bridge. */
    private void installTvRuntime() {
        if (webView == null) return;
        webView.evaluateJavascript(
            "(function(){" +
                "var m=document.querySelector('meta[name=viewport]');" +
                "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}" +
                "m.content='width=1920,user-scalable=no,viewport-fit=cover';" +
                "document.documentElement.style.background='#071812';" +
                "document.body.style.margin='0';" +
                "window.__pokerLabTvKey=function(type,key,repeat){" +
                    "var target=document.activeElement&&document.activeElement!==document.body?document.activeElement:window;" +
                    "var event;" +
                    "try{event=new KeyboardEvent(type,{key:key,code:key,bubbles:true,cancelable:true,repeat:!!repeat});}" +
                    "catch(error){event=document.createEvent('Event');event.initEvent(type,true,true);" +
                        "try{Object.defineProperty(event,'key',{value:key});Object.defineProperty(event,'code',{value:key});}" +
                        "catch(ignore){event.key=key;event.code=key;}}" +
                    "var allowed=target.dispatchEvent(event);" +
                    "if(type==='keydown'&&key==='Enter'&&allowed){" +
                        "var active=document.activeElement;" +
                        "if(active&&typeof active.click==='function')active.click();" +
                    "}" +
                    "return !allowed;" +
                "};" +
            "})();",
            null
        );
    }

    private void dispatchRemoteKey(String type, String key, boolean repeat) {
        if (!pageReady || webView == null) return;
        String safeKey = key.replace("'", "\\'");
        webView.evaluateJavascript(
            "window.__pokerLabTvKey&&window.__pokerLabTvKey('" + type + "','" + safeKey + "'," + repeat + ")",
            null
        );
    }

    private String remoteKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP: return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A: return "Enter";
            case KeyEvent.KEYCODE_ESCAPE: return "Escape";
            case KeyEvent.KEYCODE_MENU: return "ArrowRight";
            default: return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key = remoteKey(event.getKeyCode());
        if (key == null) return super.dispatchKeyEvent(event);
        if (connectionError.getVisibility() == View.VISIBLE && "Enter".equals(key)) {
            if (event.getAction() == KeyEvent.ACTION_UP) loadDisplay();
            return true;
        }
        dispatchRemoteKey(
            event.getAction() == KeyEvent.ACTION_DOWN ? "keydown" : "keyup",
            key,
            event.getRepeatCount() > 0
        );
        return true;
    }

    @Override
    @SuppressLint("GestureBackNavigation")
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (webView == null || !pageReady) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript(
            "(function(){" +
                "if(document.querySelector('[role=dialog]')){" +
                    "window.__pokerLabTvKey&&window.__pokerLabTvKey('keydown','Escape',false);" +
                    "window.__pokerLabTvKey&&window.__pokerLabTvKey('keyup','Escape',false);" +
                    "return 'closed';" +
                "}" +
                "return 'exit';" +
            "})();",
            result -> {
                if ("\"exit\"".equals(result)) moveTaskToBack(true);
            }
        );
    }

    private View createConnectionError() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(BACKGROUND);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(42), dp(34), dp(42), dp(34));
        card.setBackground(rounded(PANEL, 18, Color.rgb(49, 91, 70)));

        TextView mark = text("♠", 32, LIME, true);
        mark.setGravity(Gravity.CENTER);
        card.addView(mark, new LinearLayout.LayoutParams(dp(64), dp(64)));

        TextView title = text("牌桌连接暂时中断", 24, TEXT, true);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(14);
        card.addView(title, titleParams);

        connectionErrorDetail = text("请检查网络或电脑端服务，然后重新连接", 14, MUTED, false);
        connectionErrorDetail.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        detailParams.topMargin = dp(8);
        card.addView(connectionErrorDetail, detailParams);

        Button retry = new Button(this);
        retry.setText("重新连接");
        retry.setTextSize(16);
        retry.setTextColor(Color.rgb(16, 41, 31));
        retry.setAllCaps(false);
        retry.setFocusable(true);
        retry.setBackground(rounded(LIME, 10, LIME));
        retry.setOnClickListener(view -> loadDisplay());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(220), dp(54));
        retryParams.topMargin = dp(24);
        card.addView(retry, retryParams);

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            dp(560),
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        overlay.addView(card, cardParams);
        return overlay;
    }

    private void showConnectionError(String detail) {
        if (connectionError == null) return;
        connectionErrorDetail.setText(
            detail == null || detail.trim().isEmpty()
                ? "请检查网络或电脑端服务，然后重新连接"
                : detail
        );
        connectionError.setVisibility(View.VISIBLE);
        connectionError.bringToFront();
        View retry = ((ViewGroup) ((ViewGroup) connectionError).getChildAt(0)).getChildAt(3);
        retry.requestFocus();
    }

    private void hideConnectionError() {
        if (connectionError != null) connectionError.setVisibility(View.GONE);
    }

    private void showAuthenticationPrompt(HttpAuthHandler handler, String host) {
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        fields.setPadding(dp(20), 0, dp(20), 0);
        EditText username = settingInput("访问保护用户名", InputType.TYPE_CLASS_TEXT);
        EditText password = settingInput(
            "访问保护密码",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );
        fields.addView(username);
        fields.addView(password);
        new AlertDialog.Builder(this)
            .setTitle("需要 cpolar 访问验证")
            .setMessage(host + " 已启用访问保护。输入一次后会保存在本机。")
            .setView(fields)
            .setPositiveButton("保存并连接", (dialog, which) -> {
                authUsername = username.getText().toString().trim();
                authPassword = password.getText().toString();
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putString(PREF_AUTH_USERNAME, authUsername)
                    .putString(PREF_AUTH_PASSWORD, authPassword)
                    .apply();
                handler.proceed(authUsername, authPassword);
            })
            .setNegativeButton("取消", (dialog, which) -> handler.cancel())
            .setOnCancelListener(dialog -> handler.cancel())
            .show();
    }

    private EditText settingInput(String hint, int inputType) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setInputType(inputType);
        input.setTextSize(17);
        input.setPadding(dp(18), dp(12), dp(18), dp(12));
        return input;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        return view;
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        if (webView != null) {
            webView.onResume();
            webView.requestFocus();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
