# 完整产品前端改造

基线：`702447694d078e3bdbad2896852d0ae9de7c50d5`，开始时工作区干净；工作分支 `codex/product-ui`。本轮用户明确授权改造正式外壳和路由，取代此前单页视觉选择门槛；不使用本地 skills，不提交或推送。

## 核查与实施范围

| 功能 | 当前真实入口 | 数据来源 | 决定 |
|---|---|---|---|
| 启动 / 登录 / 项目 | `npm start` → `/projects`、`/login` | 原 AuthGuard / Convex auth / projects | 保留账号与返回地址，统一正式外壳、登录与项目品牌 |
| 项目工作区 / 团队活动 | 项目 `workspaces` 页签 / LocalWorkspaces | `useCollaboration` → 原 store 的 ColloSys collection 与授权 live queries | 改造已有页面组合，保留游标、权限清理与真实目录操作 |
| 捕获会话 / Diff | 活动中单条消息、检查点详情 | `colloSessions.list/messages`、`collo.checkpointParts` | 接入已有完整会话查询，复用 ConversationView / FilePatchDiff；不把捕获日志当执行器 |
| 任务 / 评论 / 交接 | 原 Tasks / 项目任务；交接缺少正式 UI | 原 tasks/comments；`colloHandoffs` | 保留成熟任务和评论页，接入持久化交接与状态 |
| 我的目录 / 历史 / 恢复 | LocalWorkspaces 的目录面板与 history | 配对的本地 manager / connector | 独立可达，保留授权根、预览、备份、确认和过期校验 |
| 团队 / 账号 / 来源 / 设置 | 原 SettingsModal / TeamSwitcher / UserMenu | 原 team/profile/clientState 与本地来源接口 | 复用实际管理能力，隐藏不可用托管功能的推广入口，连接来源和 About |

已确认附件六项基线发现：设计路由隔离；productAssets 复制上游品牌；desktop icon 使用该输出；ContextReader 的 Codex / TerminalWindow 写死；原 Button 已复用；预览状态仍为 fixture。原始目录和兼容字符串不做机械替换。

## 正式产品实施

正式入口仍为 `npm start`。原 Windows 桌面框架、AuthGuard、Convex、业务 store、TabShell、DashboardLayout 生命周期和 Sidebar 的任务视图机制保留；把统一外观与项目功能接入这些实际组件。`/workbench-preview` 仅保留为历史实验入口。

- 外壳：Google Sans、中性白/灰面、低饱和紫色选中状态；全局项目/任务/会话与当前项目活动/会话/交接/目录分别导航。原搜索、通知、账号、快捷键、窗口关闭和面板交互继续使用。
- 项目：原 CompanyDocument 和项目页，增加原 store 驱动的创建表单；任务列表、状态、正文编辑和评论保持原组件与写入接口。
- 活动：保留 useCollaboration 授权订阅和事件缓存，增加真实成员筛选、稳定身份色与头像 fallback。手动文件变更不附会 Agent 归属。
- 捕获会话：已有 `colloSessions.list/messages` 接入真正 ConversationView 的只读 guest 模式。分页追加保持阅读器挂载；权限错误清空内容；身份切换使阅读状态失效。捕获会话不伪装成可执行的原生 Agent 会话。
- 文件审查：把原简易逐文件片段组合替换为完整 FileDiffLayout，保留文件导航、统一/并排 Diff、键盘机制和截断/缺失/排除提示；原检查点分片完整性及恢复约束不变。
- 交接：`colloHandoffs.list/get/send/respond` 真实持久化；收件人、任务、上下文、下一步、状态和带序号边界的捕获来源可追溯。接收、拒绝、取消使用服务端版本检查。表单草稿仅在同身份/项目会话内保留，不充当正式记录。
- 设置：复用原 SettingsModal、账号、团队、个人资料和快捷键；连接页列出本地 manager 返回的目录与 Codex 捕获配置入口；About 使用真实版本。隐藏无关托管推广入口。未配置的手机推送/邮件/系统全局在线检测明确说明，未假报连接成功。

## 品牌与身份

品牌源为 `integrations/codecast/brand.json`。`scripts/codecast-brand.mjs` 从原供图固定裁出花生标记，保持比例，生成 16/24/32/48/64/128/192/256/512 PNG 和多尺寸 ICO；准备脚本生成前清理经过路径、链接检查的独占 product-public 输出，避免原品牌残留。HTML/favicon/启动标记、React Logo、Windows 窗口和任务栏图标、原生 About 使用这套出口。首帧主题使用同一 productTheme；关闭原品牌的浏览器交接覆盖层和主题迁移推广浮层。

默认资料目录的最终启动检查发现旧账号的配色设置仍会覆盖新外观。现已在 ThemeProvider 和首帧 HTML 同时统一产品配色与外观，保留 light/dark 选择；旧配色/样式字段没有从用户数据中删除，但不再控制当前产品外壳。布局验收加入旧缓存颜色回归，默认 `npm start` 的实际窗口另有截图。

内部 `codecast:*` 存储键、bridge、IPC、依赖包、appId/userData、上游许可证保留。AgentTypeIcon 中名为 Codecast 的原 Agent 身份是来源标记，不改成 ColloSys 产品 Logo。原托管设置模块仍在完整源中，但不属于当前 Settings 导航；旧设置地址按原机制回到可用设置项。未增加托盘、安装器或快捷方式。

