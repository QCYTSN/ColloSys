# ColloSys

面向小团队的协作开发系统。当前按用户确认的方案，直接基于 **Codecast 完整开源项目**改造，保留原有前端、账号、工作空间、项目、任务、评论、设置和数据层，接入 ColloSys 的真实文件检查点与安全恢复。

复用范围是产品工作台。官网首页、定价、下载、博客和宣传素材不随产品构建发布。按用户确认，默认入口为独立桌面软件窗口，使用 Codecast 原有桌面框架；浏览器仅作为独立调试入口。

## 本地启动

Windows x64、Node.js 24+、Git for Windows；首次在仓库运行 `npm ci --ignore-scripts`。然后：

```powershell
npm start
```

启动器准备本地运行依赖、构建产品前端、启动持久化后端和文件连接程序，然后打开独立的 ColloSys 桌面窗口。首次准备需要联网下载公开依赖；不需要线上账号或付费服务。桌面运行时固定为 Electron 44.3.0，下载包校验固定 SHA-256；官网源不可达时使用相同校验的镜像。

所有服务只监听本机。数据保存在 `.local/codecast-app`，不要删除这个目录；它包含账号数据库、设备凭证、检查点和待发送队列，桌面登录状态保存在其中的 `desktop-profiles/default`。关闭最后一个软件窗口会退出；若仍有待同步的界面操作，会先提示保留窗口或确认退出。由该次启动拥有的后台服务会随之停止。再次启动保留账号、历史与登录状态。

1. 使用原版登录/注册页面建立本地账号。新版使用独立账号库，旧版账号和项目尚未迁移；旧数据仍保留。
2. 从原有工作空间菜单创建或选择团队，在 Projects 中创建项目。
3. 打开项目的 **Workspaces**，点击 **Connect directory**，选择目录并确认共享范围。
4. 保存文件后，在 **Team activity** 查看真实改动；**Local history** 显示本机可恢复检查点。
5. 恢复先打开 **Preview restore**，查看文件范围，再明确确认。系统备份当前状态，并拒绝已经失效的预览。

桌面窗口自动完成本机配对，Browse 打开系统文件夹选择器；选好目录后仍需明确确认共享。每位成员保留独立目录，活动同步不会覆盖其他人的文件。用于联调的浏览器入口为 `npm run codecast:app -- --built`，地址 `http://127.0.0.1:3407`；直接访问普通地址只能登录查看活动，管理本机文件还需要配对。桌面附着到已经运行的调试服务时，退出窗口不会替调试进程关闭服务。

## 新核心工作区预览（2026-10-26，等待视觉选择）

此前 DesignLab 与 A/B 均未获得视觉批准。当前候选使用独立滚动的团队活动索引、一个主阅读/代码工作面，以及按需展开的来源与保存信息；支持长会话、真实 Diff、评论、交接草稿和自己的目录历史。正式工作台尚未迁移。

在完成上方首次依赖准备后，执行：

```powershell
npm run workbench:preview
```

该命令打开独立 Electron 窗口中的 `/workbench-preview`。浏览器调试可运行 `npm run codecast:app -- --built`，访问 `http://127.0.0.1:3407/workbench-preview`。在「预览场景」中切换 3 人 / 10 人 100 条活动，或查看同窗口、同原始消息的 Codecast 原生阅读组件对照。

预览明确使用演示数据，评论和交接草稿保留在本次页面内，恢复流程不写入文件。原生组件对照同样是 fixture，不是真实捕获会话。当前正式产品仍由 `npm start` 打开；`npm run design` 和 `design-explorations/workbench-20261026` 保留历史比较材料。

本轮修改、源码依据、实际截图、交互录像、原生窗口缩放结果和未完成范围统一记录在 [工作记录](docs/workbench-revision/WORKLOG.md)。既有 [参考研究](docs/design/reference-research.md) 及 [旧 A/B 验证](docs/design/preview-validation.md) 保留，不代表当前候选获得批准。

## 源码与原版

