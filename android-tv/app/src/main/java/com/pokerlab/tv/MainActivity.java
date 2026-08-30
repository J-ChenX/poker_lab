package com.pokerlab.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.DisplayMetrics;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String DEFAULT_BASE_URL = "https://tv.example.com";
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
            refreshState(false);
            main.postDelayed(this, 2500);
        }
    };

    private WebView webView;
    private LinearLayout nativeDashboard;
    private LinearLayout nativePlayerList;
    private TextView nativePlayerTotal;
    private TextView nativeLevelValue;
    private TextView nativePlayerCount;
    private TextView nativeSmallBlind;
    private TextView nativeBigBlind;
    private TextView nativeReviveCost;
    private TextView nativeReviveChips;
    private TextView connectionStatus;
    private Button controlButton;
    private Dialog controlDialog;
    private GameState state;
    private String baseUrl;
    private String authUsername;
    private String authPassword;
    private volatile boolean refreshInFlight;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();

        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        baseUrl = preferences.getString(PREF_BASE_URL, DEFAULT_BASE_URL);
        authUsername = preferences.getString(PREF_AUTH_USERNAME, "");
        authPassword = preferences.getString(PREF_AUTH_PASSWORD, "");

        FrameLayout root = new FrameLayout(this);
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
        settings.setUserAgentString(settings.getUserAgentString() + " PokerLabTV/1.0");
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                setConnectionText("看板已连接", true);
                view.evaluateJavascript("document.querySelectorAll('header a,header button').forEach(function(e){e.style.display='none'})", null);
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

        nativeDashboard = createNativeDashboard();
        nativeDashboard.setVisibility(View.GONE);
        root.addView(nativeDashboard, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.HORIZONTAL);
        overlay.setGravity(Gravity.CENTER_VERTICAL);
        overlay.setPadding(dp(12), dp(8), dp(12), dp(8));
        overlay.setBackground(rounded(PANEL, 12));

        connectionStatus = text("正在连接", 13, MUTED, false);
        overlay.addView(connectionStatus, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        controlButton = button("牌桌控制", false);
        LinearLayout.LayoutParams controlParams = new LinearLayout.LayoutParams(dp(150), dp(52));
        controlParams.leftMargin = dp(14);
        overlay.addView(controlButton, controlParams);
        controlButton.setOnClickListener(view -> openControlPanel());

        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        overlayParams.topMargin = dp(18);
        overlayParams.rightMargin = dp(20);
        root.addView(overlay, overlayParams);

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
        webView.loadUrl(baseUrl + "/display?tvapp=1");
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

    private LinearLayout createNativeDashboard() {
        LinearLayout dashboard = new LinearLayout(this);
        dashboard.setOrientation(LinearLayout.VERTICAL);
        dashboard.setPadding(dp(30), dp(14), dp(30), dp(26));
        dashboard.setBackgroundColor(BG);

        LinearLayout header = row();
        TextView brand = text("♠  牌桌实时看板", 21, TEXT, true);
        header.addView(brand, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        dashboard.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(72)));

        LinearLayout body = row();
        body.setGravity(Gravity.FILL);

        LinearLayout ranking = new LinearLayout(this);
        ranking.setOrientation(LinearLayout.VERTICAL);
        ranking.setPadding(dp(20), dp(18), dp(20), dp(18));
        ranking.setBackground(rounded(PANEL, 16));
        LinearLayout rankingHead = row();
        rankingHead.addView(text("01   实时积分排名", 22, TEXT, true), new LinearLayout.LayoutParams(0, dp(48), 1));
        nativePlayerTotal = text("0 位牌手", 13, MUTED, false);
        nativePlayerTotal.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        rankingHead.addView(nativePlayerTotal, new LinearLayout.LayoutParams(dp(100), dp(48)));
        ranking.addView(rankingHead);

        ScrollView playerScroll = new ScrollView(this);
        playerScroll.setFillViewport(true);
        nativePlayerList = new LinearLayout(this);
        nativePlayerList.setOrientation(LinearLayout.VERTICAL);
        playerScroll.addView(nativePlayerList, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ranking.addView(playerScroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        body.addView(ranking, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 0.7f));

        LinearLayout right = new LinearLayout(this);
        right.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams rightParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1.8f);
        rightParams.leftMargin = dp(18);
        body.addView(right, rightParams);

        LinearLayout levelCard = row();
        levelCard.setPadding(dp(30), dp(18), dp(30), dp(18));
        levelCard.setBackground(rounded(GREEN, 18));
        LinearLayout levelLabel = new LinearLayout(this);
        levelLabel.setOrientation(LinearLayout.VERTICAL);
        levelLabel.setGravity(Gravity.CENTER_VERTICAL);
        levelLabel.addView(text("当前轮次", 18, TEXT, true));
        levelLabel.addView(text("CURRENT LEVEL", 9, Color.rgb(145, 197, 170), false));
        levelCard.addView(levelLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        nativeLevelValue = text("L—", 76, LIME, true);
        nativeLevelValue.setGravity(Gravity.CENTER);
        levelCard.addView(nativeLevelValue, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        nativePlayerCount = text("— 人开局", 23, TEXT, true);
        nativePlayerCount.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        levelCard.addView(nativePlayerCount, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        LinearLayout.LayoutParams levelParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 0.72f);
        levelParams.bottomMargin = dp(14);
        right.addView(levelCard, levelParams);

        LinearLayout blindRow = row();
        blindRow.setGravity(Gravity.FILL);
        LinearLayout smallCard = nativeNumberCard("小盲", "SB", false);
        nativeSmallBlind = (TextView) smallCard.getTag();
        blindRow.addView(smallCard, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1));
        LinearLayout bigCard = nativeNumberCard("大盲", "BB", true);
        nativeBigBlind = (TextView) bigCard.getTag();
        LinearLayout.LayoutParams bigParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
        bigParams.leftMargin = dp(14);
        blindRow.addView(bigCard, bigParams);
        LinearLayout.LayoutParams blindParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.18f);
        blindParams.bottomMargin = dp(14);
        right.addView(blindRow, blindParams);

        LinearLayout reviveCard = row();
        reviveCard.setPadding(dp(30), dp(18), dp(30), dp(18));
        reviveCard.setBackground(rounded(PANEL, 18));
        LinearLayout reviveLabel = new LinearLayout(this);
        reviveLabel.setOrientation(LinearLayout.VERTICAL);
        reviveLabel.setGravity(Gravity.CENTER_VERTICAL);
        reviveLabel.addView(text("复活信息", 18, TEXT, true));
        reviveLabel.addView(text("REVIVAL", 9, MUTED, false));
        reviveCard.addView(reviveLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 0.72f));
        nativeReviveCost = nativeReviveMetric(reviveCard, "本轮复活价格");
        nativeReviveChips = nativeReviveMetric(reviveCard, "复活筹码");
        right.addView(reviveCard, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 0.78f));

        dashboard.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        return dashboard;
    }

    private LinearLayout nativeNumberCard(String label, String suffix, boolean accent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(28), dp(20), dp(28), dp(20));
        card.setBackground(rounded(accent ? Color.rgb(10, 68, 48) : PANEL, 18));
        card.addView(text(label, 18, TEXT, true));
        TextView value = text("—", 72, accent ? LIME : TEXT, true);
        value.setGravity(Gravity.CENTER_VERTICAL);
        card.addView(value, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        TextView unit = text(suffix, 24, Color.rgb(105, 130, 61), true);
        unit.setGravity(Gravity.END);
        card.addView(unit);
        card.setTag(value);
        return card;
    }

    private TextView nativeReviveMetric(LinearLayout parent, String label) {
        LinearLayout metric = new LinearLayout(this);
        metric.setOrientation(LinearLayout.VERTICAL);
        metric.setGravity(Gravity.CENTER_VERTICAL);
        metric.setPadding(dp(24), 0, 0, 0);
        metric.addView(text(label, 13, MUTED, false));
        TextView value = text("—", 42, TEXT, true);
        metric.addView(value);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
        params.leftMargin = dp(16);
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
        nativeSmallBlind.setText(numbers.format(Rulebook.SMALL_BLINDS[next.currentLevel - 1]));
        nativeBigBlind.setText(numbers.format(Rulebook.BIG_BLINDS[next.currentLevel - 1]));
        int cost = Rulebook.reviveCost(next.playerCount, next.currentLevel);
        nativeReviveCost.setText(cost > 0 ? "−" + numbers.format(cost) + " 分 / 次" : "不可复活");
        int chips = Rulebook.REVIVE_CHIPS[next.currentLevel - 1];
        nativeReviveChips.setText(cost > 0 && chips > 0 ? numbers.format(chips) + " 筹码" : "—");

        nativePlayerList.removeAllViews();
        List<GameState.Player> sorted = new ArrayList<>(next.players);
        Collections.sort(sorted, (first, second) -> {
            int scoreOrder = Integer.compare(second.score, first.score);
            return scoreOrder != 0 ? scoreOrder : first.name.compareToIgnoreCase(second.name);
        });
        if (sorted.isEmpty()) {
            TextView empty = text("牌桌正在等待玩家\n请在手机控制台中添加人员", 18, MUTED, false);
            empty.setGravity(Gravity.CENTER);
            nativePlayerList.addView(empty, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(240)));
            return;
        }
        for (int index = 0; index < sorted.size(); index++) {
            GameState.Player player = sorted.get(index);
            LinearLayout item = row();
            item.setPadding(dp(10), dp(5), dp(12), dp(5));
            item.setBackground(rounded(index < 3 ? Color.rgb(30, 57, 33) : PANEL_LIGHT, 10));
            TextView rank = text(String.valueOf(index + 1), 15, index < 3 ? LIME : MUTED, true);
            rank.setGravity(Gravity.CENTER);
            item.addView(rank, new LinearLayout.LayoutParams(dp(34), ViewGroup.LayoutParams.MATCH_PARENT));
            String initials = player.name.substring(0, Math.min(2, player.name.length())).toUpperCase(Locale.CHINA);
            TextView avatar = text(initials, 11, TEXT, true);
            avatar.setGravity(Gravity.CENTER);
            avatar.setBackground(rounded(Color.rgb(22, 60, 45), 24));
            item.addView(avatar, new LinearLayout.LayoutParams(dp(42), dp(42)));
            TextView name = text(player.name, 17, TEXT, true);
            name.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            nameParams.leftMargin = dp(12);
            item.addView(name, nameParams);
            TextView score = text(signed(player.score) + " 分", 21, player.score < 0 ? RED : LIME, true);
            score.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
            item.addView(score, new LinearLayout.LayoutParams(dp(120), ViewGroup.LayoutParams.MATCH_PARENT));
            LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
            itemParams.bottomMargin = dp(7);
            nativePlayerList.addView(item, itemParams);
        }
    }

    private void openControlPanel() {
        if (controlDialog != null && controlDialog.isShowing()) return;
        controlDialog = new Dialog(this, android.R.style.Theme_Material_NoActionBar);
        controlDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        renderControlPanel();
        controlDialog.setOnDismissListener(dialog -> controlDialog = null);
        controlDialog.show();
        Window window = controlDialog.getWindow();
        if (window != null) {
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            window.setLayout((int) (metrics.widthPixels * 0.92), (int) (metrics.heightPixels * 0.92));
            window.setBackgroundDrawable(rounded(BG, 20));
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams params = window.getAttributes();
            params.dimAmount = 0.72f;
            window.setAttributes(params);
        }
        refreshState(true);
    }

    private void renderControlPanel() {
        if (controlDialog == null) return;

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setPadding(dp(32), dp(24), dp(32), dp(24));
        shell.setBackgroundColor(BG);

        LinearLayout header = row();
        TextView title = text("牌桌控制台", 28, TEXT, true);
        header.addView(title, new LinearLayout.LayoutParams(0, dp(56), 1));
        Button refresh = button("刷新状态", false);
        refresh.setOnClickListener(view -> refreshState(true));
        header.addView(refresh, sized(130, 50, 8));
        Button settings = button("服务器设置", false);
        settings.setOnClickListener(view -> showServerSettings());
        header.addView(settings, sized(140, 50, 8));
        Button close = button("关闭", false);
        close.setOnClickListener(view -> controlDialog.dismiss());
        header.addView(close, sized(100, 50, 8));
        shell.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(62)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(8), 0, dp(28));

        if (state == null) {
            TextView loading = text("正在从 " + baseUrl + " 读取牌局状态…", 20, MUTED, false);
            loading.setGravity(Gravity.CENTER);
            content.addView(loading, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(220)));
        } else {
            content.addView(summaryCard());
            content.addView(sectionTitle("本局开始人数", "人数会影响名次分、淘汰分和复活价格"));
            content.addView(playerCountGrid());
            content.addView(sectionTitle("当前盲注等级", "切换后手机和电视看板会自动同步"));
            content.addView(levelGrid());
            content.addView(sectionTitle("计分名次", "先选择每个名次，再单独确认结算"));
            content.addView(rankControls());
            content.addView(sectionTitle("快速操作", "淘汰支持多人平分；复活每次只记录一人"));
            content.addView(actionControls());
        }

        scroll.addView(content, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        shell.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        controlDialog.setContentView(shell);
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

    private View playerCountGrid() {
        GridLayout grid = grid(5);
        for (int count = 3; count <= 12; count++) {
            final int nextCount = count;
            Button item = button(count + " 人", count == state.playerCount);
            item.setOnClickListener(view -> sendSetGame(nextCount, state.currentLevel, ranksForCount(nextCount), "人数已更新"));
            grid.addView(item, gridCell());
        }
        return grid;
    }

    private View levelGrid() {
        GridLayout grid = grid(5);
        for (int level = 1; level <= 10; level++) {
            final int nextLevel = level;
            String label = "L" + level + "  ·  " + Rulebook.SMALL_BLINDS[level - 1] + "/" + Rulebook.BIG_BLINDS[level - 1];
            Button item = button(label, level == state.currentLevel);
            item.setOnClickListener(view -> sendSetGame(state.playerCount, nextLevel, ranksForCount(state.playerCount), "等级已更新"));
            grid.addView(item, gridCell());
        }
        return grid;
    }

    private View rankControls() {
        LinearLayout block = new LinearLayout(this);
        block.setOrientation(LinearLayout.VERTICAL);
        int places = Rulebook.scoringPlaceCount(state.playerCount);
        for (int rank = 0; rank < places; rank++) {
            String name = rank < state.rankedPlayers.size() ? state.rankedPlayers.get(rank) : "";
            int points = Rulebook.placementScore(state.playerCount, rank + 1);
            Button rankButton = button("第 " + (rank + 1) + " 名  ·  " + (name.isEmpty() ? "选择人员" : name) + "  ·  ＋" + points + " 分", !name.isEmpty());
            final int rankIndex = rank;
            rankButton.setOnClickListener(view -> showRankPicker(rankIndex));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
            params.bottomMargin = dp(8);
            block.addView(rankButton, params);
        }

        Button settle = button("确认结算名次积分", canSettleRanks());
        settle.setEnabled(canSettleRanks());
        settle.setOnClickListener(view -> confirmSettlement());
        LinearLayout.LayoutParams settleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(62));
        settleParams.topMargin = dp(6);
        block.addView(settle, settleParams);
        return block;
    }

    private View actionControls() {
        GridLayout grid = grid(2);
        Button knockout = button("✦  淘汰加分", false);
        knockout.setEnabled(!state.players.isEmpty());
        knockout.setOnClickListener(view -> showKnockoutPicker());
        grid.addView(knockout, gridCellTall());

        int cost = Rulebook.reviveCost(state.playerCount, state.currentLevel);
        Button revive = button(cost > 0 ? "↻  复活扣分  −" + cost : "↻  当前等级不可复活", false);
        revive.setEnabled(cost > 0 && !state.players.isEmpty());
        revive.setOnClickListener(view -> showRevivePicker());
        grid.addView(revive, gridCellTall());
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
                    nativeDashboard.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
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
                    state = next;
                    renderNativeDashboard(next);
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
        if (event.getAction() == KeyEvent.ACTION_UP && event.getKeyCode() == KeyEvent.KEYCODE_MENU) {
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
