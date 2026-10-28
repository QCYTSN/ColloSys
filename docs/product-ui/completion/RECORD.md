# ColloSys 正式应用 UI/UX 完整改造

正常入口为 `npm start` 打开的独立 Windows 桌面窗口。此轮修改正式 `/login`、`/signup`、`/projects` 与既有核心工作流，没有将 `/workbench-preview` 作为交付。源码基线为 `codex/product-ui` / `1cbc2699ee5b202e68c7027a591fd13d903f51ff`；版本、构建指纹和实际验收结果随附于 `version.json`。证据在提交前采集；随后用户要求“我怎么自己打开看，并且你先提交”，授权将本轮源码与证据保存为本地提交。尚未推送。

[页面与动态证据](REVIEW.html)

## 六项验收分别看

1. **视觉组合**：认证使用品牌区与表单工作面；启动使用固定品牌锚点与工作区骨架；项目页减少重复眉题。内容面、工具面、选中、主操作与浮层有不同职责。Google Sans、中文系统字体、花生资产链及真实 Agent 身份保留。截图与正常应用供用户审阅，**技术测试不代表视觉批准**。
2. **内容与容器**：项目索引/概览、项目头、设置依据自身容器宽度重排。正文允许长词断行，标题按角色限行并保留完整标题；代码继续在自己的阅读区域滚动。除了页面宽度，还检查交互目标、祖先裁切、文字范围与所属容器。右会话栏展开时，外层分栏为工作面与右栏保留最低空间；折叠栏的控件不再进入键盘焦点。
3. **产品入口**：目录历史新增真实存储/备份工作流；检查点详情可发起带来源的交接；旧检查点收据有显式校验入口。详见下表，未配置的外部能力没有伪装成成功按钮。
4. **连续性**：延用原阅读锚点、文件行定位、会话范围内草稿与安全 presence。暂时服务错误保留同身份、同参数下的有效内容；确认撤权立即清除。概览与对象切换仅过渡相关内容；设置/详情保留可中断退出，菜单沿用 Radix 焦点管理。
5. **认证和启动**：新的 ProductAuth 复用实际认证 hooks。静态 HTML 与 React 共用 boot CSS；主题与品牌几何一致，静态层在 React 内容出现后卸载，无强制等待。初始化慢时提供重试/登录出口，不显示伪造百分比。局部请求保留内容与局部 busy。
6. **参考落地**：按指定 OpenDesign commit 阅读实际组件，通过现有分栏、Radix 和成熟会话/Diff 实现落实六项方法；没有复制其品牌或另建业务状态系统。

## 已定位的问题与处理

| 基线问题 | 正式实现 |
| --- | --- |
| 登录/加载仍使用上游构图 | 独立 ProductAuth、ProductLoader；`boot.mjs` 同源生成静态入口，原认证逻辑保留 |
| 固定辅助列只看 viewport | `product-shell.css` 的容器规则，原分栏的尺寸约束；右栏展开/父级缩窄后恢复非人为的瞬时折叠 |
| 仅检查整页宽度 | 新 `product-ui-overflow.mjs` 检查内层与交互目标；代码、明确限行单独记录，不豁免整个会话阅读区 |
| 项目筛选后概览仍来自全集 | 选中项只从可见 `rows` 解析，无结果时无旧概览 |
| 前端没有检查点交接 | 真实检查点入口、收据校验、旧收据迁移、发送前完整性条件与接收端来源 |
| 任意 query error 清草稿 | `useProductQuery` 仅保留当前 principal/args 的成功结果；服务中断保留，明确拒绝/身份变更立即清除 |
| 密集 CSS 覆盖 | 共用规则归入 shell/UI 原文件；新 completion CSS 仅包含认证/存储相关样式，不堆重复 override |
| 新压力数据暴露 Windows 长路径失败 | 只在已经确认受管理的快照 Git 仓库设置 `core.longpaths=true`；用户仓库/global Git 不变；新增真实长路径捕获/恢复测试 |
| 右栏第一次点击没有动作 | 原快捷提示首次 arming 替换 DOM；固定外壳的左右栏提示提前挂载，按钮节点不再于点击时替换；列表中大量提示的懒加载保留 |
| 清理后备份选择器可能指向已删检查点 | 选择从实际存在且有效的 checkpoints 解析，清理刷新后回退到可用记录 |
| 退出账号仍指向原公开首页 `/`，现已是工作台 | 保留原 durable sign-out 完成凭据/缓存清理，随后刷新到 `/login`，同时覆盖账号删除完成后的出口，避免旧认证渲染短暂把退出带回工作壳 |
| 双窗口退出时旧 IDB 读取可能恢复已删 token | 在原 durable storage 上增加跨窗口、无凭据内容的删除/版本标记；过期异步读写不能恢复旧值，原 refresh-token 轮换备份保留；真实双窗口退出/换号/刷新单独验收 |
| 生成的 auth 修补未进入 bundle | 产品 Vite 明确解析到 prepared platform/auth/web；依赖 junction 不再绕过 owned 修补。实际产物确认包含版本标记，集成类型检查也解析同一份生成源码 |