- `third_party/codecast/upstream`：固定提交 `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8` 的完整原始源码，9,854 个普通文件，保持可校验。
- `integrations/codecast`：逐项声明的补丁、Convex 扩展和项目页新增功能。
- `.local/codecast-app/source`：启动前生成的完整运行副本；不要在这里维护改动。
- `packages/connector`：真实文件监测、独立 Git 快照、SQLite 离线队列、恢复、Codex 日志适配器。
- `packages/shared/src/protocol.ts`：前后端共用的版本化事件协议。
- `integrations/codecast/desktop`：Windows 桌面入口、原版窗口框架适配、受限桌面通信与原生目录选择。派生桌面框架位于 `.local/codecast-app/desktop-framework`，有单独来源清单，原始镜像不改动。

完整未改造的原版对照仍可通过 `npm run codecast:reference` 启动在 3297，使用另一套数据。以前的自制页面和 Workers 后端保留为历史实现，入口为 `npm run legacy:start`；此前安装包也是旧版，不能代表这次迁移成果。历史说明见 [LEGACY_README.md](docs/LEGACY_README.md)。

## 文件与会话边界

- 只扫描明确选择的目录，不跟随符号链接或 junction。排除凭证、依赖、构建目录，遵守 `.gitignore` 与 `.collosysignore`。
- 支持新增、修改、删除；重命名按删除和新增记录。二进制文件保留本地字节，没有文本差异。
- 单文件上限 2 MiB，最多 10,000 个文件、总量 100 MiB；被排除或超限的文件不声称已保存。
- 原项目的 Git 暂存区、HEAD 和分支保持不变。保留的快照在独立仓库中固定引用。
- 默认保留最近 200 个、30 天内的检查点，预算 2 GiB；待发送、正在预览和最新两个检查点受保护。空间不足时停止捕获并显示错误。
- 检查点的完整文件内容**只保存在来源设备**；服务器保存共享差异与事件，不等于远端文件备份。旧版加密远端备份界面尚未迁入新的 Codecast 数据体系。
- 在目录详情中选择 **Connect Codex log**，明确选择一个对应项目的真实 JSONL 会话日志。默认只共享后续消息；导入历史需另行勾选。不会启动 Agent、调用付费模型或遍历未授权日志目录。
- Codex 消息现显示在项目活动中；尚未投影到 Codecast 原生 Inbox 会话表。邻近检查点只表示采集时间接近，不宣称某条消息造成某次编辑。

## 验证与未完成范围

```powershell
npm run typecheck
npm test
npm run build
npm run typecheck:integration
npm run codecast:verify
npm run codecast:app -- --built
# 在另一个终端执行实际验收
npm run test:integration
# 使用上一步输出的验收目录检查实际桌面窗口
npm run test:desktop -- .local/codecast-app/acceptance-<上一步编号>
# 当前后台权限、容量、分片与新工作台的实际故障回归
node tests/codecast-backend-audit.mjs
node tests/codecast-workbench-audit.mjs .local/codecast-app/acceptance-<上一步编号>
```

构建前请停止运行中的新应用，避免覆盖正在使用的源文件；重复启动会拒绝重建运行实例。验收使用明确标注的测试账号、真实目录和数据库，结果及截图保存在 `.local/codecast-app/acceptance-*`。

`typecheck:integration` 使用生成副本的实际上游类型检查自有集成文件；它要求副本与当前补丁一致。根项目的 `typecheck` 与它覆盖范围不同，两者都要执行。活动及工作区读取已接入原 Codecast 缓存；检查点详情可直接打开，按片段汇总并明确完整性。

当前仍需完成：原生 Inbox 会话联动、旧版备份/保留设置界面的迁移、新版安装包，以及上线后的跨网络、生产认证、资源限制和备份验收。原项目的云 Agent、外部集成和桌面发布能力未在本地版本逐项验收；本地后端禁止对外请求，不代表这些功能已经可用。此版本没有购买、部署或公开任何服务。

详细证据与进度见 [PLAN.md](PLAN.md)、[当前架构](docs/CODECAST_ARCHITECTURE.md)、[迁移记录](docs/CODECAST_FRONTEND_MIGRATION.md) 和 [复用来源](THIRD_PARTY_NOTICES.md)。

2026-10-24 的源码追查、复现问题与特化边界见 [本轮审查](docs/SPECIALIZATION_AUDIT_2026-10-24.md)。
