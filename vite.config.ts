import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS 的 Seatbelt 沙箱会阻止 FSEvents，因此 Codex 预览需通过轮询实现热更新。
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

function readOrigin(value: string | undefined, name: string) {
  if (!value?.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${name} 必须是 HTTP(S) 根地址，例如 https://poker.example.com`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} 只能包含 HTTP(S) 根地址，不能包含账号密码、路径、查询参数或片段`);
  }
  return url;
}

export default defineConfig(async ({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "POKER_");
  const serverUrl = readOrigin(environment.POKER_SERVER_URL, "POKER_SERVER_URL");
  const siteUrl = readOrigin(environment.POKER_SITE_URL, "POKER_SITE_URL");
  const allowedHosts = serverUrl ? [serverUrl.hostname] : [];

  // 将 Wrangler 和 Miniflare 的状态保存在项目目录中。这些工具设置不含敏感信息；
  // 应用的实际环境配置应放在已被 Git 忽略的 `.env*` 文件中。
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler 会在导入 Cloudflare 插件时确定日志路径，因此需提前设置。
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // 仅注入网页元数据所需的公开地址；实际配置保留在已忽略的环境文件中。
    // 此值在构建时确定，修改后需重新构建；未配置时使用本地开发地址。
    define: {
      "process.env.POKER_SITE_URL": JSON.stringify(siteUrl?.origin ?? "http://localhost:3000"),
    },
    build: { target: "chrome61" },
    server: {
      host: "0.0.0.0",
      allowedHosts,
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
