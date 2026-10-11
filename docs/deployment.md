# GitHub与上线

用户已确认创建`yann359/dailyflow-ai`公开仓库并通过Vercel发布。本项目使用独立仓库，不覆盖账号下其他项目。

- 公开源码：[yann359/dailyflow-ai](https://github.com/yann359/dailyflow-ai)
- 正式网站：[dailyflow-ai-zeta.vercel.app](https://dailyflow-ai-zeta.vercel.app)
- Vercel项目：`yann359s-projects/dailyflow-ai`，GitHub App访问范围仅此仓库。
- `main` 分支自动部署，Next.js框架预设、根目录 `./`、安装命令 `npm ci`、构建使用项目 `npm run build`。

## 首选：Vercel

1. 获得确认后，将代码推到独立`dailyflow-ai`仓库的`main`。
2. 在Vercel导入此GitHub仓库，框架选择Next.js，安装`npm ci`，构建`npm run build`，Node.js选择22或24。
3. 第一版不填任何AI密钥即可部署完整本地版。
4. 部署状态成功后访问返回的HTTPS地址，验收首页、录入与刷新、PWA资源、无密钥状态。
5. 把实际地址加入仓库About中的Website和README。不要预先编造域名。

GitHub公开应用源码；个人记录保存在使用者当前浏览器，不会随代码上传。浏览器记录在不同域名下相互独立，从本地迁移到线上需导出JSON再导入。

## 可选AI配置

在现有 Vercel 项目 Settings → Environment Variables 添加 `.env.example` 中的服务端变量。多模型版需要至少一家服务商密钥、独立使用者/管理员口令、会话签名密钥与 Upstash Redis REST；管理员还需维护模型能力和费用单价。环境变量更新后重新部署，随后模型切换无需部署。详见 [逐步配置指南](ai-model-center.md)。不要在 GitHub、Issue 或聊天里粘贴真实 API Key。

## 平台边界

GitHub代码页面不能直接运行Next.js服务端接口。GitHub Pages静态方案需单独静态构建和禁用或另设AI后端，本项目优先保持完整Next.js能力部署到Vercel。

## 无法连接远端时

保留本地规范提交，再执行：

```powershell
git remote add origin https://github.com/你的账号/dailyflow-ai.git
git push -u origin main
```

仅在已创建正确仓库并完成授权时执行。不将仓库地址描述为线上网站，也不将本地localhost描述为公网链接。
