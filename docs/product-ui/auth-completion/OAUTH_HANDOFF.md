# 本机第三方登录配置交接

2026-10-31 只读检查：当前后端的四个 GitHub/Google 配置项均缺失，私有 `oauth.env` 尚不存在；邮箱密码入口可用，邮件发送尚未配置。服务健康，实际产品地址是 `http://127.0.0.1:3407`，Convex Auth HTTP origin 是 `http://127.0.0.1:3409`。

| 提供商 | 后台入口与客户端 | 本机开发回调 | 登录权限 |
| --- | --- | --- | --- |
| GitHub | [Developer settings → OAuth Apps](https://github.com/settings/developers)，创建 OAuth App | `http://127.0.0.1:3409/api/auth/callback/github` | `read:user user:email`；不请求仓库授权 |
| Google | [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients)，创建 Web application | `http://127.0.0.1:3409/api/auth/callback/google` | `openid email profile`；不请求 Drive 等数据权限 |

应用主页 / 需要填写的 JavaScript origin：`http://127.0.0.1:3407`。Google 如处于 Testing，只添加你批准用于验证的测试账号。桌面通过系统浏览器使用现有 Web 服务，因此这里使用 Web application 客户端。生产服务另建客户端，按生产产品 origin 和 Convex HTTP origin 注册 HTTPS 回调，不复用本机地址。

把 `integrations/codecast/oauth.env.example` 复制到 **`D:\Github_Ku\ColloSys\.local\codecast-app\oauth.env`**，在本机编辑器中填写：

```dotenv
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

不要把密钥发到聊天、截图、前端环境变量或仓库。文件已被 Git 忽略；现有启动器把值写入本机后端环境。若此前只启动了浏览器调试服务，也需正常停止该启动器。关闭当前 ColloSys 服务后，在仓库运行 `npm start` 重新加载，再在登录页刷新提供商检查。后端已有值在文件省略时保留；显式空值会移除对应后端设置。

本轮实现继续进行。配置到位后使用本轮统一验证入口继续真实往返，结果与受控回调测试分开记录；未配置不表示已经通过第三方授权。

核对依据：[Convex Auth OAuth](https://labs.convex.dev/auth/config/oauth)、[GitHub authorization code flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[Google Web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)。检查 provider state / PKCE / nonce 与安装的 SDK 实现分别进行，不用最新文档假定旧版本具有新增 API。

配置后的验证入口：

```powershell
npm run auth:check
npm run auth:verify -- --provider=github --native
npm run auth:verify -- --provider=google --native
```

检查命令只报告是否配置和实际 origin；未配置退出码为 2。上面的 `--native` 验证命令打开隔离的原生 ColloSys 窗口，使用正式桌面入口点击提供商，系统浏览器交由你完成授权并批准桌面请求。随后检查原生一次性领取、服务端已验证的内部会话、刷新及关闭重开后的同账号。不会录制提供商页面或保存凭据。省略 `--native` 可另验 Web 登录路径。

真实提供商尚未配置，因此该命令的成功授权分支尚未执行。Settings → Profile & appearance → Login methods 的真实关联、拒绝授权、退出后重登仍需分别实测，不能由上述成功路径替代。受控本地关联回归命令为 `npm run test:account-links`，它只在没有真实 provider 配置时运行，不覆盖已有密钥。
