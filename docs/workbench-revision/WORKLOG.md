# 核心工作区修订记录

## 基线与边界

本轮开始时 HEAD 为 `5f34787d0df64e99bc578539a3a5d4eca89896d9`，工作区干净。新建 `codex/context-workspace` 分支，未回退、提交或推送。原 Codecast pin 仍为 `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`。本轮只提供 `/workbench-preview` 候选入口，正式入口、后端、store 和 connector 不替换。业务数据接入及全站迁移仍等视觉选择。

## 发现 → 源码 → 修改 → 证据

| 已复核问题 | 代码证据 | 本轮修改与检查 |
|---|---|---|
| 六种互斥状态混合进展、交付、归属 | `workbench-20261026/fixtures.ts:Work.state`；其 main.tsx 据此渲染 | 新 `ContextModel.ts` 用独立事实投影；任务完成、待同步、无归属可并存。没有任务/执行事实时不推断完成或运行。 |
| 队列和多层标题侵占阅读空间 | A 的 visible 列表先于 detail；B 的 strip/title/detail-top/tabs 叠加 | [本轮复测](evidence/previous-measurements.json) 再次得到 1280 下 A y=545.33/h=350，B y=334/h=466。新索引独立滚动，主工作面与活动数量无关。 |
| before/after 全部作为删除/新增 | 旧 main.tsx 的 before.map/after.map，统计数组长度 | `ContextScenario.ts` 用真实 diff 算法生成合法 patch；`ContextWorkbench.tsx` 直接复用原 `FilePatchDiff`，统计由同一 parser 的增删行得出。 |
| 面板立即消失，静态测试无法验动效 | 旧 `.no-context .changes { display:none }`；verify 截图禁动画 | 新面板保留节点、宽度/透明度退出过渡；Tabs 保持两个工作面挂载，inactive 阻止焦点。浮层沿用 Radix 退出生命周期。动态检查与静态截图分开记录。 |
| 规范自相冲突 | PRODUCT 的历史单样板、双候选和“检查点只属于当前任务”等描述 | 历史保留并明确标为过时；根 AGENTS/PRODUCT 以本轮约束为准。自己的目录历史作为独立入口。 |

## 本地 skills 与 hooks 核对

用户明确禁止本轮使用任何本地 skills。本轮没有读取或执行 SKILL.md 指令，没有调用 skill 脚本、风格生成器、评分、normalize/distill 或 skill agent。仅核对相关安装/配置元信息及项目历史记录。

- 本机存在 `.codex/skills/impeccable/` 安装目录。此前会话确实主动使用过它，仓库 critique 和 design 文件保存了该历史；这不证明它导致了布局问题。
- 当前 `.codex/hooks.json` 为 `{ "hooks": {} }`，config.toml 的 `[hooks.state]` 为空，仓库无 `.codex`、`.claude` 或 `.agents` 项目配置目录。未发现启用的 Impeccable 自动 hook，因此没有声称完成某个停用操作，也未卸载全局内容。
- 全局 config 的 notify 为 Codex 桌面 `turn-ended` 通知，未改动。已安装的其他插件与可用 skill 目录不等于本轮被调用；未对无关插件/安全机制做更改。以上是可读配置的检查范围，不是对桌面运行时所有内部注入机制的保证。
- `.impeccable/critique/2026-10-25T08-31-34Z__integrations-codecast-web-designlab-tsx.md` 已读；它本身也承认零检测结果没有发现层级问题。旧视觉偏好不被提升为工程规则。

## 沿用并复核的参考机制

