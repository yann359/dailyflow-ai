# 轻律 DailyFlow AI

移动端优先的个人饮食、居家训练与习惯管理应用。找到自己的节奏，每一天轻一点，也好一点。

[**在线体验 → 轻律 DailyFlow AI**](https://dailyflow-ai-zeta.vercel.app) · [GitHub 自动检查](https://github.com/yann359/dailyflow-ai/actions)

> 本项目当前为本地优先 MVP，已通过 Vercel 发布。无需账号或 API 密钥即可使用。所有个人记录保存在当前浏览器，不会作为示例数据上传 GitHub。

## 已实现

- 今日概览：真实营养进度、今日训练、习惯打卡、本周统计，可隐藏模块。
- 饮食：四餐分类、历史日期、食物收藏、自定义营养标签、按实际食用量换算、CRUD、营养快照。
- 一句话录入：本地规则可识别明确食物与份量；AI解析经过结构校验并确认后保存。
- 12周 A/B 全身居家训练：每周3次、前两周减量、动作指导、实际组/次数/负重记录、草稿、休息计时、暂停与调整。
- 习惯：每日或每周目标、日历补录、连续完成天/周统计、编辑、暂停、恢复与删除。
- 身体：体重、腰围、每周均值、真实趋势图、训练次数趋势、仅本机照片对比。
- 设置：可修改档案、营养目标、训练日、时区、主题与本机数据管理。
- IndexedDB + Dexie：事务、结构校验、JSON备份、合并导入、迁移版本、删除标记与同步待办。
- AI Provider：OpenAI官方SDK + Responses API、结构化输出、流式传输、图像输入、超时/一次重试、访问口令与调用配额。
- PWA：图标、Manifest、安全区域、首次在线打开后离线可用、添加主屏幕。

## 本地启动

需要 Node.js 22 LTS 或更高的兼容版本。

```powershell
npm ci
npm run dev
```

打开 <http://localhost:3000>。开发服务器监听 `0.0.0.0`，手机与电脑连接同一 Wi-Fi 后访问 `http://电脑局域网IP:3000`。Windows防火墙需允许该端口；不要对公网开放开发服务器。局域网HTTP可以预览页面，但PWA安装和服务工作线程需要HTTPS或localhost。

正式构建运行：

```powershell
npm run build
npm run start
```

## 检查

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

端到端测试使用独立浏览器上下文和本机测试数据库，不接触日常使用的浏览器记录。覆盖 iPhone 390px 和桌面 1440px；PWA离线测试使用正式构建。支持使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已安装浏览器。

## AI接入

第一版默认关闭外部AI。本地解析和周报会明确标记为规则计算；不会伪装成模型分析。

复制 `.env.example` 为 `.env.local`，在本机安全设置服务端环境变量，**不要提交真实密钥**。设置 `OPENAI_API_KEY`、`OPENAI_MODEL`、`AI_ENABLED=true`、随机的 `AI_ACCESS_CODE`。在网站「我的」中启用AI并输入访问口令。口令只保存在当前页面内存，API密钥永不交给浏览器。

Vercel启用AI前还必须配置 Upstash Redis REST，用于跨实例每日/月度/每分钟调用限额；缺少该配置时接口自动保持关闭。API账户独立计费，请在OpenAI后台设置预算和告警；本项目限制请求数和输出量，不能保证准确的金额硬上限。

使用ChatGPT登录暂不可用：本项目没有获批合作方资格与OAuth客户端。官方方案、资格边界和资料见 [AI接入说明](docs/ai.md)。

## 部署与后续

已部署到 [Vercel 正式网站](https://dailyflow-ai-zeta.vercel.app)，Next.js页面与服务端接口均可运行。`main` 分支推送会触发自动部署。GitHub About 和本页均提供网站入口。见 [部署说明](docs/deployment.md)和[验收记录](docs/verification.md)。

Supabase云同步为下一阶段：当前没有账号、云数据库或跨设备自动同步。已有数据模型和SyncAdapter边界，为RLS、删除同步、冲突处理、去重和重试预留接口；未完成两设备验收前不会标记为云同步可用。

## 目录

```text
app/                 页面、全局设计系统、服务端AI接口
components/          概览、表单、训练、趋势、设置与教练
components/ui/       shadcn/ui风格基础组件（Radix Dialog）
lib/                 数据校验、Dexie、日期、营养、训练、统计
lib/ai/              提供方、契约、客户端与访问/预算保护
public/              PWA缓存、Manifest、图标
tests/               业务/数据库/AI测试与Playwright流程
docs/                开发、数据、AI、部署和验收说明
.github/workflows/   GitHub自动检查
```

个人记录和备份属于敏感数据，请定期导出并妥善保管。浏览器的隐私模式、清理网站数据和系统存储回收可能导致本机数据丢失；页面中可申请持久存储，但仍需备份。
