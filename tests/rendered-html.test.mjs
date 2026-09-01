import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

function render(path) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    environment,
    context,
  );
}

test("积分簿是站点首页", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /牌桌积分簿/);
  assert.match(html, /德州扑克电子记分系统/);
  assert.match(html, /电视看板/);
});

test("计算器保留在 /calculate", async () => {
  const response = await render("/calculate");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /POKER LAB/);
  assert.match(html, /你的底牌/);
});

test("电视看板可通过 /display 打开", async () => {
  const response = await render("/display");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /牌桌实时看板/);
  assert.match(html, /实时积分排名/);
  assert.doesNotMatch(html, /打开更多牌桌控制/);
});

test("电视 APK 页面不包含旧 WebView 无法解析的首屏语法", async () => {
  const response = await render("/display?tvapp=1&apk=test");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.doesNotMatch(html, /\?\?=/);
  assert.match(html, /width=1920,user-scalable=no/);
  assert.match(html, /setAttribute\("data-tv-app",\s*"1"\)/);
});

test("电视 APK 为旧 WebView 保留原生像素看板与内置字体", async () => {
  const source = await readFile(
    fileURLToPath(new URL("../android-tv/app/src/main/java/com/pokerlab/tv/MainActivity.java", import.meta.url)),
    "utf8",
  );
  const serifFont = await readFile(
    fileURLToPath(new URL("../android-tv/app/src/main/assets/fonts/noto-serif-sc-display.ttf", import.meta.url)),
  );
  assert.match(source, /createNativeDashboard\(boolean compact\)/);
  assert.match(source, /compact \? px\(614\)/);
  assert.match(source, /metrics\.widthPixels \* 0\.68/);
  assert.doesNotMatch(source, /textPx\("01"/);
  assert.match(source, /displaySerif/);
  assert.match(source, /getRealMetrics\(realMetrics\)/);
  assert.match(source, /Math\.round\(px\(size\) \* 1\.5f\)/);
  assert.match(source, /main\.postDelayed\(this, 2500\)/);
  assert.ok(serifFont.byteLength > 10_000);
});

test("旧的 /score 路径不再兼容", async () => {
  const response = await render("/score");
  assert.equal(response.status, 404);
});
