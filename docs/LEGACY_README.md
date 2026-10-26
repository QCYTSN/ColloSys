# ColloSys

面向小团队的本地协作开发原型。成员保留各自的编辑器、Agent 和独立工作目录；共享真实文件变化、会话与可恢复检查点。

**当前状态（2026-10-23）：此前前端未通过用户验收，正在改为完整移植 Codecast。** 完整上游源码已导入并可以独立本地运行；真实注册、任务创建、重新登录读取与设置切换已经验证。这个原版对照尚未接入 ColloSys 的文件连接程序、检查点和恢复功能，不能作为已经完成的产品交付。

运行完整原版对照：`npm run codecast:setup`，然后 `npm run codecast:reference`；打开 `http://127.0.0.1:3297/login`。详见[完整源码移植记录](docs/CODECAST_FRONTEND_MIGRATION.md)。下面的 `npm start` 和历史安装包仍是此前的 ColloSys 界面；它们与原版对照使用不同的数据。

此前修复了审计发现的十项问题，差异引擎、Markdown、滚动和部分详情组件已适配，历史分页与安全恢复有独立测试。这些结果只证明对应功能，不能证明已完整移植前端。修复与限制见[修复记录](docs/REPAIR_2026-10-23.md)，当前完成/未完成范围以 [PLAN.md](PLAN.md) 第六轮为准。

这是经过本地验收的协作原型，不代表完整复刻 Codecast/Delta，也未完成公网发布验收。原始[源码与架构审计](docs/AUDIT_2026-10-23.md)保留为修复前证据。

## 本轮新增

任务分工、项目评论、会话上下文交接；个人密码账号、最多十人的团队、项目权限、可撤销的一次性加入码；Windows 安装与目录接入；检查点保留策略、存储预算和加密对象备份。

使用真实账号的完整本地环境：

```powershell
npm ci
npm run build
npm start
```

启动器会打开已配对的浏览器。注册账号后，在“团队与账号”创建团队与项目，再通过“接入项目目录”选择文件夹并确认授权。另一成员注册后输入加入码即可加入。启动器默认关闭演示登录；数据保存在 `%LOCALAPPDATA%\ColloSys\data`，重启后在项目接入窗口启动已有工作区即可续用并更新登录凭证。

Windows 离线安装包通过 `npm run package:windows` 生成到 `dist`。包内包含 Node 和依赖；需要已安装 Git for Windows。解压后双击 `Install.cmd`，使用桌面快捷方式打开。安装不移动项目文件，不自动设置开机启动。详见 [安装与使用](docs/INSTALLATION.md)。

## 双成员演示启动

需要 Node.js 24+ 和 Git。首次安装依赖：

```powershell
npm install
```

之后一条命令启动前端、Cloudflare 本地后端、两个独立连接程序，并初始化可重复使用的演示目录：

```powershell
npm run dev
```

打开 <http://127.0.0.1:5173>。在两个独立浏览器会话中分别选择 Alice 和 Bob（推荐普通窗口与无痕窗口）。登录凭证按浏览器会话保存。

在编辑器中打开：

- Alice：`.local/demo/alice/project`
- Bob：`.local/demo/bob/project`

修改并保存文件后，另一成员的活动流会显示真实差异。两份目录互不覆盖。可以用“暂停发送”测试离线队列，再恢复发送；在“我的检查点”中先预览，再明确确认恢复。

首次演示文件由启动脚本创建，后续启动不覆盖已有文件。界面活动来自实际扫描和数据库，没有伪造活动记录。

## 接入自己的项目目录

保持本地开发环境运行，在另一个终端执行：

```powershell
npm run connect -- --root "D:\Projects\my-project" --user alice --port 8793
```

命令授权指定目录并启动连接程序。状态默认放在用户目录的 `.collosys/<workspace-id>`，不进入项目。程序打印可用于重启的配置路径。

在浏览器“连接设置”中将地址切换为 `http://127.0.0.1:8793`。只接受本机地址，并验证连接程序属于当前成员。

后续使用已生成的配置重启，避免创建一个新工作区：

```powershell
npm run connector -- "C:\Users\you\.collosys\workspace-...\config.json"
```

不能同时启动两个使用同一状态目录的连接程序。不要手工复制其中的登录凭证给其他成员。

