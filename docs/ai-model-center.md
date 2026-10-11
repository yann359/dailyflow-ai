# AI 模型中心：配置与使用

这是原 DailyFlow AI 的增量升级。健康数据仍在原浏览器中；模型配置与费用统计在服务端，两个存储不互相替代。

## 先完成服务端保护

在现有 [Vercel 项目环境变量页](https://vercel.com/yann359s-projects/dailyflow-ai/settings/environment-variables) 的 Production 范围配置。不要把任何密钥、口令贴到聊天、源码或 GitHub。

| 变量                       | 用途                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| `AI_ENABLED`               | 配好保护后填写 `true`；未完成时保持 `false`                      |
| `AI_ACCESS_CODE`           | 使用者访问口令，独立随机值至少 32 字符                           |
| `AI_ADMIN_ACCESS_CODE`     | 管理员口令，另一个至少 32 字符随机值，不能与使用者相同           |
| `AI_SESSION_SECRET`        | 签名密钥，第三个至少 32 字符随机值，不输入网页                   |
| `UPSTASH_REDIS_REST_URL`   | Upstash 数据库的 HTTPS REST 地址                                 |
| `UPSTASH_REDIS_REST_TOKEN` | 同一数据库的服务端 REST token                                    |
| `AI_DAILY_REQUEST_LIMIT`   | 全应用每日请求次数，例如 30                                      |
| `AI_MONTHLY_REQUEST_LIMIT` | 全应用每月请求次数，例如 300                                     |
| `AI_MONTHLY_BUDGET_USD`    | 应用估算美元预算，例如 5                                         |
| `AI_TIMEOUT_MS`            | 单次模型调用超时，默认 25000，最多 45000                         |
| `AI_STORAGE_NAMESPACE`     | 稳定的 Redis 命名空间，默认 dailyflow-ai，轮换口令不改变数据位置 |

创建 Redis 可使用 [Upstash Console](https://console.upstash.com)。Production / Preview 通过 VERCEL_ENV 使用独立配置与预算命名空间；如共用服务商密钥，应同时在服务商平台设置总费用限额。开发环境可以不用 Redis，但模型配置/预算只在服务进程内保存，重启会重置；Vercel 不允许该内存替代方案。

当前采用个人部署的使用者/管理员口令认证，不是多用户账号体系。登录后建立一小时 HttpOnly、SameSite=Strict 会话；浏览器不保存口令。退出可清除当前会话；轮换 AI_SESSION_SECRET 会让全部会话立即失效。不要把访问或管理员口令公开分享。

## 配至少一家服务商

| 服务商           | 环境变量            | 官方入口                                                            | 协议                      |
| ---------------- | ------------------- | ------------------------------------------------------------------- | ------------------------- |
| OpenAI GPT       | `OPENAI_API_KEY`    | [OpenAI API Keys](https://platform.openai.com/api-keys)             | 官方 Responses            |
| DeepSeek         | `DEEPSEEK_API_KEY`  | [DeepSeek 平台](https://platform.deepseek.com)                      | 官方 Chat Completions     |
| Kimi / Moonshot  | `MOONSHOT_API_KEY`  | [Kimi 开放平台](https://platform.moonshot.cn)                       | 官方兼容 Chat Completions |
| 豆包 / 方舟      | `ARK_API_KEY`       | [方舟 API Key](https://ark.volcengine.com/region:cn-beijing/apikey) | 正式方舟 Chat API         |
| Google Gemini    | `GEMINI_API_KEY`    | [Google AI Studio](https://aistudio.google.com/apikey)              | 官方 Google GenAI SDK     |
| Anthropic Claude | `ANTHROPIC_API_KEY` | [Claude 平台](https://platform.claude.com)                          | 官方 Messages             |

Kimi 中国区默认使用 `https://api.moonshot.cn/v1`。国际账号可设置 `MOONSHOT_REGION=global`，对应 `https://api.moonshot.ai/v1`；密钥必须与区域匹配。OpenAI 旧变量 `OPENAI_MODEL` 保留兼容，用于没有已保存配置时的初始模型。

Vercel 环境变量更新后需部署一次才进入新服务进程。此后在模型中心切换已登记模型、维护单价和任务分配，不需要重新部署前端。

## 网页中的操作

1. 打开设置 → AI 模型中心，选择“管理员”，输入网站管理员口令登录（不是服务商 Key）。
2. 打开“管理员配置”，在“编辑模型与费用”选择模型，根据官方价格填写输入/输出 USD / 百万 Token。未知价格保持空白，系统会暂停付费调用；0 只用于已确认免费模型。价格应覆盖实际推理/缓存计费的上界，避免低估应用预算。
3. 根据官方文档核实能力。动态获取的陌生模型初始只标记文本能力，其余不能凭名称猜测。方舟或自定义模型在“登记模型 ID”填写账号实际可用 ID，再维护能力和价格。
4. 设置网站默认聊天、图片、总结模型，点击“保存管理员配置”。勾选连接测试授权，再在对应卡片测试连接。列表查询不代表真实推理测试。
5. 在“我的模型分配”选择手动、推荐或本地模式，设置任务模型并保存偏好，勾选允许 AI。推荐只选一个已配置且适用的模型；节约偏好按管理员单价排序，均衡/质量优先管理员默认或个人指定模型，不声称已对模型质量进行实测排名。
6. 使用教练、照片或标签识别前，检查显示的服务商并勾选授权。每周总结有自己的授权区域与模型。照片识别的所有份量/营养都显示为估算，修改并确认后才保存。

本地规则明确标注“未调用 AI”，不将规则结果伪装为模型回答。没有图像能力的模型不能解析照片，照片不会被发给其他公司来弥补能力不足。故障切换默认关闭；主动开启后还要选择备用模型并在每次请求前同意列出的具体服务商。流式回复一旦开始不会切换，授权过期或配置变化后必须重新确认。

## 自定义兼容接口

仅管理员能配置。当前实现协议是 `openai-chat`（Chat Completions + SSE + JSON object），不假装支持所有 Responses 方言。先配置 `CUSTOM_AI_API_KEY` 和 `AI_CUSTOM_ALLOWED_HOSTS=api.example.com`，后者只允许精确公网域名，没有通配符。管理员填写名称、HTTPS Base URL、模型 ID、能力和单价后保存与测试。

服务器拒绝凭据 URL、query/hash、非 443 端口、IP 字面量、任何非公网 DNS 解析结果与跳转；TLS 请求绑定已核验的 DNS 地址，阻止重绑定。普通使用者只能选管理员批准的模型 ID，不能提交代理地址。当前只维护一个自定义服务商，密钥仍仅来自环境变量。

## 费用与故障

全应用 UTC 日/月次数与估算预算在 Redis 原子检查并预留后才调用。文字按 UTF-8 字节保守预留，图片在压缩/尺寸校验后预留 50000 输入 Token 上界，加 1800 输出 Token。真实服务商返回 Token 后调整估算；超时或未知用量保留完整预留，避免失败被计为免费。

准确 Token 指服务商返回的输入/输出数量，**费用始终是根据管理员单价的估算，不是实际账单**。未考虑的缓存/区域/税费、额外计费工具应以平台账单核对；本项目不启用收费外部工具。预算达到阈值时停止新的请求。测试与每个备用尝试也分别计数。

每次请求用 UUID 去重：重复编号不会再次调用模型，不会重复扣费。为保护健康隐私，服务端只存摘要哈希和统计元数据，不缓存提示词、照片或回答，因此重复请求不会重放结果，页面仍须等待原请求或查看已经保存的对话。失败后主动新建请求可能再次收费。Redis 中保留当月统计、最近 100 次调用元数据和 31 天去重键。

## 官方文档核对（2026-10-11）

- [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create)、[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [DeepSeek Chat API](https://api-docs.deepseek.com/api/create-chat-completion/)、[Models](https://api-docs.deepseek.com/api/list-models/)
- [Kimi Chat API](https://platform.moonshot.cn/docs/api/chat)、[Kimi K2.5 官方使用示例](https://github.com/MoonshotAI/Kimi-K2.5)
- [方舟 Chat API](https://docs.volcengine.com/docs/ark/chat-api?lang=zh)、[结构化输出](https://docs.volcengine.com/docs/ark/structured-output-beta?lang=zh)
- [Google Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)、[结构化输出](https://ai.google.dev/gemini-api/docs/structured-output)、[Models API](https://ai.google.dev/api/models)
- [Claude Messages](https://platform.claude.com/docs/en/api/messages/create)、[结构化输出](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)、[Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)

模型目录是经过文档核对的起点，不保证账号可用、区域或余额。所有六家目前只有 Mock 合同测试；真实服务商和 Redis 的验收必须在用户配置凭证后完成。
