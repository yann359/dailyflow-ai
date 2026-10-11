# AI接入与官方依据

核实日期：2026-10-11。未进行真实付费模型调用；本版本使用模拟接口测试和无密钥降级验收。

## OpenAI API

采用官方Node SDK，服务端调用Responses API。饮食与标签识别使用`responses.parse`和`zodTextFormat`，教练和周报可用`responses.stream`接收模型增量；向客户端传输NDJSON，最终结构校验通过才显示完整分析。设置`store:false`、最多1800输出tokens、25秒请求超时、一次SDK重试。请求失败不修改记录。

来源：[Responses API迁移说明](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)。

凭证仅在服务端环境变量，无`NEXT_PUBLIC_`前缀；独立API账户计费。模型ID可配置，默认`gpt-4.1-mini`为具备图像与结构化输出能力的可配置起点，并不宣称最新模型。部署时需要确认账户可用模型。请求数上限不等于金额上限，请结合OpenAI后台预算告警。Vercel必须有共享Redis配额存储，否则AI关闭，避免无状态实例重置预算。

## Sign in with ChatGPT

官方网页流程使用OAuth 2.0 Authorization Code + PKCE和OpenID Connect，需要获批客户端ID、精确注册的回调地址、issuer/JWKS、nonce/state、后端一次性状态存储及安全会话。官方文档当前说明网页商业集成限于指定合作方，申请客户端需加入候补。

来源：[网页接入](https://developers.openai.com/siwc/website)、[申请客户端ID](https://developers.openai.com/siwc/request-client-id)、[开源计划用量预览边界](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。

本项目没有这些资格与配置，不能把“ChatGPT登录”当作已可用功能，也不能据Codex已登录就认定远程Vercel网站可以使用订阅额度。当前界面明确标记暂不可用，未实现虚构OAuth路由；没有读取任何客户端令牌。

## 本地模式与隐私

营养换算、统计和明确数量的食物解析无需模型。本地教练提示和7天复盘都有来源标签，不理解开放式问题，也不编造趋势。

外部教练请求需要用户勾选授权，仅发送年龄、身高、目标、活动程度、当前日期、营养目标及近两周汇总，排除姓名、原始身体照片与完整对话。自然语言输入只发送当前输入和必要食物库匹配字段。营养标签图片在点击识别时发送，识别草稿必须核对后保存。体型照片从不自动发送。

个人版访问口令只保存在当前页面内存，刷新清空；不是OpenAI API Key。接口检查同源、口令、输入大小及结构。未来多用户必须替换为账户认证并增加用户级配额，不把口令方案当作完整身份系统。