AgentIdentity 规范化 Codex/Claude/Gemini 等原 registry 别名；AgentBadge 复用原 AgentTypeIcon/BrandIcons；未知 ID 显示明确未知来源，模型名不会被当作执行器。会话列表通过其 firstSeq 指向的实际事件取得 adapter，与会话详情使用同一身份，不根据模型或成员猜测。每页最多新增 30 次带索引的点查询；未新增第二份业务状态或无界扫描，也不据此声称云端免费额度足够。正式捕获能力仍只有 Codex，连接页不宣称支持其它适配器。功能图标通过 ProductIcons 使用 Phosphor，Agent 标记独立。成员头像复用原 AvatarImg 缓存与真实 roster 字段；CSP 允许本地后端图片及原头像缓存的两个明确 CDN，其余来源保持限制。

## 视觉审阅

参考为固定 Codecast 实际组件源码与 OpenDesign 软件源码（见历史 reference-research 的固定提交），并核查 https://github.com/nexu-io/open-design 当前产品说明；没有运行 OpenDesign 服务，也没有使用其技能、营销画布或素材作为产品界面。

真实截图见 `evidence/after`、`evidence/native`、`evidence/layout`。`before` 是修改前外壳基线，均使用真实本地验收账户。后续验收新增了明确标为 TEST 的项目、评论和目录，因此这些截图不声称逐条数据完全相同的像素对比。无图片覆盖、无浏览器 API 数据伪造。视觉检查修正了错误页签图标、窄区筛选折行、深色输入框、内容详情多层工具条、顶部和侧栏密度；最终美观程度仍由实际窗口和用户判断，不由测试数量推出。

## 能力边界

- 未新增 Claude/Gemini 捕获适配器、Agent 执行器或付费模型调用。
- 检查点没有独立的持久化逐行评论接口；正式讨论走原任务评论，保留当前任务上下文。文件审查不显示虚假的“评论成功”。
- 后端已有检查点交接字段，当前新交接表单连接任务与捕获会话，未新增检查点附件选择器。
- 本地检查点不是远程完整文件备份；原恢复预览、备份、确认及过期校验保留，队友文件不自动应用。
- 此轮不扩展公网部署、跨平台安装器、邮件邀请或移动端能力。所有验证服务绑定回环地址。

验证结果与可复现命令在本记录末尾及 PLAN.md 中记录。工程验收与视觉验收独立。

### 验收中发现并修正

真实离线测试发现原 `chunkReloadGuard` 在离线资源加载失败时也会自动刷新。该行为把已经打开的页面带入浏览器断网页；增加 `navigator.onLine` 判断，离线不刷新、不消耗一次刷新预算，在线陈旧构建仍保留一次恢复机会。回归测试直接执行经过 owned patch 的实际源码，并检查两种网络状态和预算上限。多文件数量使用上游 parsePatch 的真实 hunk 类型计算，避免把内容以 `++` 或 `--` 开头的变更行误当文件头。

## 最终工程验收

| 验证 | 实际结果 |
|---|---|
| `npm run typecheck` / `npm test` | 通过；63/63 |
| `npm run build` | 通过，最终构建 57.40s；保留上游大块和循环 chunk 警告 |
| `npm run typecheck:integration` | 通过，当前准备版本 45 个 owned 文件对真实上游类型检查 |
| `npm run codecast:verify` | 9,854 文件，0 失败 |
| `node tests/codecast-native-backend.mjs --check-launch-rejections` | 10 组授权/成员/账号/原生调用边界通过 |
| `node tests/codecast-workbench-audit.mjs .local/codecast-app/acceptance-1792918795288` | 6 组通过，包括 241 文件、45 检查点断网补齐、冷链接、撤权和换号缓存清理 |
| `node tests/codecast-desktop.mjs .local/codecast-app/acceptance-1792918795288` | 9 组通过：原生窗口/隔离、OS 目录选择、真实恢复、目录直达、重开与关闭确认 |
| `node tests/product-ui-flow.mjs --native` | 7 组通过，0 页面错误；发送及接收人确认均走真实 UI，任务评论与项目创建由后端查询复核 |
| `node tests/product-ui-layout.mjs` | 9 项通过；实际截图检查窄区折行、深色输入、字体、Escape 和 reduced motion |
| `node tests/product-ui-captures.mjs after` | 6 个正式路由与登录截图，0 页面错误 |
| 正常 `npm start` | 已打开默认资料目录的独立 ColloSys 窗口；仅 127.0.0.1 服务 |

完整原生演示见 [continuous-demo.webm](evidence/native/continuous-demo.webm)，截图索引见 [REVIEW.md](REVIEW.md)。后端、桌面及工作区的原始验收目录与失败后修复过程见根目录 PLAN.md；本地原始日志保留，不以旧失败截图作为最终交付画面。上述实施阶段没有提交、推送或部署。

后续用户明确要求“首先推送github”，授权将本轮源码和验收证据提交并推送至公开仓库 `QCYTSN/ColloSys` 的 `codex/product-ui` 分支；不包含合并 main 或公开部署，也不代表用户已认可视觉质量。