## 接入真实 Codex 日志

在“连接设置”中授权搜索一个明确的日志目录，选择与当前项目匹配的会话；也可直接填入 Codex rollout JSONL **绝对路径**，点击“检查日志”，检查消息数量后确认共享。默认仅采集后续消息；只有主动勾选时才导入已有历史。

- 日志 `session_meta.cwd` 必须匹配已授权的项目根目录。
- 仅读取用户与公开助手消息；跳过工具输出、系统上下文、内部推理及镜像事件。
- 内容做常见凭证格式脱敏；这不是任意文本的完整敏感信息检测器。
- 选定来源保存在连接程序状态中，重启后继续，重复读取不重复生成消息。
- 会话与检查点的关联表示采集时邻近，不能证明某条消息造成具体文件变化。
- Claude、Cursor 等其他适配器尚未实现，不会展示为可用。

可以只验证真实日志格式、不共享内容：

```powershell
npm run verify:codex -- "C:\path\rollout.jsonl" "D:\Projects\my-project"
```

## 文件、检查点与恢复边界

- 支持新增、修改、删除。重命名表示为删除与新增。
- 二进制文件保留真实字节，页面不展示文本差异。
- 每个文件上限 2 MiB；扫描最多 10,000 个文件、总量 100 MiB。超限文件明确不纳管，不伪称已保存。
- 遵守各级 `.gitignore` 与 `.collosysignore`，并强制排除依赖、构建目录、常见凭证文件、符号链接和 Windows junction。已被 Git 跟踪的 `.env` 仍被排除。
- 子目录 `.gitignore` 的取消忽略规则生效；`.collosysignore` 是额外的共享限制，不会被子目录 `.gitignore` 重新放行。
- 使用独立的过滤后 Git 快照仓库，不修改项目原有 index、HEAD 或分支，也不执行远端 Git push。
- 默认保留最近 200 个且不超过 30 天的检查点，预算 2 GiB。待发送、正在预览、最新两个和手动固定的检查点受保护；因此数量可能超过设置。每分钟执行保留策略；存储不足会停止新捕获并显示错误，不丢弃未发送事件。
- 恢复只操作检查点覆盖的普通文件内容。预览有效期 10 分钟，恢复前保存当前状态并重新核验，拒绝过期或发生变化的预览。
- 恢复不是跨多个文件的文件系统事务；中途失败会停止并报告已处理数量，保留恢复前备份。请避免同时让其他程序改写同一目录。
- 文件权限、ACL、空目录、链接和外部依赖不是当前恢复范围。
- 检查点默认仅本地保存。可选择 AES-256-GCM 加密后上传对象存储；口令不保存。界面明确区分本机对象存储与远端 R2。本机备份不能抵御整机丢失；共享差异本身也不是完整备份。

## 验证

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:extended
```

`test:e2e` 启动独立 Cloudflare 本地后端、独立数据库及临时项目；会真正停止、重启该测试后端。占用 8887、8888、8891、8892 端口，结果保存在 `.local/acceptance/<run>/result.json`。

浏览器验证需要先运行 `npm run dev`，并安装 Chrome：

```powershell
npm run test:browser
```

它使用两个独立浏览器身份，写入临时测试文件，通过界面预览并确认恢复，截图在 `.local/verification`。测试数据明确标记为 TEST FIXTURE / BROWSER ACCEPTANCE。

## 文档

- [安装、真实账号与备份使用](docs/INSTALLATION.md)
- [当前产品目标与可调整范围](docs/PRODUCT_GOALS.md)
- [Delta / Codecast 源码依据与取舍](docs/SOURCE_STUDY.md)
- [按步骤进行本地验收](docs/LOCAL_ACCEPTANCE.md)
- [架构与数据流](docs/ARCHITECTURE.md)
- [部署准备与尚未验证事项](docs/DEPLOYMENT.md)
- [复用来源和许可](THIRD_PARTY_NOTICES.md)
- [实施进度](PLAN.md)
- [开发约束](AGENTS.md)
- [连接程序配置示例](docs/connector.config.example.json)（推荐使用启动命令自动生成真实配置）

前端基础组件与快照模块来自 Codecast 的固定 MIT 版本；没有复制 Delta 核心或插件源码。当前只在本机运行，没有部署、收费服务或模型 API 调用。