## 功能覆盖

状态是对下面限定范围的判断，不是对所有上游隐藏功能的全量认证。`完整可用` 指本地配置下的完整已测任务；每行的条件同样属于结论。

| 用户任务 / 状态 | 实际实现与入口 | 点击结果、权限/条件 | 本轮处理、缺口与证据 |
| --- | --- | --- | --- |
| 项目创建、查找、切换 — 完整可用 | 原 projects/store；Projects → New project / Find a project / 项目项 | 原后端持久化；团队成员范围，非成员项目不返回 | 修复过滤选中关系；`after/results.json`、`flow/results.json` |
| 项目详细管理操作 — 尚未核实 | 原项目属性/管理入口保留 | 原权限判定保留 | 没有逐项重测归档、删除、转移等所有原有管理动作，不将路由存在视为验收 |
| 团队活动与成员筛选 — 完整可用 | `collo` 授权分页；项目 → Activity | 独立成员目录的持久化事件；手动编辑不需要 Agent | 长标题/密集内容与原 multipart/离线补齐回归；Agent 来源来自实际日志证据，不推断代码因果 |
| 捕获会话与分页 — 完整可用 | `colloSessions:list/messages/indexHistory`；项目 → Conversations / Index older history | 有界历史索引和分页，实际 ConversationView 阅读 | 当前页过滤明确标识；全局 app sessions 搜索说明范围并提供捕获会话入口；历史迁移后端验证与阅读回归 |
| 捕获日志全量全文搜索 — 明确不支持 | 当前页 filter 与 app sessions 原搜索是不同范围 | 不无界读取全部历史 | UI 明示范围；没有宣称全量搜索 |
| Diff/路径/来源 — 完整可用 | 原 FileDiffLayout/Pierre；活动 → 检查点详情 | 统一/并排、原路径/行号、受限/缺失/二进制提示；共享数据不等于完整文件备份 | 保留成熟引擎与文件定位；长/同名路径测试、原 241 文件回归 |
| 任务与评论 — 完整可用 | 原 tasks/comments/TaskCommentStream；Tasks → 任务正文 → Comment | 原任务状态/评论持久化，成员校验；不自动启动模型 | 共享控件语言；真实评论写入、状态与上下文关联由原流程/后端验证 |
| 带来源交接 — 完整可用 | `colloHandoffs.send/respond`；活动详情/会话/任务 → Handoff | 任务、会话、检查点真实引用；接收/拒绝/取消有版本条件 | 新 checkpoint 来源；`handoffs/results.json` 验证服务错误、断网、重试、接收/拒绝/取消、撤权；接收不写入队友文件 |
| 检查点验证/旧收据升级 — 完整可用 | `colloCheckpoints.verify`；交接来源卡 → Verify | 有界校验，分片/文件/路径完整性全部满足才可发送 | 缺片、路径冲突、没有可验证起点的旧收据明确不可选；迁移与冲突由真实后端测试覆盖；未逐个截图全部拒绝分支 |
| 连接/运行目录与日志来源 — 完整可用 | 本地 manager/connector；项目 → My directories → Connect directory | 原系统目录选择、配对、明确根与 Codex 日志授权；启动/停止/暂停分享仍用原接口 | 原桌面验收与 flow；只扫描授权根，手动检查点继续独立工作 |
| 检查点及恢复 — 完整可用 | connector capture/restore preview/confirm；目录 → History → Preview restore | 分离预览、当前状态备份、确认与 stale 拒绝；不改原 Git index/HEAD/branch | 新长路径回归及真实桌面恢复写盘；所有写入限隔离临时目录 |
| 存储策略、保护与清理 — 完整可用 | `GET /api/storage`、`/api/storage/policy`、`/pin`、`/clean`；My directories → This directory → Storage & backups | 实际用量/保护项/保留策略，审阅后确认清理；工作目录不被清理 | 本轮补齐正式 UI；`after`/`native` 实际计数与文件字节断言 |
| 加密备份、恢复副本、导出、删除 — 完整可用 | `/api/backups/create/recover/export/delete`；Storage & backups | 密码不保存；真实加密上传和持久化收据；恢复到独立副本、导出到新路径，删除选中备份须确认 | 本轮补齐；UI 操作与独立后端并发/损坏/错误密钥/重启验证。当前后端是同机 Convex，**不是异机灾备** |
| 账号登录/注册/恢复 — 完整可用 | 原 `useLocalAuth/useEmailAuth/useConvexAuth`；/login、/signup | 密码管理器、密码显隐、错误关联/焦点、过期提示、真实注册与 return_to | 新认证外壳；`surfaces/results.json`。整页刷新或退出后不承诺恢复未发送草稿 |
| 邮箱验证码、OAuth、找回密码 — 明确不支持 | 当前本地配置未提供邮件/OAuth/找回链路 | 不显示虚假可用入口 | 代码保留原 EmailVerificationForm 分支；当前邮件分支未实测，不能据此宣称邮件可用 |
| 团队创建/加入/撤权 — 完整可用 | 原 teams 与本地成员规则；Team | 已授权本地账号操作，成员撤销立即影响 UI/设备/备份访问 | 本地真实后台/权限测试；不向外发送邀请 |
| 设置与资料 — 完整可用 | 原资料字段 + ProductSettings；Settings → Profile & appearance / Notifications / Keyboard / Connections / About | 外观/快捷键与来源说明；账号/目录仍走原查询 | 分组、进入/退出/重开、深色/缩放/键盘验证；未逐项修改所有资料字段 |
| 邮件/手机通知和模型执行 — 明确不支持 | 本地消息/原通知设置不等于已配置外部投递 | 当前范围没有模型调用与邮件/手机服务 | 不伪称已送达、可执行；保留身份图标不等于增加对应捕获适配器 |
| 其它 Agent 捕获、独立检查点逐行评论 — 明确不支持 | 当前只有 Codex 捕获；任务评论仍是真实独立能力 | 不拿通用终端图标伪装来源 | 连接页、About 与来源说明如实表达 |

