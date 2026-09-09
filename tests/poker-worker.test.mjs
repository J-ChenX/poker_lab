import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import test from "node:test";

const assetDirectory = new URL("../dist/client/_next/static/", import.meta.url);
const workerAsset = (await readdir(assetDirectory)).find((name) => /^poker\.worker-.*\.js$/.test(name));
assert.ok(workerAsset, "Production build must emit a separate poker worker asset");
const baseline = JSON.parse(await readFile(new URL("./fixtures/poker-baseline.json", import.meta.url), "utf8"));

test("client creates workers from the emitted HTTP asset, not a build-time file URL", async () => {
  const chunks = new URL("chunks/", assetDirectory);
  const sources = await Promise.all((await readdir(chunks)).filter((name) => name.endsWith(".js"))
    .map((name) => readFile(new URL(name, chunks), "utf8")));
  const workerClients = sources.filter((source) => source.includes("new Worker("));
  assert.ok(workerClients.length > 0);
  for (const source of workerClients) {
    assert.ok(source.includes(`/_next/static/${workerAsset}`));
    assert.doesNotMatch(source, /file:\/\//, "Worker creation must never resolve against a source-file URL");
  }
});

// Execute the actual production bundle in a separate thread with the standard
// Worker messaging surface. No DOM or browser is required for this integration test.
function startWorker(t) {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    globalThis.postMessage = (data) => parentPort.postMessage(data);
    require('node:vm').runInThisContext(require('node:fs').readFileSync(workerData, 'utf8'));
    parentPort.on('message', (data) => globalThis.onmessage({ data }));
  `, { eval: true, workerData: fileURLToPath(new URL(workerAsset, assetDirectory)) });
  t.after(() => worker.terminate());
  return worker;
}

function request(worker, data, terminalType) {
  return new Promise((resolve, reject) => {
    const messages = [];
    worker.on("error", reject);
    worker.on("message", (message) => {
      messages.push(message);
      if (message.type === terminalType) resolve(messages);
      else if (message.type === "error") reject(new Error(message.message));
    });
    worker.postMessage(data);
  });
}

test("production worker computes the complete flop distribution", { timeout: 10_000 }, async (t) => {
  const [message] = await request(startWorker(t), { type: "distribution", hero: baseline.hero, board: baseline.conditional.board }, "distribution");
  assert.equal(message.result.samples, 178_365);
  assert.equal(message.result.drawCount, 4);
  assert.ok(Math.abs(message.result.categories.reduce((a, b) => a + b, 0) - 100) < 1e-9);
});

test("production worker streams estimates and progress then preserves the full original 500,000-sample result", { timeout: 15_000 }, async (t) => {
  const messages = await request(startWorker(t), { type: "calculate", hero: baseline.hero, board: baseline.conditional.board, opponents: 4 }, "done");
  assert.equal(messages[0].type, "estimate");
  assert.equal(messages[1].type, "model");
  const progress = messages.filter((message) => message.type === "progress").map((message) => message.progress);
  assert.ok(progress.length > 0);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => value > 0 && value <= 1 && (!index || value >= progress[index - 1])));
  const result = messages.at(-1).result;
  assert.equal(result.table.samples, 500_000);
  assert.equal(result.conditionalWin.source, "monte_carlo");
  assert.equal(createHash("sha256").update(JSON.stringify(result)).digest("hex"), baseline.workerFingerprint);
});

test("worker failures are reported instead of leaving a calculation running", { timeout: 10_000 }, async (t) => {
  const [message] = await request(startWorker(t), { type: "calculate", hero: [], board: [], opponents: 4 }, "error");
  assert.equal(message.type, "error");
  assert.ok(message.message.length > 0);
});

test("terminating a worker during the conditional model cancels all later results", { timeout: 10_000 }, async (t) => {
  const worker = startWorker(t);
  const messages = [];
  await new Promise((resolve, reject) => {
    worker.on("error", reject);
    worker.on("message", (message) => {
      messages.push(message.type);
      if (message.type === "estimate") worker.terminate().then(resolve, reject);
      else if (message.type === "error") reject(new Error(message.message));
    });
    worker.postMessage({ type: "calculate", hero: baseline.hero, board: baseline.conditional.board, opponents: 8 });
  });
  assert.deepEqual(messages, ["estimate"]);
});