已有 `docs/design/reference-research.md` 的有效源码路径继续沿用，不重复“全面研究”长文。当前 [OpenDesign 官网](https://open-design.ai/) 再次访问，仍是产品宣传页，不是工作台运行基线。

| 源码位置 | 可观察机制与本轮决定 |
|---|---|
| OpenDesign `apps/web/src/components/project-split-layout.ts`；`styles/shell.css` | 同一几何函数服务首次加载和实际项目，定义 chat/workspace 最小尺寸；借鉴稳定几何，不复制宣传留白或玻璃表面。 |
| OpenDesign CustomSelect / AnchoredMenuShell / tokens，既有固定 source manifest | 定位、可用空间、选中和键盘游标分离；本轮保留已安装 Radix 实现，不重写菜单。 |
| Codecast `components/DetailSplitLayout.tsx` | 列表保持挂载，inactive inert，Esc 受弹窗/编辑器所有权约束。采用状态与可见性分开，索引不随详情销毁。 |
| `components/ConversationView.tsx`、`conversationScroll.ts` | 可变高度虚拟列表、显式阅读意图、分页与锚点；新捕获 reader 用现有 TanStack virtualizer 和 `shouldFollowStreaming`，保留按活动阅读记忆。原生组件作为同原始消息 fixture 对照，不称为真实会话。 |
| `components/FileDiffLayout.tsx`、`DiffView.tsx` → `diff/PierreDiff.tsx` | 原路径/左右行号作为定位身份，解析模型与渲染同源；直接使用 `FilePatchDiff`，不复写 diff renderer。 |
| 当前 materialized web package.json | 已安装 Radix、Phosphor、react-resizable-panels、TanStack virtualizer、Pierre、Markdown/语法高亮；本轮无需新组件或动画依赖。 |

## 信息映射与不能推断的事实

`ContextModel.ts` 引用当前 versioned protocol 与 workspaceTypes。任务进展只来自显式 task 字段；“需要你做什么”只来自明确 recipient/request；交付取 receipt 或本机 directory pending；session 来源与文件修改因果分开；本地完整性、共享分片和备份位置独立。

当前协议只有 checkpoint 和 user/assistant 的 agent.message。工具输出示例保留为原始 assistant 消息中的引用文本，不创造已捕获 tool 事件。当前协议没有 rename 状态，因此路径调整如实显示删除/新增，不猜测重命名。未提供模型名或远程执行状态时不填入。

已核对 `useCollaboration.ts` 的身份 epoch、撤权清理、分页 cursor 推进、checkpoint parts generation；这些正式逻辑未改。`colloSessions` 具有 bounded messages 与 indexHistory；`colloHandoffs` 校验双方权限、完整 checkpoint、任务归属与 revision，并冻结 throughSeq。正式接入仍需执行历史索引/完整性迁移，而不是用这个预览替代。具体契约继续以 `docs/BACKEND_CONTRACT_2026-10-25.md` 为准。

## 构图决定

一个 46px 项目栏；活动索引初始 300px，可调整 260–400px；一个主工作面切换上下文/变化。低频来源与存储按需打开；窄窗口进入单工作面，活动索引通过有焦点约束的导航弹窗访问。阅读与 diff 分别拥有滚动容器，保留选项与位置。阅读正文14px、代码13px、主要辅助12px；禁止用缩放整页凑空间。

这是候选实现的规则，不是用户批准的全局设计系统。旧 A/B 保留比较用途。

## 运行与同内容比较

仓库依赖准备完成后运行 `npm run workbench:preview`，打开真实 Electron 窗口中的候选。默认 `npm start` 仍是正式产品入口。浏览器调试使用 `npm run codecast:app -- --built`，然后访问 `http://127.0.0.1:3407/workbench-preview`。

「预览场景」可切换正常 / 10 人 100 条活动、模拟新记录和权限失效。选中有会话的活动后，可进入「Codecast 原生同内容对照」：实际 `ConversationView` 接收该活动相同的前 30 条原始消息，保持原版组件样式。它是只读 fixture 对照，不是完整原生业务工作台或真实 Agent 会话。

| 同为 1280×800 | 本轮截图 |
|---|---|
| 新候选阅读 | [context-1280](evidence/context-1280.png) |
| Codecast 原生阅读组件、相同消息 | [native-component-same-content-1280](evidence/native-component-same-content-1280.png) |
| 新候选真实 Diff | [changes-1280](evidence/changes-1280.png) |
| 本轮重新运行旧 A / B | [A](evidence/previous-queue-1280.png) / [B](evidence/previous-focus-1280.png)；旧 A/B 数据与新候选不同，只比较几何问题 |

## 实际几何与清晰度

以下数据来自最终 [浏览器测量](evidence/validation.json)，不是旧记录。正文 14px，代码 13px/23px 行高，主要辅助 12px。浏览器字体实际使用记录显示首段包含 Google Sans 自托管字体 12 个字形、Microsoft YaHei UI 系统回退 58 个字形；不是仅检查 CSS 声明。

| 窗口 CSS 尺寸 | 阅读容器起点 / 高度 | 首段正文 y | 初始索引宽度 | 首条非空代码 y |
|---|---|---|---|---|
| 1280×800 | 136 / 569 | 180 | 300 | 204 |
| 1440×900 | 136 / 669 | 180 | 300 | 204 |
| 1920×1080 | 136 / 849 | 180 | 300 | 204 |
| 800×900 | 146 / 659 | 190 | 0，导航浮层 | 214 |
| 390×844 | 176 / 574 | 229 | 0，导航浮层 | 见测量 JSON；文件选择改为上方横向列表 |

代码第一条非空内容比 180px 初始预算晚 24px：保留完整路径头、真实 patch 的第一条空白上下文行及原生行距，没有为截图删行。代码滚动面从约 173px 开始，1280 下高约 532px、宽 751px（含行号）；正文仍满足 180px 预算。390px 下标题自然折成两行，文件选择切到上方，优先保留正文/代码字号和完整路径。

索引在桌面可拖至 260–400px，主面最小 560px。小于 980px 使用单工作面和索引弹窗；小于 1400px 来源信息使用弹窗，窗口缩小时已打开的证据仍可访问。活动列表、会话和 Diff 各自滚动。100 条活动下读区起点、高度不变，选择第 97 条后仍在可见索引内。长路径换行保留原路径，代码保持横向滚动，不截断或缩小整页。

独立 [Electron 检查](evidence/desktop-validation.json) 使用固定运行时与隔离测试 profile，在 Windows 实际可见窗口中分别强制 1 / 1.25 / 1.5 设备缩放，实际 DPR 与之吻合，原生句柄非零；sandbox、contextIsolation 启用，nodeIntegration 关闭。对应正文起点 180 / 179.80 / 179.67px，读区高 569 / 569.80 / 571px，字体加载与 Dialog 焦点回归通过。150% 下内容窗口有系统取整为 1281×801 的差异。此处不是三台物理显示器测试，截图为窗口内容，测试另行验证了原生窗口存在。

## 实际交互、动效与验证结果

[完整操作录像](evidence/interaction-recording.webm) 来自最终浏览器检查，动画保持开启；静态截图只用于构图核查。`validation.json` 单独保留每帧宽度、透明度与可见性。工作切换为可中断的 80ms 淡出 + 130ms 进入；证据宽度 210ms、索引 200ms、Tabs 150ms；浮层沿用 Radix 的进入/退出生命周期。没有新增动画库。

- 浏览器 14 组检查全部通过，零捕获到的页面异常、零外部网络请求。包含五种窗口尺寸、同内容基线、纯键盘成员筛选与焦点回归、空搜索恢复、可调整索引、100 条密集活动。
- 120 条长会话按 30 条分页、变高虚拟列表保留测量缓存；跨活动返回与加载下一页的消息 ID/相对偏移一致（误差小于 5px），渲染消息节点少于 30 个。新记录等待阅读意图，显式点击才前往最新。
- 原始路径、增删/上下文、原/新行号选择、长 Diff 返回位置、同名文件、二进制、截断和排除文件通过。协议无 rename，路径迁移显示删除/新增。计数与真实 patch parser 一致。
- “任务完成 + 本机待同步 3 条 + 无 Agent 归属”同时呈现；共享检查点 1/2 片不被显示成可恢复完整副本。任务类别直接引用 Codecast 的 `TaskStatusCategory`，没有另造 `todo` 类别。
- 评论有独立语义且可回看；交接是可检查、未发送的草稿，不捏造会话/检查点关系。自己的未关联检查点能从目录历史进入；恢复确认必须勾选，目录变化后拒绝过期预览，重新生成清除旧确认。此处均为不写文件的演练。
- 逐帧确认索引/证据开合、工作切换、Tabs 和输出引用展开存在中间态；6 次连续证据开合后无遮挡，快速选择 2→3→1 最终落在最新目标 1；Dialog 退出后卸载并归还焦点。reduced-motion 下浮层动画为 0s。模拟撤权清除内容、缓存、评论与草稿；不代替正式服务端授权测试。
- `npm run typecheck` 通过；`npm test` 61/61 通过。本轮后端和 connector 实现未改。
- `npm run build` 最终通过（1m37s，`.local/context-workspace-build-final.log`）；保留上游已有循环 re-export / 大 chunk 提示，未伪称无警告。
- `npm run typecheck:integration` 对当前准备的完整 fork 通过，28 个 owned 文件（`.local/context-workspace-types-final.log`）。
- `node --import tsx tests/context-workspace-contract.mts` 通过：当前 eventSchema、独立事实、恢复权限、合法 patch/上下文/计数、长 Diff。
- `node tests/context-workspace-audit.mjs` 14/14；`node tests/context-workspace-desktop.mjs` 三种原生缩放均通过。两套结果 JSON 附实际时间戳，可重跑。
- `npm run codecast:verify` 9,854 原始普通文件、零失败；9437 个 Windows 工作树换行转换符合既有校验规则。完整 fork 为 73 项显式改动。没有更改 pin 或原始平台镜像。

## 失败与修复留痕

冷开发入口的依赖优化反复重载导致空白/超时，不计通过；改用正常准备与生产构建。首次 integration 检查发现 protocol bridge 仅导出 type、测量节点的通用 Element 不存在 dataset，分别改为类型引用/独立 schema 测试与显式属性读取。菜单键盘测试先等待 Radix 的焦点移动再按 Enter；行选择测试改为实际 gutter 的原生属性，未换成模拟点击反馈。单行替换本来可能没有上下文，断言改为只对两个真正多行 fixture 要求上下文。

动态检查确实发现两个实现缺陷：索引的过渡最初加在 Panel 内层，外层 flex 布局仍瞬间变化；现已对实际 `data-panel` 外层过渡，并在手动拖动时关闭过渡。快速点击当前活动曾绕过取消逻辑，令此前待提交目标覆盖最后选择；现已在过渡期间仍接受取消/重选，以版本号拒绝旧完成回调。最终录像与 JSON 包含修正后的检查。`first-render.png`、`first-diff-1280.png`、`failure.png` 为调试留痕，不是最终通过截图。

## 尚未完成、明确停留的边界

这是一个等待用户视觉选择的核心样板。`ContextScenario` 与展示模型分离，但仍是 fixture；真实 session 分页/索引迁移、生产评论与交接写入、团队/项目等其余页面迁移尚未接通。没有新增业务事实源、真实恢复写入、远程 Agent 启停或模型调用。完整产品 integration/恢复回归沿用此前记录，本轮没有把历史结果冒充重跑；正式接入时仍须重跑。

深色主题、完整屏幕阅读器审计、百万级性能、多物理显示器/DPI 跨屏、安装包/更新器和公网协作未验证。此次未调用本地 skills，未提交、推送或部署改动。GitHub Public 的既有 main 仍为审查基线，本地候选仅在 `codex/context-workspace` 工作区中。

最终以 `npm run workbench:preview` 打开供用户操作的正常 profile 窗口，观察到 `ColloSys desktop window ready` 及标题 ColloSys、非零原生句柄；窗口保持打开。关闭后由该启动器拥有的本机服务随之退出。停止调试服务后的第一次启动在准备源码后退出码 1、没有进一步原因日志，未计成功；随后完整启动达到就绪并确认原生窗口。格式检查与 `git diff --check` 最终通过。

## 后续 GitHub 发布授权

用户随后明确要求“推送GitHub先”，授权提交并推送当前候选到 `QCYTSN/ColloSys` 的 `codex/context-workspace` 分支。上文“未提交/未推送”保留为样板交付时的历史状态。此次上传包括源码、验证记录、截图和操作录像；不代表视觉批准，不合并 main，也不部署应用。