## OpenDesign 六项方法的实际对应

只读代码基线为 [6bf7fa79120f9da261be43a71d7ec1a28c2b2ef9](https://github.com/nexu-io/open-design/tree/6bf7fa79120f9da261be43a71d7ec1a28c2b2ef9)。本地研究 checkout 的 HEAD 是另一个版本，因此本轮用 `git show <指定 commit>:<路径>` 阅读，未把 HEAD 文件冒充指定基线。[当前官网](https://open-design.ai/)用于产品展示观察；营销背景/生成作品不是可交互软件证据。没有运行完整 OpenDesign daemon/app，也不声称全面学习所有组件。

| 参考观察 | ColloSys 落点与实际改变 | 验证 |
| --- | --- | --- |
| `styles/tokens.css` 将中性内容、选中、操作、品牌拆开 | product-shell 语义表面/文字 token；项目索引实色、安静概览、明确选择边与主操作 | 项目/设置截图，浅/深主题 |
| `styles/material.css` 材质属于功能层，不是所有内容背景 | 内容面实色；菜单/Dialog/Popover 层次、细边/阴影；不支持滤镜及 reduced transparency 回退实色 | 设置与菜单截图，计算样式检查；未声称跨 GPU 性能认证 |
| `project-split-layout.ts` 容器约束、用户偏好与一致初始几何 | 原 Panel 分配空间与拖动持久化；容器查询决定概览位置；boot 静态/React 共用几何与 UI 导航宽度提示 | 四窗口、左右栏同时展开、静态→React 帧记录 |
| `AnchoredMenuShell` / `useAnchoredPopover` 的锚点、翻转、portal 与层级 | 继续使用已有 Radix，collisionPadding/hideWhenDetached、可用宽高与菜单层级；不复制另一套定位状态 | 边缘项目菜单、Escape 焦点、连续开合 |
| 真实 `ChatComposer` / `ChatPane` 与 `chat.css` 的输入结构、消息阅读意图 | 任务评论保留原组合；交接把上下文/下一步/来源/提交分开，错误与恢复靠近操作；会话保留滚动锚点与有界分页 | 草稿重试、长上下文、真实评论、会话分页与返回录像 |
| 控件按压/选中和面板进退有不同角色 | 控件轮廓/色彩/微位移，相关对象内容短 reveal，presence 处理退出；网络忙碌局部化，身份拒绝立即清除 | 中间帧、快速重开、reduced motion、撤权；不声称 60fps |

代码是 ColloSys owned 适配；没有导入 OpenDesign 实现、字体、品牌图形或生成模板。Codecast 原始 pin 与成熟认证/store/Convex/Diff 保持不变。

## 证据解读与限制

`before/login.png`、`before/projects.png` 是修改前实际基线。`regression/after` 与上一轮 `../refinement/after` 使用原测试项目和相同逻辑窗口，可比较同类工作内容；时间文本、后续验收产生的测试活动会变化，不是逐像素相同数据库快照。`after` / `native` 的长内容来自另建 TEST 团队、真实文件与 75 条测试 Codex 消息。

交接服务错误测试对该查询注入一次明确的 503 wire error，以验证 UI 错误分类；用户、权限、记录与其余后端仍为真实本地服务。权限撤销则是真实成员变更。区别写在测试中，不把注入故障说成自然发生的服务事故。

浏览器 125% 文字测试使用 CSS zoom；桌面用 Electron 实际 zoom factor。Windows 显示缩放以原生证据文件为准，未切换全机设置或认证多显示器。录屏记录过程，不是 FPS 基准；不能仅凭静态图宣称流畅。

仍未认证：跨机器公网协作/免费额度容量、异机灾备、全部上游隐藏入口、完整辅助技术矩阵、多物理显示器/其它系统、公共安装包/更新器。未购买、部署、发送邀请、调用付费模型或使用本地 skills。没有自动应用队友文件。隔离测试数据保留在 `.local`，不进入源码提交。

## 实际验证结果

下列都是本轮实际执行结果。构建最终版本见 `version.json`。分栏/长内容/备份与主视觉截图在最后的 auth 存储修补之前采集；该修补和构建引用修正后重新执行了登录存储、双窗口退出/换号、撤权/重试/草稿隔离及真实桌面业务流程。没有把早期截图描述成最后构建的全量重跑。

| 命令 | 实际结果与证据 |
| --- | --- |
| `npm run typecheck` | 通过；`.local/completion-root-types.log` |
| `npm test` | **64/64**，包含新 Windows 长路径捕获与恢复；`.local/completion-root-tests.log` |
| `npm run build` | 最终构建通过，**1m35s**；原有 circular/dynamic import/large chunk 提示仍在；`.local/completion-build.log` |
| `npm run typecheck:integration` | 最终 prepared fork **55** 个 owned 文件通过（含实际平台存储）；`.local/completion-final-types.log`。不冒充完整上游全仓类型认证 |
| `npm run codecast:verify` | 原始 **9,854** 普通文件、2 个记录链接、**0** 失败；Windows 换行规范化单独记录 |
| `node tests/codecast-backend-completion.mjs`，重启后 `node tests/codecast-backend-completion.mjs --after-restart .local/codecast-app/backend-completion-1793167226590` | **10 + 1** 组通过；加密/错误密钥/损坏/配额/并发/权限/收据迁移/有界历史与持久化，`backend/completion.json`、`backend/restart.json` |
| `node tests/codecast-native-backend.mjs --check-launch-rejections` | **10** 组通过；`backend/native-access.json` |
| `node tests/product-ui-completion-surfaces.mjs`，以及 `--native` | 浏览器 **7** / 桌面 **4** 组；`surfaces`、`native-surfaces`。1440×900、1280×800、1920×1080、960×720；双侧栏同时展开、拖动极限、菜单、设置、缩放、深色与 reduced motion |
| `node tests/product-ui-completion.mjs`，以及 `--native` | 浏览器 **12** / 桌面 **12** 组；`after`、`native`。实际目录、捕获会话、清理计数、pin 持久化、加密创建/恢复/导出/删除与预览；源文件字节不变 |
| `node tests/product-ui-completion-handoffs.mjs` | **6** 组；`handoffs`。检查点来源、单次 503、断网草稿、接收/拒绝/取消与真实撤权；不应用队友文件 |
| `node tests/product-ui-refinement.mjs`，以及 `--native` | 浏览器 **11** / 桌面 **11** 组；输出通过 `COLLOSYS_UI_EVIDENCE_DIR=docs/product-ui/completion/regression` 隔离。65 条消息阅读锚点、32 文件 Diff、草稿范围、设置/详情进退与核心页面 |
| `node tests/product-auth-storage.mjs` | **6** 项；`auth/storage-results.json`。实际浏览器 IDB：丢失 localStorage 的正常恢复、退出期间旧读取/排队写入、旧清理与新登录、refresh 轮换与显式清除；使用独立测试数据库及虚拟值 |
| `node tests/product-auth-continuity.mjs` | **3** 个完整循环；`auth/results.json`、`auth/continuity.webm`。真实 A→B→A 登录、双窗口退出、刷新仍退出；英文 Google Sans 实际字体证据 `auth/english-fonts.json` |
| `node tests/product-ui-refinement-access.mjs` | 最终修补后 **3** 组；`access`。两个窗口真实撤权清除、恢复成员后重试、退出/换号不保留旧阅读位置与草稿 |
| `node tests/product-ui-flow.mjs --native` | 最终修补后 **7** 组；`flow`。真实独立窗口、会话、交接接收、Diff、任务评论写入、项目创建和核心路由返回 |
| `node tests/codecast-desktop.mjs .local/codecast-app/acceptance-1792918795288` | **9** 组；`backend/desktop.json`。原生目录选择/取消、桥接授权、真实检查点与确认恢复写盘、重新打开、深链接与关闭选项 |
| `node tests/codecast-workbench-audit.mjs .local/codecast-app/acceptance-1792918795288` | **6** 组；`backend/workbench.json`。241 个实际文件、45 个检查点离线补齐、冷链接、成员撤权和账号边界 |

静态→React→认证共记录 **148** 个采样帧（99 / 39 / 10），采样中无空白阶段；品牌锚点 x=20、y=14、30×30 在两个启动层一致。不是每一个显示帧的性能测量。中文实际字体与桌面窗口信息分别见 `regression/native/actual-fonts.json`、`native-surfaces/native-window.json`：本机 Windows scale factor **2**，不是三台物理显示器认证。

在真实操作中发现的旧登录残留、tooltip 首次点击吞失、侧栏缩放缓存、清理后选择和长路径问题均有修复及回归；旧失败图已移到忽略的本地调试目录，当前证据保留最后通过运行。`00-startup.png` 是真实启动阶段，未将其冒充登录表单截图。

最终 `npm start` 已打开并保留正常 profile 的 ColloSys 独立窗口，当前工作区为空，不把测试数据植入用户账号。[正常桌面截图](normal-desktop.png) 与 [窗口/回环端口记录](normal-desktop.json) 随附。原系统截图依赖屏幕前台，最终审阅发现遮挡黑帧后改为对已验证 ColloSys 句柄调用 `PrintWindow`，并拒绝空白结果；随后重新采集原生业务流程和窗口关闭/恢复验收。没有保留其它前台应用画面。

最终桌面复测的完整 **9/9** 结果来自 `.local/codecast-app/desktop-acceptance-1793176626849`。其前一次附加运行在第 5 项后退出、没有生成最终结果，不计为通过；该本地目录保留，未用早期结果冒充那次运行成功。最新 `backend/desktop.json` 指向完整结束的复测。

视觉选择仍待用户直接审阅；当前可操作流程及技术通过不替代该判断。后续本地提交按用户明确要求进行，未推送或公开部署。
