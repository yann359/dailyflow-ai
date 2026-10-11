# 开发说明

## 设计与分层

采用 Next.js App Router + TypeScript。首页为服务端静态外壳，日常应用与IndexedDB在客户端运行，`app/api/ai/route.ts`只在服务端使用OpenAI密钥。界面使用Tailwind CSS 4与语义CSS设计系统，基础弹窗使用Radix Dialog，按shadcn/ui组织；Motion尊重减少动态效果设置，Recharts仅显示真实记录。

业务层负责日期、营养、训练排期和统计，存储层负责Zod验证、事务和持久化。UI只组合这些接口。新增动作改`lib/workouts.ts`，新增表和版本改`lib/schemas.ts`、`lib/db.ts`，不要把身体参数写进计算逻辑。

## 日常开发

1. `npm ci`按锁定文件安装。
2. `npm run dev`打开页面并修改功能。
3. 提交前运行类型检查、ESLint、单元测试与正式构建。
4. 修改录入流程或离线策略后再运行Playwright。

所有记录默认空白，初始档案和参考食物仅为起步配置。不要添加假的进度或图表。记录日期使用用户设置的IANA时区，元数据时间使用UTC ISO时间戳。营养记录保存快照，修改标签不追溯修改历史。

## PWA升级

服务工作线程仅在生产运行注册。只缓存应用外壳和版本化静态资源；AI接口、RSC请求、私人照片均不进入Cache Storage。升级离线协议时修改`public/sw.js`中的缓存版本，保留IndexedDB独立存储，不清理用户记录。新版本等待浏览器关闭旧窗口后接管，避免旧HTML引用缺失资源。

## 后续阶段

- Supabase认证、RLS、私人Storage桶、跨设备同步与专项测试。
- 外部AI凭证配置后进行真实模型验收、营养标签读图准确性评估。
- 多用户AI使用账号会话、用户级配额和持续账单统计，替代个人版共用访问口令。
- 真正的通知调度、数据查询分页、长周期性能与Safari实机回归。

不从Codex、ChatGPT或其他客户端读取登录令牌，不把备份、照片、密钥和真实用户记录加入Git仓库。
