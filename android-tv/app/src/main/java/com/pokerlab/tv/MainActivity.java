package com.pokerlab.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.window.OnBackInvokedDispatcher;
import android.webkit.HttpAuthHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.text.NumberFormat;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String DEFAULT_BASE_URL = BuildConfig.DEFAULT_SERVER_URL;
    private static final String PREFS = "poker_lab_tv";
    private static final String PREF_BASE_URL = "base_url";
    private static final String PREF_AUTH_USERNAME = "auth_username";
    private static final String PREF_AUTH_PASSWORD = "auth_password";

    private static final int BG = Color.rgb(7, 24, 18);
    private static final int PANEL = Color.rgb(10, 43, 32);
    private static final int PANEL_LIGHT = Color.rgb(17, 67, 49);
    private static final int GREEN = Color.rgb(11, 98, 66);
    private static final int LIME = Color.rgb(200, 241, 90);
    private static final int TEXT = Color.rgb(239, 247, 242);
    private static final int MUTED = Color.rgb(145, 167, 155);
    private static final int RED = Color.rgb(220, 98, 91);

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final NumberFormat numbers = NumberFormat.getIntegerInstance(Locale.CHINA);
    private final Runnable statePoll = new Runnable() {
        @Override public void run() {
            refreshState(controlDialog != null && controlDialog.isShowing());
            main.postDelayed(this, 2500);
        }
    };

    private FrameLayout root;
    private WebView webView;
    private LinearLayout nativeDashboard;
    private LinearLayout nativePlayerList;
    private TextView nativePlayerTotal;
    private TextView nativeLevelValue;
    private TextView nativePlayerCount;
    private TextView nativePlacementScores;
    private TextView nativeKnockoutScore;
    private TextView nativeSmallBlind;
    private TextView nativeBigBlind;
    private TextView nativeReviveCost;
    private TextView nativeReviveChips;
    private TextView nativeNextReviveCost;
    private TextView nativeNextReviveChips;
    private TextView connectionStatus;
    private AdvanceButton controlButton;
    private Dialog controlDialog;
    private View firstControlFocus;
    private String controlFocusKey;
    private GameState state;
    private String baseUrl;
    private String authUsername;
    private String authPassword;
    private boolean webCompatibilityKnown;
    private boolean webClientReady;
    private volatile boolean refreshInFlight;
    private android.graphics.Typeface displaySerif;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();

        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        baseUrl = BuildConfig.DEBUG
            ? "http://10.0.2.2:3000"
            : preferences.getString(PREF_BASE_URL, DEFAULT_BASE_URL);
        authUsername = preferences.getString(PREF_AUTH_USERNAME, "");
        authPassword = preferences.getString(PREF_AUTH_PASSWORD, "");
        try {
            displaySerif = android.graphics.Typeface.createFromAsset(getAssets(), "fonts/noto-serif-sc-display.ttf");
        } catch (RuntimeException ignored) {
            displaySerif = android.graphics.Typeface.SERIF;
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(BG);

        webView = new WebView(this);
        webView.setBackgroundColor(BG);
        webView.setFocusable(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " PokerLabTV/" + BuildConfig.VERSION_NAME);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                setConnectionText("看板已连接", true);
                view.evaluateJavascript("document.querySelectorAll('header a,header button').forEach(function(e){e.style.display='none'})", null);
                main.postDelayed(() -> view.evaluateJavascript(
                    "Boolean(window.__pokerLabClientReady)",
                    result -> {
                        webCompatibilityKnown = true;
                        webClientReady = "true".equals(result);
                        updateDashboardPresentation();
                    }
                ), 600);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) setConnectionText("看板连接失败", false);
            }

            @Override public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
                if (!authUsername.isEmpty()) handler.proceed(authUsername, authPassword);
                else showAuthenticationPrompt(handler, host);
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        nativeDashboard = createNativeDashboard(false);
        nativeDashboard.setVisibility(View.GONE);
        root.addView(nativeDashboard, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // 使用 Android 原生按钮。旧版 TCL WebView 能渲染服务器返回的 HTML，
        // 但无法运行现代 React 代码来绑定交互，因此由原生代码处理焦点与点击，
        // 确保遥控器确认键 DPAD_CENTER 和回车键 ENTER 正常工作。
        controlButton = new AdvanceButton();
        controlButton.setOnClickListener(view -> advanceLevelNatively());
        FrameLayout.LayoutParams advanceParams = new FrameLayout.LayoutParams(
            px(135), px(36), Gravity.TOP | Gravity.END
        );
        advanceParams.topMargin = px(8);
        advanceParams.rightMargin = px(58);
        root.addView(controlButton, advanceParams);

        setContentView(root);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        loadDashboard();
        refreshState(false);
        controlButton.requestFocus();
    }

    private void loadDashboard() {
        setConnectionText("正在连接", false);
        webView.loadUrl(baseUrl + "/display?tvapp=1&apk=" + BuildConfig.VERSION_NAME);
    }

    private void refreshState(boolean rebuildPanel) {
        if (refreshInFlight) return;
        refreshInFlight = true;
        runStateTask(() -> {
            try { return new PokerApi(baseUrl, authUsername, authPassword).fetchState(); }
            finally { refreshInFlight = false; }
        }, "正在同步", next -> {
            if (rebuildPanel && controlDialog != null && controlDialog.isShowing()) renderControlPanel();
        });
    }

    private LinearLayout createNativeDashboard(boolean compact) {
        LinearLayout dashboard = new LinearLayout(this);
        dashboard.setOrientation(LinearLayout.VERTICAL);
        dashboard.setPadding(px(compact ? 10 : 58), 0, px(compact ? 10 : 58), px(32));
        dashboard.setBackground(screenBackground());

        LinearLayout header = row();
        TextView brandMark = textPx("♠︎", 12, Color.rgb(7, 24, 18), true);
        brandMark.setGravity(Gravity.CENTER);
        brandMark.setBackground(roundedPx(LIME, 11, 0, Color.TRANSPARENT));
        header.addView(brandMark, new LinearLayout.LayoutParams(px(21), px(21)));
        LinearLayout brandCopy = new LinearLayout(this);
        brandCopy.setOrientation(LinearLayout.VERTICAL);
        brandCopy.setGravity(Gravity.CENTER_VERTICAL);
        TextView brandTitle = textPx("牌桌实时看板", 8, TEXT, true);
        TextView brandSub = textPx("POKER TABLE LIVE", 4, Color.rgb(112, 154, 132), false);
        brandSub.setLetterSpacing(0.22f);
        brandCopy.addView(brandTitle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, px(12)));
        if (!compact) brandCopy.addView(brandSub, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, px(6)));
        LinearLayout.LayoutParams brandCopyParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
        brandCopyParams.leftMargin = px(7);
        header.addView(brandCopy, brandCopyParams);
        dashboard.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(41)));

        LinearLayout body = row();
        body.setGravity(Gravity.FILL);

        LinearLayout ranking = new LinearLayout(this);
        ranking.setOrientation(LinearLayout.VERTICAL);
        ranking.setPadding(px(24), px(24), px(24), px(24));
        ranking.setBackground(roundedPx(Color.argb(153, 5, 23, 17), 8, 1, Color.rgb(24, 63, 47)));
        LinearLayout rankingHead = row();
        TextView rankingTitle = textPx("实时积分排名", 16, TEXT, true);
        rankingTitle.setTypeface(displaySerif, android.graphics.Typeface.BOLD);
        rankingTitle.getPaint().setFakeBoldText(true);
        LinearLayout.LayoutParams rankingTitleParams = new LinearLayout.LayoutParams(0, px(32), 1);
        rankingHead.addView(rankingTitle, rankingTitleParams);
        nativePlayerTotal = textPx("0 位牌手", 6, MUTED, false);
        nativePlayerTotal.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        rankingHead.addView(nativePlayerTotal, new LinearLayout.LayoutParams(px(60), px(32)));
        ranking.addView(rankingHead, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(32)));

        ScrollView playerScroll = new ScrollView(this);
        playerScroll.setFillViewport(true);
        nativePlayerList = new LinearLayout(this);
        nativePlayerList.setOrientation(LinearLayout.VERTICAL);
        playerScroll.addView(nativePlayerList, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams playerScrollParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1);
        playerScrollParams.topMargin = px(8);
        ranking.addView(playerScroll, playerScrollParams);
        if (!compact) body.addView(ranking, new LinearLayout.LayoutParams(px(487), ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout right = new LinearLayout(this);
        right.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams rightParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        rightParams.leftMargin = compact ? 0 : px(29);
        body.addView(right, rightParams);

        LinearLayout levelCard = row();
        levelCard.setPadding(px(42), px(22), px(42), px(22));
        levelCard.setBackground(gradientPx(new int[]{Color.rgb(8, 115, 75), Color.rgb(11, 79, 56), Color.rgb(17, 57, 45)}, 9));
        LinearLayout levelLabel = new LinearLayout(this);
        levelLabel.setOrientation(LinearLayout.VERTICAL);
        levelLabel.setGravity(Gravity.CENTER_VERTICAL);
        levelLabel.setTranslationY(-px(3));
        levelLabel.addView(textPx("当前轮次", 11, TEXT, true));
        TextView currentLevelEn = textPx("CURRENT LEVEL", 6, Color.rgb(145, 197, 170), false);
        currentLevelEn.setLetterSpacing(0.2f);
        levelLabel.addView(currentLevelEn);
        levelCard.addView(levelLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        nativeLevelValue = textPx("L—", 74, LIME, false);
        nativeLevelValue.setTypeface(displaySerif, android.graphics.Typeface.NORMAL);
        nativeLevelValue.setGravity(Gravity.CENTER);
        levelCard.addView(nativeLevelValue, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        LinearLayout levelMeta = new LinearLayout(this);
        levelMeta.setOrientation(LinearLayout.VERTICAL);
        levelMeta.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        nativePlayerCount = textPx("— 人开局", 19, TEXT, true);
        nativePlayerCount.setGravity(Gravity.END);
        nativePlacementScores = textPx("名次积分  —", 6, Color.rgb(151, 191, 170), false);
        nativePlacementScores.setGravity(Gravity.END);
        nativeKnockoutScore = textPx("淘汰积分  —", 6, Color.rgb(151, 191, 170), false);
        nativeKnockoutScore.setGravity(Gravity.END);
        levelMeta.addView(nativePlayerCount);
        levelMeta.addView(nativePlacementScores);
        levelMeta.addView(nativeKnockoutScore);
        levelCard.addView(levelMeta, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        LinearLayout.LayoutParams levelParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, compact ? 0.72f : 0.74f);
        levelParams.bottomMargin = px(16);
        right.addView(levelCard, levelParams);

        LinearLayout blindRow = row();
        blindRow.setGravity(Gravity.FILL);
        LinearLayout smallCard = nativeNumberCard("小盲", "SB", false);
        nativeSmallBlind = (TextView) smallCard.getTag();
        blindRow.addView(smallCard, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        LinearLayout bigCard = nativeNumberCard("大盲", "BB", true);
        nativeBigBlind = (TextView) bigCard.getTag();
        LinearLayout.LayoutParams bigParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
        bigParams.leftMargin = px(16);
        blindRow.addView(bigCard, bigParams);
        LinearLayout.LayoutParams blindParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, compact ? 1.18f : 1.2f);
        blindParams.bottomMargin = px(16);
        right.addView(blindRow, blindParams);

        LinearLayout reviveCard = row();
        reviveCard.setOrientation(LinearLayout.VERTICAL);
        reviveCard.setPadding(0, px(32), 0, px(24));
        reviveCard.setBackground(gradientPx(new int[]{Color.rgb(17, 48, 38), Color.rgb(10, 43, 32)}, 9));
        LinearLayout reviveLabel = new LinearLayout(this);
        reviveLabel.setOrientation(LinearLayout.VERTICAL);
        reviveLabel.setGravity(Gravity.TOP);
        reviveLabel.addView(textPx("复活信息", 11, TEXT, true));
        TextView revivalEn = textPx("REVIVAL", 6, Color.rgb(102, 209, 161), false);
        revivalEn.setLetterSpacing(0.2f);
        reviveLabel.addView(revivalEn);
        reviveLabel.setPadding(px(42), 0, 0, 0);
        reviveCard.addView(reviveLabel, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(34)));
        LinearLayout reviveMetrics = row();
        reviveMetrics.setGravity(Gravity.FILL);
        nativeReviveCost = nativeReviveMetric(reviveMetrics, "本轮复活价格");
        nativeNextReviveCost = textPx("下一轮  —", 7, Color.rgb(137, 185, 160), false);
        nativeNextReviveCost.setSingleLine(true);
        nativeNextReviveCost.setGravity(Gravity.CENTER_VERTICAL);
        ((ViewGroup) nativeReviveCost.getParent().getParent()).addView(nativeNextReviveCost, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, px(15)
        ));
        nativeReviveChips = nativeReviveMetric(reviveMetrics, "复活筹码");
        nativeNextReviveChips = textPx("下一轮  —", 7, Color.rgb(137, 185, 160), false);
        nativeNextReviveChips.setSingleLine(true);
        nativeNextReviveChips.setGravity(Gravity.CENTER_VERTICAL);
        ((ViewGroup) nativeReviveChips.getParent().getParent()).addView(nativeNextReviveChips, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, px(15)
        ));
        reviveCard.addView(reviveMetrics, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        right.addView(reviveCard, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, compact ? 0.8f : 0.82f));

        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1);
        bodyParams.topMargin = px(compact ? 16 : 37);
        dashboard.addView(body, bodyParams);
        return dashboard;
    }

    private LinearLayout nativeNumberCard(String label, String suffix, boolean accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(px(42), px(32), px(42), px(32));
        card.setBackground(accent
            ? gradientPx(new int[]{Color.rgb(10, 68, 48), Color.rgb(8, 50, 37)}, 9)
            : roundedPx(Color.argb(199, 6, 31, 23), 9, 1, Color.rgb(24, 63, 47)));
        card.addView(textPx(label, 11, TEXT, true));
        TextView subtitle = textPx("小盲".equals(label) ? "SMALL BLIND" : "BIG BLIND", 6, Color.rgb(102, 209, 161), false);
        subtitle.setLetterSpacing(0.2f);
        card.addView(subtitle);
        TextView value = textPx("—", 73, accent ? LIME : TEXT, false);
        value.setTypeface(displaySerif, android.graphics.Typeface.NORMAL);
        value.setGravity(Gravity.CENTER_VERTICAL);
        value.setTranslationY(-px(7));
        card.addView(value, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        TextView unit = textPx(suffix, 17, Color.rgb(105, 130, 61), true);
        unit.setGravity(Gravity.END);
        unit.setTranslationY(-px(10));
        card.addView(unit);
        card.setTag(value);
        return card;
    }

    private TextView nativeReviveMetric(LinearLayout parent, String label) {
        if (parent.getChildCount() >= 1) {
            View divider = new View(this);
            divider.setBackgroundColor(Color.rgb(31, 71, 55));
            LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(px(1), px(64));
            dividerParams.gravity = Gravity.CENTER_VERTICAL;
            parent.addView(divider, dividerParams);
        }
        LinearLayout metric = new LinearLayout(this);
        metric.setOrientation(LinearLayout.VERTICAL);
        metric.setGravity(Gravity.CENTER_VERTICAL);
        metric.setPadding(px(42), 0, 0, 0);
        TextView labelView = textPx(label, 8, MUTED, false);
        labelView.setGravity(Gravity.CENTER_VERTICAL);
        metric.addView(labelView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, px(16)
        ));
        LinearLayout valueLine = row();
        TextView value = textPx("—", 36, TEXT, false);
        value.setTypeface(displaySerif, android.graphics.Typeface.NORMAL);
        value.setIncludeFontPadding(false);
        value.setGravity(Gravity.CENTER_VERTICAL);
        valueLine.addView(value);
        TextView unit = textPx(label.contains("价格") ? "分 / 次" : "筹码", 7, MUTED, false);
        unit.setSingleLine(true);
        LinearLayout.LayoutParams unitParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        unitParams.leftMargin = px(4);
        valueLine.addView(unit, unitParams);
        metric.addView(valueLine, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, px(82)
        ));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
        parent.addView(metric, params);
        return value;
    }

    private void renderNativeDashboard(GameState next) {
        if (nativeDashboard == null) return;
        nativeDashboard.setVisibility(View.VISIBLE);
        webView.setVisibility(View.INVISIBLE);
        nativePlayerTotal.setText(String.format(Locale.CHINA, "%d 位牌手", next.players.size()));
        nativeLevelValue.setText("L" + next.currentLevel);
        nativePlayerCount.setText(String.format(Locale.CHINA, "%d 人开局", next.playerCount));
        StringBuilder placements = new StringBuilder("名次积分  ");
        for (int rank = 1; rank <= Rulebook.scoringPlaceCount(next.playerCount); rank++) {
            if (rank > 1) placements.append(" / ");
            placements.append(Rulebook.placementScore(next.playerCount, rank));
        }
        nativePlacementScores.setText(placements.toString());
        nativeKnockoutScore.setText("淘汰积分  +" + Rulebook.knockoutShare(next.playerCount, 1));
        nativeSmallBlind.setText(numbers.format(Rulebook.SMALL_BLINDS[next.currentLevel - 1]));
        nativeBigBlind.setText(numbers.format(Rulebook.BIG_BLINDS[next.currentLevel - 1]));
        int cost = Rulebook.reviveCost(next.playerCount, next.currentLevel);
        nativeReviveCost.setText(cost > 0 ? "−" + numbers.format(cost) : "—");
        int chips = Rulebook.REVIVE_CHIPS[next.currentLevel - 1];
        nativeReviveChips.setText(cost > 0 && chips > 0 ? numbers.format(chips) : "—");
        int nextLevel = Math.min(10, next.currentLevel + 1);
        int nextCost = next.currentLevel < 10 ? Rulebook.reviveCost(next.playerCount, nextLevel) : 0;
        int nextChips = next.currentLevel < 10 ? Rulebook.REVIVE_CHIPS[nextLevel - 1] : 0;
        nativeNextReviveCost.setText(next.currentLevel < 10 && nextCost > 0 ? "下一轮  −" + nextCost + " 分 / 次" : "下一轮  —");
        nativeNextReviveChips.setText(next.currentLevel < 10 && nextChips > 0 ? "下一轮  " + numbers.format(nextChips) + " 筹码" : "下一轮  —");

        nativePlayerList.removeAllViews();
        List<GameState.Player> sorted = new ArrayList<>(next.players);
        Collator chinese = Collator.getInstance(Locale.CHINA);
        Collections.sort(sorted, (first, second) -> {
            int scoreOrder = Integer.compare(second.score, first.score);
            return scoreOrder != 0 ? scoreOrder : chinese.compare(first.name, second.name);
        });
        if (sorted.isEmpty()) {
            TextView empty = textPx("牌桌正在等待玩家\n请在手机控制台中添加人员", 9, MUTED, false);
            empty.setGravity(Gravity.CENTER);
            nativePlayerList.addView(empty, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(120)));
            return;
        }
        for (int index = 0; index < sorted.size(); index++) {
            GameState.Player player = sorted.get(index);
            LinearLayout item = row();
            item.setPadding(px(16), px(8), px(16), px(8));
            item.setBackground(index < 3
                ? gradientPx(new int[]{Color.rgb(29, 57, 33), Color.rgb(20, 44, 30)}, 6)
                : roundedPx(PANEL_LIGHT, 6, 1, Color.rgb(49, 91, 70)));
            TextView rank = textPx(String.valueOf(index + 1), 8, index < 3 ? LIME : MUTED, true);
            rank.setGravity(Gravity.CENTER);
            item.addView(rank, new LinearLayout.LayoutParams(px(20), ViewGroup.LayoutParams.MATCH_PARENT));
            String initials = player.name.substring(0, Math.min(2, player.name.length())).toUpperCase(Locale.CHINA);
            TextView avatar = textPx(initials, 6, TEXT, true);
            avatar.setGravity(Gravity.CENTER);
            avatar.setBackground(roundedPx(Color.rgb(22, 60, 45), 12, 0, Color.TRANSPARENT));
            item.addView(avatar, new LinearLayout.LayoutParams(px(28), px(28)));
            LinearLayout identity = new LinearLayout(this);
            identity.setOrientation(LinearLayout.VERTICAL);
            identity.setGravity(Gravity.CENTER_VERTICAL);
            TextView name = textPx(player.name, 11, TEXT, true);
            name.setSingleLine(true);
            TextView status = textPx(index == 0 ? "当前领先" : "积分账户", 4, MUTED, false);
            status.setSingleLine(true);
            identity.addView(name);
            identity.addView(status);
            LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            nameParams.leftMargin = px(12);
            item.addView(identity, nameParams);
            TextView score = textPx(signed(player.score) + " 分", 16, player.score < 0 ? RED : LIME, false);
            score.setTypeface(displaySerif, android.graphics.Typeface.NORMAL);
            score.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
            item.addView(score, new LinearLayout.LayoutParams(px(60), ViewGroup.LayoutParams.MATCH_PARENT));
            LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(52));
            itemParams.bottomMargin = px(4);
            nativePlayerList.addView(item, itemParams);
        }
    }

    private void updateDashboardPresentation() {
        if (state == null || nativeDashboard == null) return;
        renderNativeDashboard(state);
        nativeDashboard.setVisibility(View.VISIBLE);
        nativeDashboard.bringToFront();
        controlButton.bringToFront();
        webView.setVisibility(View.INVISIBLE);
    }

    private void setNativeDashboardMode(boolean compact) {
        if (root == null) return;
        if (nativeDashboard != null) root.removeView(nativeDashboard);
        nativeDashboard = createNativeDashboard(compact);
        FrameLayout.LayoutParams dashboardParams = new FrameLayout.LayoutParams(
            compact ? px(614) : ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.START | Gravity.TOP
        );
        root.addView(nativeDashboard, 1, dashboardParams);
        if (state != null) renderNativeDashboard(state);

        FrameLayout.LayoutParams advanceParams = (FrameLayout.LayoutParams) controlButton.getLayoutParams();
        advanceParams.width = px(135);
        advanceParams.height = px(36);
        advanceParams.gravity = compact ? Gravity.TOP | Gravity.START : Gravity.TOP | Gravity.END;
        advanceParams.topMargin = px(8);
        advanceParams.leftMargin = compact ? px(469) : 0;
        advanceParams.rightMargin = compact ? 0 : px(58);
        controlButton.setLayoutParams(advanceParams);
        controlButton.bringToFront();
    }


    private void openControlPanel() {
        if (controlDialog != null && controlDialog.isShowing()) return;
        setNativeDashboardMode(true);
        controlDialog = new Dialog(this, android.R.style.Theme_Material_NoActionBar);
        controlDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        renderControlPanel();
        controlDialog.setOnDismissListener(dialog -> {
            controlDialog = null;
            setNativeDashboardMode(false);
            controlButton.requestFocus();
        });
        controlDialog.show();
        Window window = controlDialog.getWindow();
        if (window != null) {
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            window.setLayout((int) (metrics.widthPixels * 0.68), metrics.heightPixels);
            window.setGravity(Gravity.TOP | Gravity.END);
            window.setBackgroundDrawable(gradientPx(new int[]{Color.rgb(13, 48, 36), Color.rgb(7, 28, 21), Color.rgb(6, 22, 17)}, 0));
            window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams params = window.getAttributes();
            params.x = 0;
            params.y = 0;
            params.dimAmount = 0f;
            window.setAttributes(params);
        }
        restoreControlFocus();
        refreshState(true);
    }

    private void renderControlPanel() {
        if (controlDialog == null) return;

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setPadding(0, 0, 0, 0);
        shell.setBackground(gradientPx(new int[]{Color.rgb(13, 48, 36), Color.rgb(7, 28, 21), Color.rgb(6, 22, 17)}, 0));

        LinearLayout header = row();
        header.setPadding(px(10), 0, px(10), 0);
        LinearLayout headerCopy = new LinearLayout(this);
        headerCopy.setOrientation(LinearLayout.VERTICAL);
        headerCopy.setGravity(Gravity.CENTER_VERTICAL);
        TextView eyebrow = textPx("TABLE CONTROLS", 4, Color.rgb(159, 193, 68), true);
        eyebrow.setLetterSpacing(0.17f);
        TextView title = textPx("牌桌控制", 8, TEXT, true);
        headerCopy.addView(eyebrow, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, px(6)));
        headerCopy.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, px(12)));
        header.addView(headerCopy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        View headerLine = new View(this);
        headerLine.setBackgroundColor(Color.rgb(25, 66, 50));
        shell.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(40)));
        LinearLayout.LayoutParams headerLineParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(1));
        headerLineParams.leftMargin = px(10);
        headerLineParams.rightMargin = px(10);
        shell.addView(headerLine, headerLineParams);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(px(10), px(14), px(10), px(19));

        if (state == null) {
            TextView loading = textPx("正在读取牌局状态…", 16, MUTED, false);
            loading.setGravity(Gravity.CENTER);
            content.addView(loading, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(220)));
        } else {
            content.addView(controlSectionTitle("本局开始人数", 20));
            content.addView(playerCountGrid());
            content.addView(controlDivider(14, 14));
            content.addView(controlSectionTitle("当前盲注等级", 20));
            content.addView(levelGrid());
            content.addView(controlDivider(14, 14));
            content.addView(controlSectionTitle("计分名次", 20));
            content.addView(rankControls());
            content.addView(controlDivider(14, 14));
            content.addView(controlSectionTitle("即时记分", 20));
            content.addView(actionControls());
        }

        scroll.addView(content, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        controlDialog.setContentView(shell);
        restoreControlFocus();
    }

    private View summaryCard() {
        LinearLayout card = row();
        card.setPadding(dp(24), dp(18), dp(24), dp(18));
        card.setBackground(rounded(GREEN, 14));
        card.addView(metric("当前轮次", "L" + state.currentLevel), new LinearLayout.LayoutParams(0, dp(88), 1));
        card.addView(metric("大小盲", Rulebook.SMALL_BLINDS[state.currentLevel - 1] + " / " + Rulebook.BIG_BLINDS[state.currentLevel - 1]), new LinearLayout.LayoutParams(0, dp(88), 1));
        int cost = Rulebook.reviveCost(state.playerCount, state.currentLevel);
        card.addView(metric("复活价格", cost > 0 ? "−" + cost : "不可复活"), new LinearLayout.LayoutParams(0, dp(88), 1));
        card.addView(metric("已登记人员", state.players.size() + " 人"), new LinearLayout.LayoutParams(0, dp(88), 1));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(124));
        params.bottomMargin = dp(16);
        card.setLayoutParams(params);
        return card;
    }

    private View metric(String label, String value) {
        LinearLayout metric = new LinearLayout(this);
        metric.setOrientation(LinearLayout.VERTICAL);
        metric.setGravity(Gravity.CENTER_VERTICAL);
        TextView labelView = text(label, 13, Color.rgb(198, 228, 213), false);
        TextView valueView = text(value, 28, LIME, true);
        metric.addView(labelView);
        metric.addView(valueView);
        return metric;
    }

    private View sectionTitle(String title, String hint) {
        LinearLayout block = new LinearLayout(this);
        block.setOrientation(LinearLayout.VERTICAL);
        block.setPadding(0, dp(24), 0, dp(10));
        block.addView(text(title, 21, TEXT, true));
        block.addView(text(hint, 13, MUTED, false));
        return block;
    }

    private View controlSectionTitle(String title, int height) {
        TextView view = textPx(title, 10, TEXT, true);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(height)));
        return view;
    }

    private void trackControlFocus(View view, String key) {
        view.setTag(key);
        view.setOnFocusChangeListener((focusedView, focused) -> {
            if (focused) controlFocusKey = key;
        });
        if (isLeftControlBoundary(key)) {
            view.setOnKeyListener((focusedView, keyCode, event) -> {
                if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT && event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (controlDialog != null) controlDialog.dismiss();
                    return true;
                }
                return false;
            });
        }
    }

    private void restoreControlFocus() {
        main.post(() -> {
            if (controlDialog == null || !controlDialog.isShowing()) return;
            View target = null;
            Window window = controlDialog.getWindow();
            if (window != null && controlFocusKey != null) {
                target = window.getDecorView().findViewWithTag(controlFocusKey);
            }
            if (target == null) target = firstControlFocus;
            if (target != null) target.requestFocus();
        });
    }

    private boolean isLeftControlBoundary(String key) {
        return "player-count-3".equals(key)
            || "level-1".equals(key)
            || "level-6".equals(key)
            || key.startsWith("rank-")
            || "settle".equals(key)
            || "knockout".equals(key);
    }

    private View controlDivider(int top, int bottom) {
        LinearLayout holder = new LinearLayout(this);
        holder.setOrientation(LinearLayout.VERTICAL);
        holder.setPadding(0, px(top), 0, px(bottom));
        View line = new View(this);
        line.setBackgroundColor(Color.rgb(25, 66, 50));
        holder.addView(line, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(1)));
        return holder;
    }

    private GridLayout.LayoutParams controlGridCell(int height, int left, int right, int top, int bottom) {
        GridLayout.LayoutParams params = new GridLayout.LayoutParams();
        params.width = 0;
        params.height = px(height);
        params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
        params.setMargins(px(left), px(top), px(right), px(bottom));
        return params;
    }

    private Button controlChoice(String label, boolean selected, int fontSize) {
        Button item = new Button(this);
        item.setText(label);
        item.setTextSize(TypedValue.COMPLEX_UNIT_PX, Math.round(px(fontSize) * 1.5f));
        item.setTextColor(selected ? LIME : TEXT);
        item.setAllCaps(false);
        item.setMinWidth(0);
        item.setMinHeight(0);
        item.setPadding(0, 0, 0, 0);
        item.setGravity(Gravity.CENTER);
        item.setFocusable(true);
        item.setSingleLine(!label.contains("\n"));
        item.setBackground(controlChoiceBackground(selected));
        return item;
    }

    private LinearLayout controlLevelTile(int levelNumber, boolean selected) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER_VERTICAL);
        tile.setPadding(px(7), px(4), px(7), px(4));
        tile.setFocusable(true);
        tile.setClickable(true);
        tile.setBackground(controlChoiceBackground(selected));

        LinearLayout top = row();
        TextView level = textPx("L" + levelNumber, 11, selected ? LIME : TEXT, true);
        level.setTypeface(displaySerif, android.graphics.Typeface.NORMAL);
        top.addView(level, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        int cost = Rulebook.reviveCost(state.playerCount, levelNumber);
        int chips = Rulebook.REVIVE_CHIPS[levelNumber - 1];
        TextView revival = textPx(cost > 0 && chips > 0 ? cost + "/" + chips : "—/—", 6, selected ? LIME : MUTED, false);
        revival.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        top.addView(revival, new LinearLayout.LayoutParams(px(68), ViewGroup.LayoutParams.MATCH_PARENT));
        tile.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(22)));
        tile.addView(textPx(
            Rulebook.SMALL_BLINDS[levelNumber - 1] + "/" + Rulebook.BIG_BLINDS[levelNumber - 1],
            6,
            MUTED,
            false
        ), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(14)));
        return tile;
    }

    private StateListDrawable controlChoiceBackground(boolean selected) {
        StateListDrawable states = new StateListDrawable();
        GradientDrawable focused = roundedPx(Color.rgb(42, 72, 58), 5, 2, Color.rgb(234, 244, 238));
        GradientDrawable pressed = roundedPx(Color.rgb(61, 96, 44), 5, 1, LIME);
        GradientDrawable normal = roundedPx(
            selected ? Color.rgb(61, 96, 44) : Color.argb(10, 255, 255, 255),
            5,
            1,
            selected ? Color.rgb(156, 194, 64) : Color.rgb(39, 78, 61)
        );
        GradientDrawable disabled = roundedPx(Color.rgb(20, 48, 37), 5, 1, Color.rgb(35, 66, 52));
        states.addState(new int[]{android.R.attr.state_focused}, focused);
        states.addState(new int[]{android.R.attr.state_pressed}, pressed);
        states.addState(new int[]{-android.R.attr.state_enabled}, disabled);
        states.addState(new int[]{}, normal);
        return states;
    }

    private View playerCountGrid() {
        GridLayout grid = grid(5);
        grid.setPadding(0, px(9), 0, 0);
        firstControlFocus = null;
        for (int count = 3; count <= 12; count++) {
            final int nextCount = count;
            Button item = controlChoice(count + "人", count == state.playerCount, 10);
            trackControlFocus(item, "player-count-" + count);
            item.setOnClickListener(view -> sendSetGame(nextCount, state.currentLevel, ranksForCount(nextCount), "人数已更新"));
            if (count == state.playerCount) firstControlFocus = item;
            grid.addView(item, controlGridCell(41, 3, 3, 0, 6));
        }
        return grid;
    }

    private View levelGrid() {
        GridLayout grid = grid(5);
        grid.setPadding(0, px(9), 0, 0);
        for (int level = 1; level <= 10; level++) {
            final int nextLevel = level;
            LinearLayout item = controlLevelTile(level, level == state.currentLevel);
            trackControlFocus(item, "level-" + level);
            item.setOnClickListener(view -> sendSetGame(state.playerCount, nextLevel, ranksForCount(state.playerCount), "等级已更新"));
            grid.addView(item, controlGridCell(50, 3, 3, 0, 7));
        }
        return grid;
    }

    private View rankControls() {
        LinearLayout block = new LinearLayout(this);
        block.setOrientation(LinearLayout.VERTICAL);
        block.setPadding(0, px(9), 0, 0);
        int places = Rulebook.scoringPlaceCount(state.playerCount);
        for (int rank = 0; rank < places; rank++) {
            String name = rank < state.rankedPlayers.size() ? state.rankedPlayers.get(rank) : "";
            int points = Rulebook.placementScore(state.playerCount, rank + 1);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(px(7), 0, px(6), 0);
            row.setBackground(roundedPx(Color.argb(10, 255, 255, 255), 5, 1, Color.rgb(39, 78, 61)));

            TextView rankBadge = textPx(String.valueOf(rank + 1), 8, Color.rgb(9, 45, 31), true);
            rankBadge.setGravity(Gravity.CENTER);
            rankBadge.setBackground(roundedPx(LIME, 6, 0, Color.TRANSPARENT));
            row.addView(rankBadge, new LinearLayout.LayoutParams(px(19), px(19)));

            LinearLayout meta = new LinearLayout(this);
            meta.setOrientation(LinearLayout.VERTICAL);
            meta.setGravity(Gravity.CENTER_VERTICAL);
            meta.addView(textPx("第 " + (rank + 1) + " 名", 8, TEXT, true), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(15)));
            meta.addView(textPx("+" + points + " 分", 6, LIME, false), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(13)));
            LinearLayout.LayoutParams metaParams = new LinearLayout.LayoutParams(px(160), ViewGroup.LayoutParams.MATCH_PARENT);
            metaParams.leftMargin = px(6);
            row.addView(meta, metaParams);

            Button rankButton = controlChoice(name.isEmpty() ? "选择牌手" : name, !name.isEmpty(), 8);
            trackControlFocus(rankButton, "rank-" + (rank + 1));
            rankButton.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            rankButton.setPadding(px(9), 0, px(9), 0);
            final int rankIndex = rank;
            rankButton.setOnClickListener(view -> showRankPicker(rankIndex));
            row.addView(rankButton, new LinearLayout.LayoutParams(0, px(36), 1));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(55));
            params.bottomMargin = px(8);
            block.addView(row, params);
        }

        Button settle = controlChoice("确认结算名次积分  →", true, 9);
        trackControlFocus(settle, "settle");
        settle.setEnabled(canSettleRanks());
        settle.setOnClickListener(view -> confirmSettlement());
        LinearLayout.LayoutParams settleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px(39));
        block.addView(settle, settleParams);
        return block;
    }

    private View actionControls() {
        GridLayout grid = grid(2);
        grid.setPadding(0, px(9), 0, 0);
        Button knockout = controlChoice("✦   淘汰加分\n      基础 +" + Rulebook.knockoutShare(state.playerCount, 1) + " 分", false, 9);
        trackControlFocus(knockout, "knockout");
        knockout.setEnabled(!state.players.isEmpty());
        knockout.setOnClickListener(view -> showKnockoutPicker());
        knockout.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        grid.addView(knockout, controlGridCell(54, 0, 5, 0, 0));

        int cost = Rulebook.reviveCost(state.playerCount, state.currentLevel);
        Button revive = controlChoice(cost > 0 ? "↻   复活扣分\n      单次 −" + cost + " 分" : "↻   当前等级不可复活", false, 9);
        trackControlFocus(revive, "revive");
        revive.setEnabled(cost > 0 && !state.players.isEmpty());
        revive.setOnClickListener(view -> showRevivePicker());
        revive.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        grid.addView(revive, controlGridCell(54, 5, 0, 0, 0));
        return grid;
    }

    private void showRankPicker(int rankIndex) {
        if (state == null) return;
        List<String> choices = new ArrayList<>();
        choices.add("清空选择");
        Set<String> used = new HashSet<>();
        for (int index = 0; index < state.rankedPlayers.size(); index++) {
            if (index != rankIndex && !state.rankedPlayers.get(index).isEmpty()) used.add(state.rankedPlayers.get(index));
        }
        for (GameState.Player player : state.players) if (!used.contains(player.name)) choices.add(player.name + "  ·  " + signed(player.score) + " 分");
        new AlertDialog.Builder(this)
            .setTitle("选择第 " + (rankIndex + 1) + " 名")
            .setItems(choices.toArray(new String[0]), (dialog, which) -> {
                List<String> ranks = ranksForCount(state.playerCount);
                String name = which == 0 ? "" : choices.get(which).split("  ·  ", 2)[0];
                ranks.set(rankIndex, name);
                sendSetGame(state.playerCount, state.currentLevel, ranks, "名次选择已保存");
            })
            .setNegativeButton("取消", null)
            .show();
    }

    private void confirmSettlement() {
        if (!canSettleRanks()) {
            toast("请先为所有计分名次选择不同人员");
            return;
        }
        StringBuilder summary = new StringBuilder();
        int places = Rulebook.scoringPlaceCount(state.playerCount);
        for (int index = 0; index < places; index++) {
            summary.append("第 ").append(index + 1).append(" 名：").append(state.rankedPlayers.get(index))
                .append("  ＋").append(Rulebook.placementScore(state.playerCount, index + 1)).append(" 分\n");
        }
        new AlertDialog.Builder(this)
            .setTitle("确认结算名次积分")
            .setMessage(summary.toString())
            .setPositiveButton("确认结算", (dialog, which) -> {
                try {
                    JSONArray changes = new JSONArray();
                    for (int index = 0; index < places; index++) {
                        changes.put(new JSONObject().put("name", state.rankedPlayers.get(index)).put("amount", Rulebook.placementScore(state.playerCount, index + 1)));
                    }
                    JSONObject payload = new JSONObject().put("type", "addScores").put("changes", changes).put("clearRanks", true);
                    postAction(payload, "名次积分已结算");
                } catch (Exception error) { toast(error.getMessage()); }
            })
            .setNegativeButton("返回检查", null)
            .show();
    }

    private void showKnockoutPicker() {
        if (state == null || state.players.isEmpty()) return;
        String[] names = new String[state.players.size()];
        boolean[] checked = new boolean[names.length];
        for (int index = 0; index < names.length; index++) names[index] = state.players.get(index).name;
        new AlertDialog.Builder(this)
            .setTitle("选择淘汰得分人员（可多选）")
            .setMultiChoiceItems(names, checked, (dialog, which, selected) -> checked[which] = selected)
            .setPositiveButton("确认加分", (dialog, which) -> {
                int selectedCount = 0;
                for (boolean selected : checked) if (selected) selectedCount++;
                if (selectedCount == 0) { toast("请至少选择一名人员"); return; }
                int share = Rulebook.knockoutShare(state.playerCount, selectedCount);
                try {
                    JSONArray changes = new JSONArray();
                    for (int index = 0; index < checked.length; index++) if (checked[index]) changes.put(new JSONObject().put("name", names[index]).put("amount", share));
                    postAction(new JSONObject().put("type", "addScores").put("changes", changes), "淘汰积分已记录，每人 ＋" + share);
                } catch (Exception error) { toast(error.getMessage()); }
            })
            .setNegativeButton("取消", null)
            .show();
    }

    private void showRevivePicker() {
        if (state == null || state.players.isEmpty()) return;
        int cost = Rulebook.reviveCost(state.playerCount, state.currentLevel);
        if (cost <= 0) { toast("当前人数或等级不可复活"); return; }
        String[] names = new String[state.players.size()];
        for (int index = 0; index < names.length; index++) names[index] = state.players.get(index).name;
        new AlertDialog.Builder(this)
            .setTitle("选择复活人员 · 单次 −" + cost + " 分")
            .setItems(names, (dialog, which) -> new AlertDialog.Builder(this)
                .setTitle("确认一次复活")
                .setMessage(names[which] + " 将扣除 " + cost + " 分")
                .setPositiveButton("确认扣分", (confirmDialog, confirmWhich) -> {
                    try {
                        JSONArray changes = new JSONArray().put(new JSONObject().put("name", names[which]).put("amount", -cost));
                        postAction(new JSONObject().put("type", "addScores").put("changes", changes), names[which] + " 已扣除 " + cost + " 分");
                    } catch (Exception error) { toast(error.getMessage()); }
                })
                .setNegativeButton("取消", null)
                .show())
            .setNegativeButton("取消", null)
            .show();
    }

    private void showServerSettings() {
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        fields.setPadding(dp(12), 0, dp(12), 0);
        EditText input = settingInput("网站根地址", baseUrl, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        EditText username = settingInput("cpolar 访问保护用户名（如未启用可留空）", authUsername, InputType.TYPE_CLASS_TEXT);
        EditText password = settingInput("cpolar 访问保护密码", authPassword, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        fields.addView(input);
        fields.addView(username);
        fields.addView(password);
        new AlertDialog.Builder(this)
            .setTitle("牌桌服务器设置")
            .setMessage("网址不需要添加 /display。若 cpolar 开启了访问保护，请一并填写账号和密码。")
            .setView(fields)
            .setPositiveButton("保存并重连", (dialog, which) -> {
                try {
                    String normalized = normalizeBaseUrl(input.getText().toString());
                    baseUrl = normalized;
                    authUsername = username.getText().toString().trim();
                    authPassword = password.getText().toString();
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString(PREF_BASE_URL, baseUrl)
                        .putString(PREF_AUTH_USERNAME, authUsername)
                        .putString(PREF_AUTH_PASSWORD, authPassword)
                        .apply();
                    state = null;
                    webView.clearCache(false);
                    loadDashboard();
                    refreshState(true);
                } catch (Exception error) { toast("地址无效，请输入 http:// 或 https:// 开头的网址"); }
            })
            .setNegativeButton("取消", null)
            .show();
    }

    private EditText settingInput(String hint, String value, int inputType) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setSingleLine(true);
        input.setSelectAllOnFocus(true);
        input.setInputType(inputType);
        input.setTextSize(17);
        input.setPadding(dp(18), dp(12), dp(18), dp(12));
        return input;
    }

    private void showAuthenticationPrompt(HttpAuthHandler handler, String host) {
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        fields.setPadding(dp(20), 0, dp(20), 0);
        EditText username = settingInput("访问保护用户名", "", InputType.TYPE_CLASS_TEXT);
        EditText password = settingInput("访问保护密码", "", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
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
                refreshState(false);
            })
            .setNegativeButton("取消", (dialog, which) -> handler.cancel())
            .setOnCancelListener(dialog -> handler.cancel())
            .show();
    }

    private String normalizeBaseUrl(String value) throws Exception {
        String normalized = value.trim();
        if (!normalized.matches("^https?://.*")) normalized = "https://" + normalized;
        normalized = normalized.replaceAll("/(display|api/score-state)/?$", "").replaceAll("/+$", "");
        URI uri = new URI(normalized);
        if (uri.getHost() == null || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) throw new IllegalArgumentException("invalid URL");
        return normalized;
    }

    private void sendSetGame(int playerCount, int level, List<String> ranks, String successMessage) {
        try {
            JSONArray ranked = new JSONArray();
            for (String name : ranks) ranked.put(name);
            JSONObject payload = new JSONObject()
                .put("type", "setGame")
                .put("playerCount", playerCount)
                .put("currentLevel", level)
                .put("rankedPlayers", ranked);
            postAction(payload, successMessage);
        } catch (Exception error) { toast(error.getMessage()); }
    }

    private void advanceLevelNatively() {
        if (state == null) {
            refreshState(false);
            toast("正在读取牌桌状态，请稍后再试");
            return;
        }
        if (state.currentLevel >= 10) {
            toast("当前已经是最高等级");
            controlButton.requestFocus();
            return;
        }
        sendSetGame(
            state.playerCount,
            state.currentLevel + 1,
            ranksForCount(state.playerCount),
            "已切换到 L" + (state.currentLevel + 1)
        );
    }

    private void postAction(JSONObject payload, String successMessage) {
        runStateTask(() -> new PokerApi(baseUrl, authUsername, authPassword).post(payload), "正在保存", next -> {
            toast(successMessage);
            if (controlDialog != null && controlDialog.isShowing()) renderControlPanel();
        });
    }

    private List<String> ranksForCount(int playerCount) {
        int places = Rulebook.scoringPlaceCount(playerCount);
        List<String> result = new ArrayList<>();
        for (int index = 0; index < places; index++) result.add(state != null && index < state.rankedPlayers.size() ? state.rankedPlayers.get(index) : "");
        return result;
    }

    private boolean canSettleRanks() {
        if (state == null) return false;
        int places = Rulebook.scoringPlaceCount(state.playerCount);
        if (state.players.size() < places || state.rankedPlayers.size() < places) return false;
        Set<String> names = new HashSet<>();
        for (int index = 0; index < places; index++) {
            String name = state.rankedPlayers.get(index);
            if (name.isEmpty() || !names.add(name)) return false;
        }
        return true;
    }

    private interface StateTask { GameState run() throws Exception; }
    private interface StateSuccess { void accept(GameState state); }

    private void runStateTask(StateTask task, String workingText, StateSuccess success) {
        setConnectionText(workingText, false);
        io.execute(() -> {
            try {
                GameState next = task.run();
                main.post(() -> {
                    int previousVersion = state == null ? -1 : state.version;
                    state = next;
                    controlButton.setLevel(next.currentLevel);
                    controlButton.setEnabled(next.currentLevel < 10);
                    updateDashboardPresentation();
                    // 旧版 WebView 无法运行 React 轮询代码，因此仅在接口版本变化时重新加载，
                    // 既能同步最新数据，也能避免每次轮询都引起画面闪烁。
                    if (previousVersion >= 0 && previousVersion != next.version && webView != null) {
                        webView.reload();
                    }
                    setConnectionText("已同步 · v" + next.version, true);
                    success.accept(next);
                });
            } catch (Exception error) {
                main.post(() -> {
                    setConnectionText("连接失败", false);
                    toast(error.getMessage() == null ? "无法连接牌桌服务器" : error.getMessage());
                    if (controlDialog != null && controlDialog.isShowing()) renderControlPanel();
                });
            }
        });
    }

    private void setConnectionText(String value, boolean online) {
        if (connectionStatus == null) return;
        connectionStatus.setText(String.format(Locale.CHINA, "%s  %s", online ? "●" : "○", value));
        connectionStatus.setTextColor(online ? LIME : MUTED);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        return row;
    }

    private GridLayout grid(int columns) {
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(columns);
        grid.setAlignmentMode(GridLayout.ALIGN_BOUNDS);
        grid.setUseDefaultMargins(false);
        return grid;
    }

    private GridLayout.LayoutParams gridCell() {
        GridLayout.LayoutParams params = new GridLayout.LayoutParams();
        params.width = 0;
        params.height = dp(58);
        params.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
        params.setMargins(dp(4), dp(4), dp(4), dp(4));
        return params;
    }

    private GridLayout.LayoutParams gridCellTall() {
        GridLayout.LayoutParams params = gridCell();
        params.height = dp(70);
        return params;
    }

    private LinearLayout.LayoutParams sized(int width, int height, int leftMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(width), dp(height));
        params.leftMargin = dp(leftMargin);
        return params;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        return view;
    }

    private TextView textPx(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        // 电视观看距离较远，字号需大于桌面截图中的显示尺寸。
        // 布局继续按视口比例缩放，同时放大文字，确保 1080p 和 4K 输出均清晰可读。
        view.setTextSize(TypedValue.COMPLEX_UNIT_PX, Math.round(px(size) * 1.5f));
        view.setTextColor(color);
        view.setIncludeFontPadding(false);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setLineSpacing(0, 1f);
        view.setTypeface(android.graphics.Typeface.create("sans-serif", bold
            ? android.graphics.Typeface.BOLD
            : android.graphics.Typeface.NORMAL));
        return view;
    }

    private final class AdvanceButton extends LinearLayout {
        private final TextView prefix;
        private final TextView level;

        AdvanceButton() {
            super(MainActivity.this);
            setOrientation(HORIZONTAL);
            setGravity(Gravity.CENTER);
            setPadding(px(8), px(4), px(6), px(4));
            setFocusable(true);
            setClickable(true);
            setBackground(advanceButtonBackground());

            prefix = textPx("下一等级", 6, Color.rgb(217, 232, 223), false);
            addView(prefix, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));

            level = textPx("L—", 11, LIME, false);
            level.setTypeface(displaySerif, android.graphics.Typeface.NORMAL);
            LinearLayout.LayoutParams levelParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT);
            levelParams.leftMargin = px(5);
            levelParams.rightMargin = px(5);
            addView(level, levelParams);

            TextView arrow = textPx("→", 9, Color.rgb(8, 41, 28), false);
            arrow.setGravity(Gravity.CENTER);
            arrow.setBackground(roundedPx(LIME, 7, 0, Color.TRANSPARENT));
            addView(arrow, new LinearLayout.LayoutParams(px(18), px(18)));
        }

        void setLevel(int currentLevel) {
            boolean complete = currentLevel >= 10;
            prefix.setText(complete ? "当前等级" : "下一等级");
            level.setText("L" + (complete ? 10 : currentLevel + 1));
        }
    }

    private int px(int value) {
        DisplayMetrics logicalMetrics = getResources().getDisplayMetrics();
        int widthPixels = logicalMetrics.widthPixels;
        int heightPixels = logicalMetrics.heightPixels;

        // 部分 Android TV 固件以 4K 分辨率渲染应用，却提供 1920 × 1080 的逻辑资源尺寸。
        // 此时按权重分配的布局仍能铺满屏幕，但固定像素尺寸，尤其是文字，看起来会缩小一半。
        // 使用真实显示参数，才能保留这些设备实际的面板或输出分辨率。
        DisplayMetrics realMetrics = new DisplayMetrics();
        try {
            getWindowManager().getDefaultDisplay().getRealMetrics(realMetrics);
            widthPixels = Math.max(widthPixels, realMetrics.widthPixels);
            heightPixels = Math.max(heightPixels, realMetrics.heightPixels);
        } catch (RuntimeException ignored) {
            // 对于厂商特殊实现的 WindowManager，保留资源显示参数作为回退方案。
        }

        float scale = Math.min(widthPixels / 1920f, heightPixels / 1080f);
        scale = Math.max(0.5f, Math.min(scale, 4f));
        return Math.round(value * scale);
    }

    private GradientDrawable roundedPx(int color, int radius, int strokeWidth, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(px(radius));
        if (strokeWidth > 0) drawable.setStroke(px(strokeWidth), strokeColor);
        return drawable;
    }

    private GradientDrawable gradientPx(int[] colors, int radius) {
        GradientDrawable drawable = new GradientDrawable(GradientDrawable.Orientation.TL_BR, colors);
        drawable.setCornerRadius(px(radius));
        drawable.setStroke(px(1), Color.rgb(24, 83, 60));
        return drawable;
    }

    private Drawable screenBackground() {
        return new Drawable() {
            private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

            @Override protected void onBoundsChange(Rect bounds) {
                float width = bounds.width();
                float height = bounds.height();
                float centerX = width * 0.64f;
                float centerY = -height * 0.20f;
                float radius = (float) Math.hypot(
                    Math.max(centerX, width - centerX),
                    Math.max(Math.abs(centerY), height - centerY)
                );
                paint.setShader(new RadialGradient(
                    centerX,
                    centerY,
                    radius,
                    new int[]{Color.rgb(23, 77, 57), Color.rgb(11, 39, 29), Color.rgb(7, 24, 18), Color.rgb(7, 24, 18)},
                    new float[]{0f, 0.38f, 0.78f, 1f},
                    Shader.TileMode.CLAMP
                ));
            }

            @Override public void draw(Canvas canvas) { canvas.drawRect(getBounds(), paint); }
            @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
            @Override public void setColorFilter(android.graphics.ColorFilter filter) { paint.setColorFilter(filter); }
            @Override public int getOpacity() { return android.graphics.PixelFormat.OPAQUE; }
        };
    }

    private StateListDrawable advanceButtonBackground() {
        StateListDrawable states = new StateListDrawable();
        GradientDrawable normal = gradientPx(
            new int[]{Color.rgb(27, 62, 44), Color.rgb(18, 60, 45)},
            6
        );
        normal.setStroke(px(1), Color.rgb(78, 113, 45));
        GradientDrawable disabled = roundedPx(Color.rgb(24, 49, 38), 6, 1, Color.rgb(47, 75, 61));
        states.addState(new int[]{-android.R.attr.state_enabled}, disabled);
        states.addState(new int[]{}, normal);
        return states;
    }

    private Button button(String value, boolean selected) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextSize(15);
        button.setTextColor(selected ? Color.rgb(15, 46, 33) : TEXT);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(12), 0, dp(12), 0);
        button.setFocusable(true);
        button.setBackground(buttonBackground(selected ? LIME : PANEL_LIGHT));
        button.setOnFocusChangeListener((view, focused) -> button.setTextColor(focused ? Color.rgb(12, 39, 28) : selected ? Color.rgb(15, 46, 33) : TEXT));
        return button;
    }

    private StateListDrawable buttonBackground(int normalColor) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, rounded(LIME, 10));
        states.addState(new int[]{android.R.attr.state_pressed}, rounded(LIME, 10));
        states.addState(new int[]{-android.R.attr.state_enabled}, rounded(Color.rgb(35, 53, 45), 10));
        states.addState(new int[]{}, rounded(normalColor, 10));
        return states;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setStroke(dp(1), Color.rgb(49, 91, 70));
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String signed(int value) {
        return (value > 0 ? "+" : "") + numbers.format(value);
    }

    private void toast(String message) {
        Toast.makeText(this, message == null ? "操作失败" : message, Toast.LENGTH_LONG).show();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if ((controlDialog == null || !controlDialog.isShowing())
            && event.getAction() == KeyEvent.ACTION_UP
            && (event.getKeyCode() == KeyEvent.KEYCODE_MENU
                || event.getKeyCode() == KeyEvent.KEYCODE_DPAD_RIGHT)) {
            openControlPanel();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    @SuppressLint("GestureBackNavigation")
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (controlDialog != null && controlDialog.isShowing()) controlDialog.dismiss();
        else moveTaskToBack(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        main.removeCallbacks(statePoll);
        main.post(statePoll);
    }

    @Override
    protected void onPause() {
        main.removeCallbacks(statePoll);
        super.onPause();
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
        main.removeCallbacks(statePoll);
        io.shutdownNow();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
