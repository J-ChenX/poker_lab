# Poker Lab

德州扑克牌局工具，包含跨设备同步的积分簿和独立的胜率计算器。

## 页面

- `/`：牌桌积分簿。管理人员与积分、结算名次、记录淘汰奖励和复活扣分。
- `/calculate`：德州扑克胜率与决策辅助计算器。
- `/score`：已停用，不提供兼容跳转。

## 本地运行

需要 Node.js 22.13 或更高版本。

首次克隆仓库后，将 `.openai/hosting.example.json` 复制为 `.openai/hosting.json`。已有本地配置时保留原文件；示例不含私人项目 ID，可用于本地构建和数据库绑定。

```powershell
Copy-Item .openai/hosting.example.json .openai/hosting.json
```

```bash
pnpm install
pnpm dev
```

本地开发地址默认为 `http://localhost:3000`。积分数据写入本机的 Cloudflare D1 开发数据库；`.wrangler/` 内含本地数据，不要在清理构建文件时误删。

### cpolar 访问地址配置

在项目根目录执行以下命令，再编辑 `.env.local` 中的 `POKER_SERVER_URL`；已有此文件时直接编辑，避免覆盖现有配置。

```powershell
Copy-Item .env.example .env.local
```

```dotenv
POKER_SERVER_URL=https://poker.example.com
```

将示例域名替换为自己的 cpolar HTTPS 根地址，不含 `/display`、账号密码、查询参数或片段。这个变量同时用于 Vite 开发服务器的主机白名单和 Android TV Release 包的默认服务器地址。它不创建或修改 cpolar 隧道，也不设置访问保护。

共同配置放在根目录 `.env.local`（优先于 `.env`），系统环境变量优先级最高。Android 读取单行字面 URL，不支持变量展开；Vite 还支持模式专属环境文件，跨端共用地址时请使用 `.env.local`。修改后重启开发服务，并重新构建 Android APK；电视已保存的地址可在其服务器设置中修改。未配置时网页仍可在 localhost 运行，Android Release 使用示例地址占位。

`.env.local` 不会提交到 Git；`.env.example` 是可提交的配置示范。不要为此变量添加 `VITE_` 前缀，以免把本地地址自动暴露给网页客户端。Android 的默认地址会写进 APK，适合配置域名，不适合存放密钥。

### 网页站点地址配置

在根目录 `.env.local` 中填写网页分享元数据使用的公开根地址：

```dotenv
POKER_SITE_URL=https://poker.example.com
```

替换为自己的 Sites 域名或自定义域名，不含路径、账号密码、查询参数或片段。页面分享图片统一使用相对路径 `/og.png`，由此变量补全为绝对地址。未配置时使用 `http://localhost:3000`。

该值在启动开发服务或构建网站时读取；修改后需重启开发服务，或重新构建并发布。它不修改 Sites 平台分配的域名，也不影响 Android TV 的连接地址。构建产物和页面元数据会包含配置的公开地址；公开源码仅保留变量名和示例。

## 数据与规则

- [德州扑克升盲与积分规则说明书](德州扑克升盲与积分规则说明书.md)：适合在 GitHub 直接阅读的 Markdown 文档。
- D1 表结构：`db/schema.ts`
- 积分与盲注规则：`app/score/rules.ts`
- 共享状态接口：`app/api/score-state/route.ts`
- 浏览器通过接口轮询版本号，使不同设备看到同一份人员、积分、开局人数、当前等级和名次选择。

### 复活规则（2026-09-08 调整）

初始筹码为 2,000。单次复活筹码 = min(4,000, 2,000 + (等级 − 1) × 500)。
L1 与初始筹码一致，后续每级增加 500，最高为两倍初始筹码。

| 等级 | 大盲 | 复活筹码 | 5–6 人扣分 | 7–8 人扣分 | 9–10 人扣分 | 11–12 人扣分 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L1 | 10 | 2,000 | 11 | 12 | 14 | 15 |
| L2 | 20 | 2,500 | 13 | 14 | 16 | 17 |
| L3 | 40 | 3,000 | 14 | 16 | 18 | 19 |
| L4 | 60 | 3,500 | 15 | 17 | 20 | 21 |
| L5 | 100 | 4,000 | 17 | 19 | 22 | 23 |
| L6 | 140 | 4,000 | 17 | 19 | 22 | 23 |
| L7 | 200 | 4,000 | 17 | 19 | 22 | 23 |
| L8–L10 | 300–600 | 不可复活 | — | — | — | — |

沿用原定价公式：P(N) 为全部有效名次积分之和，K(N) = ceil(N / 4) + 1，
单次扣分 = ceil(P(N) × 复活筹码 / (2,000 × N + 复活筹码) + K(N))。
两人一档，取档内两个开局人数的较高价格。3–4 人局不开放复活。
本次调整后的筹码和价格已同步至 Markdown 说明书 1.2 版（2026-09-09 更新）。Word 原稿仅在本地保留，不提交到仓库。
已记录的积分不追溯修改。电视原生应用需要安装 v2.7.1 或更高版本才能使用新规则。

## 质量检查

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

`pnpm test` 会完成生产构建、校验 `/`、`/calculate` 与已停用的 `/score`，并运行积分规则和扑克计算测试。

## 构建与发布

```bash
pnpm build
```

项目使用 vinext 构建并部署到 OpenAI Sites；`.openai/hosting.json` 声明了 Sites 项目及 D1 绑定。生产访问地址由部署平台和 cpolar 入口配置决定。
