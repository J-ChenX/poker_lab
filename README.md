# Poker Lab

德州扑克牌局工具，包含跨设备同步的积分簿和独立的胜率计算器。

## 页面

- `/`：牌桌积分簿。管理人员与积分、结算名次、记录淘汰奖励和复活扣分。
- `/calculate`：德州扑克胜率与决策辅助计算器。
- `/score`：已停用，不提供兼容跳转。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

本地开发地址默认为 `http://localhost:3000`。积分数据写入本机的 Cloudflare D1 开发数据库；`.wrangler/` 内含本地数据，不要在清理构建文件时误删。

## 数据与规则

- D1 表结构：`db/schema.ts`
- 积分与盲注规则：`app/score/rules.ts`
- 共享状态接口：`app/api/score-state/route.ts`
- 浏览器通过接口轮询版本号，使不同设备看到同一份人员、积分、开局人数、当前等级和名次选择。

## 质量检查

```bash
npm run lint
npx tsc --noEmit
npm test
```

`npm test` 会完成生产构建、校验 `/`、`/calculate` 与已停用的 `/score`，并运行积分规则和扑克计算测试。

## 构建与发布

```bash
npm run build
```

项目使用 vinext 构建并部署到 OpenAI Sites；`.openai/hosting.json` 声明了 Sites 项目及 D1 绑定。生产访问地址由部署平台和 cpolar 入口配置决定。
