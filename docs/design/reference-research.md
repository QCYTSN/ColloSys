# 参考研究：从参考机制到 ColloSys 决策

研究日期：2026-10-26。阶段 A，服务于阶段 B/C 的两个候选；不是正式设计批准记录。

## 研究边界与可核查版本

| 对象 | 实际检查范围 | 版本 / 证据 | 明确限制 |
|---|---|---|---|
| OpenDesign 官网 | Chrome 实际渲染、1440/800 视口、完整页面、产品菜单 hover、滚动区块、DOM 和计算样式 | [官网](https://open-design.ai/)，[1440 截图](evidence/references/opendesign-web-1440.png)、[800 截图](evidence/references/opendesign-web-800.png)、[完整页](evidence/references/opendesign-web-full.png)、[菜单](evidence/references/opendesign-web-menu.png)、[样式测量](evidence/references/opendesign-web-measurements.json)、[补充测量](evidence/references/opendesign-web-detail.json) | 这是营销站，不是软件运行状态；图片里的软件不能当作可交互 app 的证据。访问偶有连接中断，成功采集后才形成结论。 |
| OpenDesign 软件 | 根/层级 AGENTS、App → WorkspaceTabsBar/ProjectView → split geometry；选择菜单、共享 Button/Dialog、执行记录、浮层定位与 CSS | [固定版本 26d6029](https://github.com/nexu-io/open-design/tree/26d60298f8129e229a1c10aab4df7ca25b1e9ad3)，只读研究副本 `.local/reference-research/open-design` | 未安装和运行完整 daemon/app；以下软件交互为源码验证，不能冒充端到端验证。 |
| Codecast 本地原件 | 完整工作台与本地 Convex、源码路由/布局/store/会话/任务/diff/组件 | 固定 [5dfb04f](https://github.com/codecast-sh/codecast/tree/5dfb04f516122fe4f59a61137219b5a4e2e1f9f8)；`third_party/codecast/SOURCE.json` | 上游本次 HEAD 为 `3ce318476d96286b13ef8dbb74bf72b93df0ae9a`；不升级项目、不把固定版本结论说成最新 HEAD 全量结论。 |
| ColloSys 当前集成 | 真实活动、文件变化、单条消息、恢复预览；被否定的设计样例；原生 ConversationView 加明确 fixture | [活动](evidence/references/current-real-01-activity.png)、[diff](evidence/references/current-real-02-changes.png)、[消息](evidence/references/current-real-03-message.png)、[恢复预览](evidence/references/current-real-04-preview.png)、[旧样例](evidence/references/rejected-1440.png)、[原生 reader + fixture](evidence/references/codecast-reader-fixture.png) | 原生 reader + fixture 不是已连接的 ColloSys 完整会话。真实基线只读检查，没有确认恢复。 |

GitHub 连接插件请求失败，改为公开 Git 读取；初次直连失败后沿用本机现有代理。没有上传工程、发送邀请或执行模型任务。研究副本没有写入产品构建。源码许可证：OpenDesign Apache-2.0；Codecast MIT。

## A. 参考界面分析

### OpenDesign 官网：视觉重心来自层级压缩，而非卡片数量

1440 视口下导航高 54px，左右各承载导航/账户，品牌独立居中；下方主视觉外侧仅 8px 边距。背景是一个连续的大面，标题、单段说明、两枚 CTA 和软件图按一条中轴排列。软件图约占页面宽度的 73%，不是几个等宽功能卡同时争夺注意。

计算样式中导航正文为 Albert Sans/中文系统 fallback，16px/24.8px；主说明为 16px/20px。`h1` 外层计算值为 72px/700，但其内部自适配结构和实际文本框不能简单等同于 72px 文本，测量文件保留 DOM 选择器和边界矩形。全站不是只靠很浅的灰色建立层级：重要按钮是实心深色，正文有稳定对比。导航背景、边框、阴影的过渡为 260ms；主说明入场为 900ms，属于宣传叙事，不能照搬到高频工作流。

菜单 hover 证据见截图。站点的导航、软件展示和固定促销层是三种层级；促销横幅在 900px 高窗口会遮住软件图底部。这是应该舍弃的干扰，不因参考站出名而合理化。窄窗口重新收拢导航，不能靠缩放整页维持桌面比例。

**适用原则**：整个视图只建立一个主要阅读重心；将低频入口从主内容移走；用实心关键控件而非提高所有组件的强调度。**不采用**：大图背景、营销标题尺度、固定促销横幅、长入场动画。

### Codecast / ColloSys 真实工作台：复杂度有工程理由，默认表达不全适合我们

真实活动截图显示：全局导航约 360px，右侧还有项目标题、页签、目录连接行、活动/历史切换，正文从约 y=300 开始。当前功能可达，但用户要越过多层上下文才能读到“谁改了什么”。测试账户长邮箱直接占据活动行中心，反而挤掉变更语义。

原生 ConversationView 的固定 fixture 截图显示：用户输入和 Agent 输出不同形态；消息正文保持统一阅读轴；工具、上下文和密度是可独立展开的机制，不要求每条工具输出常驻。它确实能承载长对话，但当前 ColloSys 事件只是独立捕获消息，不能凭此宣称具备完整关联。

**适用原则**：保留长内容的阅读位置、按文件/行定位、任务与评论共享同一事实来源；将面板显隐和内容生命期分开。**需重设计**：默认全局导航项目数量、顶栏横向堆积、正文等宽字体、在小团队内过重的组织/托管功能。

## B. 源码级追踪

以下路径 `OD/` 代表固定研究副本根；`CC/` 代表固定 Codecast 原件根。每项均包含入口、状态、渲染与事件，而非文件清单。GitHub permalink 以上述 commit 和下面路径拼接即可复查；文件哈希和选读范围另见 `evidence/source-manifest.json`。

### OD-1：空间由内容约束决定，加载前后使用同一几何函数

- 入口：`apps/web/src/App.tsx:6021`，`workspace-shell` 只容纳 `WorkspaceTabsBar` 和 body；`ProjectView` 在 5812 附近接收当前项目与创建交接状态。
- 样式：`styles/shell.css:19–55` 固定 44px tabs + `minmax(0,1fr)` body；每一层有 `min-width:0/min-height:0`，不是任由长内容撑破窗口。
- 几何来源：`components/project-split-layout.ts:16–147`：chat fallback 460、最小 345，工作面最小 400，handle 4。默认以可用宽度的一半计算并 clamp；用户拖动后保存的宽度优先；小于两面最小值之和时，工作面可退到 0 最小轨道。
- 事件：`ProjectView.tsx:12899–12973` 拖动结束才保存偏好；`ResizeObserver` 调同一个 resolver；初次测量 `animate:false`，避免加载后滑一下。创建占位和真实视图也调用相同 resolver。
- 推论：精致的比例包含首帧、拖动、窄窗和加载交接，不是某个截图里的 50/50。ColloSys 用内容最小宽度决定拆分阈值；首帧不做布局动画。**借鉴，重新设定具体宽度**。

### OD-2：CustomSelect 不只是一个下拉框

- 入口与状态：`components/CustomSelect.tsx:54–95` 将 `value`（已选）与 `activeValue`（键盘游标）分开；展开时定位当前有效选项，并跳过 disabled。
- 定位：96–123 行测量触发器；4px gap、12px viewport padding，上下空间比较决定翻转；菜单宽跟随触发器，高度受可用空间约束；portal 到 body，避免被滚动面板裁掉。
- 关闭与键盘：137–202 行监听外侧 mousedown、resize、捕获阶段 scroll；ArrowUp/Down 环绕有效选项，Enter/Space 提交，Escape 关闭；选择后把焦点还给触发器。
- 语义：259–300 行 combobox/listbox、`aria-expanded`、`aria-controls`、`aria-activedescendant`；hover 与 selected 分开；选中 check 有固定位置，避免文字跳位。
- 样式：`styles/primitives.css:263–373`：触发器最小 36px、7×10 内距；菜单 4px padding；选项最小 30px、13px 字体、固定 16px check 列；hover、active、selected 不合并。
- 限制：源码的 `maxHeight` 有 160px 下限，极矮窗口不能据此保证完全不溢出；此选择器未在完整运行 app 中测。我们保留成熟 Radix 的定位/键盘能力，自定外观。**采用通用模式，不复制自写菜单实现**。

### OD-3：浮层质量来自锚点、裁剪祖先与状态复用

- `components/chat/AnchoredMenuShell.tsx` 将已有 viewer 菜单移动到触发卡片旁，保留一份菜单状态；portal 时带上必要祖先 class，避免后代样式失效。
- `hooks/useAnchoredPopover.ts:214–380` 联合触发器、菜单真实尺寸、裁剪祖先计算可用区域，监听捕获 scroll 和 ResizeObserver。隐藏/移除的锚点不再留下漂浮菜单；约束最大宽度时同步降低 min-width。
- `AnchoredMenuShell.module.css`：容器 pointer-events:none，菜单本体恢复；向上展开用独立 placement 样式，定位位移不占用动画 transform。
- `tokens.css:134–151` 将 hint 4000 与 menu 9000 分开；原文件明确承认其它约四十处 z-index 仍为散落值，不能描述成完美统一层级。
- 推论：ColloSys 浮层都从 body portal、共享 token；菜单 hover 提示不能遮住菜单。**直接采用原则；用 Radix 避免重复造定位系统**。

### OD-4：普通按钮的精致源于边界明确，不是复杂装饰

- `packages/components/src/button.tsx:14–57` 用 variant/size 映射统一语义，默认 `type=button` 防止表单误提交。
- `button.module.css:1–100` 36px 高、14px/600、8px icon gap；只继承 font-family，避免继承正文行高改变高度；primary/ghost 移除实际 border，而非只让边框透明；active 仅位移 1px。
- `tokens.css:153–219` 明确定义圆角尺度、50–500ms 时长、缓动，以及正文 13/1.7、代码 13/1.65。基础灰阶承担主体，绿色只在少数状态/品牌位置使用。
- `material.css:191–250` 降低透明度/不支持 backdrop 时在 token 层退化为实色。它没有让内容卡全部变玻璃。
- 共享 `dialog.tsx` 确有 body portal 和可选 Escape/backdrop 关闭，但这个文件自身不包含焦点陷阱或焦点归还，不能因 `aria-modal=true` 就认定完整可访问。**视觉约束借鉴；Dialog 行为沿用现有 Radix**。

### OD-5：执行记录的折叠取决于任务状态

- `components/chat/ExecutionShell.tsx` 的输入是纯模型 `runtime/chat/contract`，归属分组在 `runtime/chat/build-turn-blocks.ts`；容器不从显示文案猜工具属于谁。
- 进行中默认展开、完成/失败默认收起；手动取消是显式终态，不能继续显示“进行中”。思考状态由事件驱动，空字符串不等于没思考。
- 两个同为 60 秒的计时器分别表示“最近无新帧”和“还没第一项输出”；源码明确禁止合并。
- **采用**状态驱动的渐进披露；ColloSys 没有可靠运行证据时显示“最近有活动/状态未知”，不由传输连接、文本或时间接近推断 Agent 仍在工作。

### CC-1：Inbox 导航有稳定身份，背景 tab 不改写当前选择

- 路由：`packages/web/app/inbox/page.tsx` → AuthGuard/ErrorBoundary → `QueuePageClient.tsx`。
- `QueuePageClient.tsx:369–516` 从 `inboxStore` 读 sessions、currentSession、showMySessions、inboxHome；使用 `sessionsWakeSig` 避免每秒心跳把全列表重排。
- `?s=` 是 tab 的定位来源。只有 `useTabActive()` 为真时才更新全局选择；未在缓存中的 deep link 经 `useMissingSessionLookup` 注入，拒绝访问/已删除目标有 unavailable 状态。切换 tab 时不销毁后台内容。
- 选择事件经 `navigateToSession`、MRU、URL 协同；不是 local setState 替代全局路由。
- **采用**可寻址工作项、返回时保留阅读状态；**重设计**Inbox 表面为“需要处理”而非把每个新事件当同等重要。

### CC-2：自适应面板的连续性来自不卸载内容

- `components/DashboardLayout.tsx:1017–1100` 使用 react-resizable-panels；只有实际拖动结束才 `wsSetSize`，防止程序折叠得到的 0 被当作用户偏好同步。
- 收起时冻结内容原宽度，让遮罩/面板移动而非文字反复折行；动画 class 在 imperative resize 前就加上；首次加载不动画。360ms 清理是这个版本的实际实现，不能误写成全站统一 200ms。
- 窄于 768px 改抽屉；侧栏、context slot、tab 内分割是不同层级。原窗口框架保留内容和订阅，避免重挂 reader 闪 loading。
- **采用**保留 DOM/阅读锚点、只存用户拖动；**不采用**把四五层可调面板同时开放给十人以内团队。

### CC-3：对话密度与滚动策略独立于消息内容

- `QueuePageClient.tsx:66–100` → `useConversationMessages` → `ConversationView`；session 切换使用 deferred value。
- `ConversationView.tsx:292–319` 独立管理 full/condensed/compact 等密度；:1642–1679 虚拟列表 overscan=10，动态测量，followOnAppend 由 `shouldFollowStreaming` 控制。
- `conversationScroll.ts:1–65` 将“用户已经离开底部”作为意图锁；新 chunk/高度测量不能擅自把人拉回底部。显式目标、访客顶部、已登录尾部是不同初始规则。
- pending 与服务器确认的消息在唯一合流处处理，同一 key 使确认时复用 DOM，减少闪烁。任务上下文、权限问题、执行细节按需披露。
- **采用**新记录只显示增量提示，用户主动回最新；长会话的真正分页/虚拟化放到 D 的连接实现，C 只验证有限 fixture 的交互模型。

### CC-4：任务在多个入口复用同一个评论模型

- `components/tasks/TaskRow.tsx:63–136` 任务状态和 `useTaskActiveSession` 的执行活跃度是两个输入；状态按钮 stopPropagation，不把编辑状态误当打开任务。
- `TaskInlineThread.tsx:29–60` `useSyncTaskDetail(taskId)` feeder 填 store，`useTaskRow` 读取；同一个 `TaskCommentStream` 用于任务页面/嵌入线程；描述先折叠。
- **采用**任务是协作主线、评论有归属；新设计不再复制一份“活动任务状态”。**不采用**仅由 Agent 忙闲自动宣布任务完成。

### CC-5：Diff 是可追溯内容，不是装饰代码块

- `FileDiffLayout.tsx:40–133` 保留 `originalFilename` 与展示的缩短路径；文件/行选择、已读、评论锚点都按原始路径，避免同名文件混淆。
- `FileDiffSidebar.tsx:136–181` 搜索、去共同前缀、构建文件树、独立展开状态；主 diff 可统一/分栏，并支持页内 flow，不强制每列独立滚动。
- `DiffView.tsx:255–415` 将 LEFT/RIGHT 转换为 Pierre deletions/additions，评论按 side+line；Pierre 与语言加载时先显示可读 plain rows。持久评论模型与渲染器分离。
- **采用**原路径、行号、来源、只读属性；**重新设计**默认只展示当前任务相关变化，窄窗统一 diff，长行内部横向滚动。

### CC-6：组件基础与平台设计包不是同一个外观事实

- `components/ui/dropdown-menu.tsx:57–111` Radix Root/Trigger/Portal/Content；4px sideOffset，可用高度变量约束，item gap=8、16px 图标、disabled/focus/select 明确；data-state 和 data-side 决定进入/退出方向。
- `components/ui/dialog.tsx:33–72` Portal，显式 aria-modal 让全局快捷键停用；焦点、Esc、outside 由 Radix 处理。原 overlay 黑色 80% 和 zoom/slide 幅度无需照搬。
- `app/globals.css:335–510` 传统 Solarized/mono 与 minimal 主题同时存在；`platform/packages/design/tokens.css` 另外定义 Instrument Sans/Newsreader/Fragment Mono、90/150ms、6/10px 圆角。不能因为读了 platform tokens 就说当前工作台正使用它们。
- **采用**已有 Radix 交互底座、Phosphor 单一图标族；不新增 Base UI/React Aria/Motion 等重复依赖；CSS 按语义管理轻动效。

## C. 机制取舍总表

| 机制 | 结论 | ColloSys 具体落点 |
|---|---|---|
| 主内容单一阅读轴 | 直接采用 | 完整队列下方的当前详情 / 焦点任务主文档 |
| 项目/会话可寻址、返回保留状态 | 直接采用 | 两候选共享 URL 中的方案、工作项、内容页签 |
| 状态驱动执行折叠 | 借鉴重设计 | 运行证据单列，完成步骤默认折叠 |
| split 最小可读尺寸与首帧稳定 | 直接采用原则 | 证据面不足 320px 时改页签，绝不缩小字号凑三栏 |
| 全局和任务级信息分离 | 借鉴重设计 | 顶层仅项目/工作/查找；连接、备份、恢复在当前工作关联入口 |
| body portal、焦点管理、碰撞避让 | 直接采用 | Radix Menu/Dialog/Tooltip |
| 玻璃、营销入场、活动炫光 | 舍弃 | 内容全实色；浮层仅有阴影；运行用明确文字图标 |
| 所有字体都等宽 | 舍弃 | Google Sans + 中文系统字体，代码才用 Consolas |
| Fleet/托管 Agent 商业运行入口 | 舍弃 | C 不提供远程启动/付费执行；共享的是任务、评论和交接上下文 |
| 自动把时间接近事件归给 Agent | 舍弃 | 来源未知保留未知；手动编辑作为正常一级活动 |

## 研究结论的置信度

高：固定源码中可复查的状态与布局机制；当前产品真实活动与恢复预览；官网已保存的实际截图和 DOM。中：从实现推导的设计理由，已明确标为推论。未验证：OpenDesign 完整 app 的真实键盘行为、Codecast 最新 HEAD、远程协作/生产规模表现。研究不支持“已全面理解两个项目所有页面”的说法。

### 参考应用的真实运行与登录态限制

原版 Codecast 独立本地参考应用通过 8 项实际账号、任务与设置检查，结果见 [codecast-verified-result.json](evidence/references/codecast-verified-result.json)，有效界面见 [任务](evidence/references/codecast-verified-tasks.png) 与 [设置](evidence/references/codecast-verified-settings.png)。旧 `codecast-original-*` 截图因过期登录态跳转到官网，只保留作失败诊断，不作为工作台证据。`codecast-reader-fixture.png` 是实际原生 reader 加载合成内容，不能等同真实 Agent 会话。
