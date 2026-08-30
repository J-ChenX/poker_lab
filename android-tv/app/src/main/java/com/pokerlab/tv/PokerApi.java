package com.pokerlab.tv;

import android.util.Base64;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class PokerApi {
    private final String baseUrl;
    private final String username;
    private final String password;

    PokerApi(String baseUrl, String username, String password) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.username = username == null ? "" : username;
        this.password = password == null ? "" : password;
    }

    GameState fetchState() throws Exception {
        return GameState.fromJson(request("GET", null));
    }

    GameState post(JSONObject payload) throws Exception {
        return GameState.fromJson(request("POST", payload));
    }

    private JSONObject request(String method, JSONObject payload) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + "/api/score-state").openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(10000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-cache");
        if (!username.isEmpty()) {
            String credentials = username + ":" + password;
            connection.setRequestProperty("Authorization", "Basic " + Base64.encodeToString(credentials.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
        }
        if (payload != null) {
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(body); }
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        String response = readAll(stream);
        connection.disconnect();
        if (status < 200 || status >= 300) {
            String message = "服务器返回 " + status;
            try { message = new JSONObject(response).optString("error", message); } catch (Exception ignored) {}
            throw new IOException(message);
        }
        return new JSONObject(response);
    }

    private static String readAll(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }
}
