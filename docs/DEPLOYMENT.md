# 部署准备与公网验收

**架构已调整：**用户已选择完整 Codecast + 本地连接程序，当前运行后端为本地 Convex。下列 Cloudflare 部署配置保留用于旧版，不适用于新的 Codecast 应用。当前没有公网部署；未来须单独完成原版后端的生产托管、认证、设备授权、跨网络连接和备份验证。当前运行方法见 [README](../README.md) 与 [新架构](CODECAST_ARCHITECTURE.md)。

目前没有购买资源、部署、创建隧道或发送邀请。以下说明不代表已经在线运行。

## 已实现的部署入口

生产配置包含 D1 `DB`、SQLite Durable Object `PROJECTS`、R2 `BACKUPS`、前端静态资源 `ASSETS`。前后端同域，`/api/*` 进入 Worker。真实密码登录已实现，生产环境禁用开发登录。

| 配置            | 要求                                            |
| --------------- | ----------------------------------------------- |
| AUTH_MODE       | 生产必须 production                             |
| AUTH_PEPPER     | 至少 32 字符随机 secret；单独备份，不使用开发值 |
| D1 database ID  | 替换 REPLACE_BEFORE_DEPLOY                      |
| R2 bucket name  | 替换 REPLACE_BACKUP_BUCKET，保持桶私有          |
| BACKUP_LOCATION | 真实远端资源才使用 remote-r2                    |
| 静态资源        | npm run build 生成 dist/web                     |

账号使用随机盐的 scrypt（N=32768、r=8、p=3）和服务端 HMAC pepper，登录有持久化限流，修改密码撤销全部旧会话。没有邮箱验证、邮件找回、第三方 SSO 或 MFA；用户名不被当成已验证邮箱。

## 用户明确授权后才执行

1. 创建真实 D1、R2 和 Worker 资源，填写生产标识；检查账号套餐与预算。
2. 通过 Wrangler secret 配置 AUTH_PEPPER，不写入 Git、命令参数或日志。
3. 对生产 D1 按顺序应用 0001.sql、0002.sql、0003.sql，不运行 seed-demo.sql。第三次迁移引入备份代次并保留旧对象键；旧备份下载、删除及重复迁移已在隔离数据库验证。项目 DO 启动时创建历史查询索引。
4. 构建前端，用生产配置的 wrangler deploy --dry-run 检查产物；获得部署授权后才发布。
5. 实测并配置 Worker CPU 及资源限制。scrypt 有意保持较高计算成本，不能假定免费 CPU 额度足够，也不能静默降低密码保护。
6. 桌面启动器设置 COLLOSYS_BACKEND 为该 HTTPS 地址，在两台不同网络的电脑接入独立目录。

## 公网验收清单

- HTTPS、域名、生产 secret 和绑定正确，开发登录与越权访问被拒绝。
- 注册、登录、退出、密码变更、加入码撤销/过期、成员移除与既有连接失效。
- 两台电脑编辑和查看差异；断网、重启、睡眠唤醒后补齐事件。
- 十位真实成员的延迟、资源与限流测试；本机十连接不能代替异地验收。
- 远端加密备份上传后，在没有原检查点的设备解密重建，对比文本/二进制哈希。
- D1、项目 DO、R2、账号 pepper 的备份、删除和恢复演练，以及生产观测与告警。

## 数据边界

默认检查点在每个连接程序的 SQLite 和独立 Git 仓库内。用户选择备份后，R2 收到密文，D1 保存身份、大小、哈希和完成状态；口令只在本地连接程序使用。Wrangler 本地 R2 仍是本机磁盘。

保留清理仅操作托管目录。待发送事件、最新两个检查点、手动固定和有效预览引用受保护，存储预算不足时停止新捕获并明确报错。完整的停机备份要包括后端 cloudflare 目录、连接程序状态与 local-auth.env；另行保管用户的加密口令。事件数据库本身不是完整文件备份。

服务器事件目前永久保存。浏览器实时通知缓存最多 5000 条，但历史、会话、消息与检查点文件详情通过服务器分页查询，不以缓存截断为可访问历史上限。任务、评论和交接按每页 50 条继续加载，并刷新已加载记录的最新状态。账号忘记密码恢复、服务器归档管理、MFA、签名自动更新是后续增强，不冒充已交付。

## 官方依据

- [Workers Node.js crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [R2 Workers API 与本地开发](https://developers.cloudflare.com/r2/get-started/workers-api/)
- [Workers 静态资源绑定](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
