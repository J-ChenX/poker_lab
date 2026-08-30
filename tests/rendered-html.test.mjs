import assert from "node:assert/strict";
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
});

test("旧的 /score 路径不再兼容", async () => {
  const response = await render("/score");
  assert.equal(response.status, 404);
});
