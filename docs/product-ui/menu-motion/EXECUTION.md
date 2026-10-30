# 真实菜单、登录视觉与剩余项

起点：`codex/product-ui / e0854f84b168215f637574ebff57572d3d9e6f30`，开始时工作区干净。本轮直接修改正式应用的 owned 源码，immutable upstream 和 `.local` 数据保持原位；没有使用本地 skills。前一轮“先推送提交”已完成，本轮没有新的提交、推送或部署授权。

## 真实入口和改动

`GenericListView` 的 `TabDropdown`、`DisplayMenu`、`AddFilterMenu` 经 `menu-patches.mjs` 明确接缝调用 `ProductListMenus`；`FilterDropdown` 经 owned entrypoint 调用 `ProductFilters`；窄头部 `SegmentedDropdown` 接入同一单选浮层。原任务 store、URL/preferences、筛选、分组、排序回调均保留。保存视图在当前入口是行内表单，并非浮层，不把它包装成菜单重做。

Active 使用 Radix RadioGroup，Display 使用 Popover + 内部 RadioGroup，所有候选轴保留。选择 No grouping 沿用原任务模型清空两级分组，同时隐藏次分组；手动排序的模型不应用方向，按钮因此禁用并说明原因。父面板即时应用，选择子项后仍打开。按压由稳定 button 内部视觉层的单次可中断 WAAPI 动作负责；浮层的 Presence/CSS 管进入退出；reduced-motion 不运行空间动作。真实测试发现上游列表全局 Enter 会打开任务，新控件采用现有 `data-owns-keys` 契约，保留 primitive 的事件处理。

登录左侧采用自有 `Fold` 陶土折叠形体。旧房间、花生角色、桌面、信封等已移除；产品 Logo、Google Sans 和右侧表单保留。比较证据为真实 `/login` 内两种静态构图：[克制尺寸](evidence/composition/restrained.png)、[放大并倾斜](evidence/composition/oversized.png)。选择前者：形体完整、留白更稳定、不会与表单争夺方向。此为设计判断，不代表用户已批准审美。

展示接口只接收枚举状态：普通输入向表单轻倾；密码字段向另一侧收回；真实 `auth.loading` 显示邮箱提交节奏；实际 OAuth 启动/等待分开；错误优先于 focus/blur；只有 `ProductStartup` 验证会话后才允许 success。认证导航从不等待动画。素材本地约203 KiB，无新增动画运行库；资源失败显示本地向量备用图；隐藏/离开视口和 reduced-motion 停止持续运动。原生最小化测试发现上游 `backgroundThrottling=false` 使 document.hidden 不足以反映窗口隐藏，新增只读、带版本的原生可见状态通知，专供装饰暂停；不改变同步调度、认证或窗口权限。

## 参考和使用边界

- [Rive macOS 登录设计](https://dribbble.com/shots/20488235-Beastly-login-screen-for-Rive-macOS-desktop-app)：已查看作者 Guido Rosso/Rive 页面及其真实视频封面。大型龙的剪裁和左表现/右安静的分配可借鉴；没有复制角色、背景或资产。证据 [poster](references/rive-login-poster.png)。页面第一次截图视频尚未载入，保留该失败画面，不将其算作视觉研究。
- [Rive marketplace 示例](https://rive.app/marketplace/2244-4437-animated-login-screen/)：已查看 JcToon 的雪怪以及 isChecking / isHandsUp / success/fail 等公开状态输入，研究因果回应，不声称其内部实现已审计。页面标 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，没有导入任何资源。证据 [页面](references/rive-marketplace.png)。
- [OpenDesign](https://open-design.ai/) 和 [源码](https://github.com/nexu-io/open-design)：查看真实页面中的协作编辑画面，借鉴工作面与外层的层级、内容主体比例，不移植其营销首页。证据 [页面](references/open-design.png)。
- [官方 Grok Bot](https://x.ai/bot)：核对产品和官方说明；本机浏览器被 Cloudflare 校验拦住，只有可读网页内容，**未声称看到了真实角色动态图或内部技术栈**。没有以其他 Grok companion 或无关机器人顶替。

用户的两张截图对应菜单参考；第三处按本次澄清为实际登录页左侧，已留 [旧整页](references/baseline-login.png) 和 [旧左侧](references/auth-scene-source-render.png)。

## 测量方法与当前进度

改动前 production/development 分别完成三轮：每轮独立 Chrome 进程/上下文，首次 Active、Display 各一次，之后各十次重复，总计每入口 cold n=3、warm n=30；OS 文件缓存未清空，不能称整机冷启动。相同持久化 TEST 项目201条任务、1440×900、DPR=1、页面缩放=1。实际 metadata 在各 JSON 中；旧生产包 commit=c48ce92 dirty、内容 fingerprint=f613f7…，不伪改标签成 e0854f8。

`product-menu-performance.mjs` 从真实 pointerdown 取起点；分别记录面板首次可见的帧观察（含 opacity>0.01）、可操作机会、几何/文本稳定和动画结束。它们不是物理显示器呈现时间。`product-menu-heavy-performance.mjs` 保留真实65消息、32文件，改为逐键输入；其中旧的 dropdown 指 **Project details**，不能替代新 Active/Display 测量。该脚本 action elapsed 含驱动和断言等待，只用于序列审计；延迟分析使用原始 EventTiming。Sidebar 的固定240ms等待不用于100ms指标。

方法修正与缺口：基线菜单使用保存的认证上下文；后测每个独立上下文从真实表单登录，登录不纳入菜单计时，进入同一项目后等就绪再测。曾尝试克隆认证快照但出现 SDK 启动状态不一致；后端确认其 JWT 仍有效，不能误记为“过期 token”。真实同上下文刷新和登录竞态另有回归。旧重内容脚本在登录后 reload 丢掉了逐键输入的内存日志，后测修为跳转前保存；输入结果因此只报告后测，且从前后重内容总体分位数中排除，避免以大量快键入稀释结果。Grouping 重排新增三轮共30次，仅有后测；不得声称其前后改善。后测额外分离32文件选择反馈、文件列表可用和内容稳定，同样不虚构这些阶段的历史值。

三轮重内容路径和 raw trace 分别在 `evidence/before/{production,development}/flows/round-{1,2,3}`。采样时没有并行浏览器研究或编译；源码起草不改运行页面。早期研究与采样曾重叠，最终基线已在其结束后完整重跑。

最终源码与生产包 fingerprint 为 `7f4ea772ccf37367598f60ed97eebf1129cc028d30023d59499cbbea3cbdc1cb`，仍为 e0854f8 后的未提交工作区。正常 Tasks 菜单、原生100/125/150/200%缩放、原生最小化暂停、五种宽度的light/dark登录、真实邮箱错误与成功登录均已实测。完整证据从 [REVIEW.html](REVIEW.html) 进入；测试结论不代替审美认可。

## 最终性能结果

单位均为ms；完整样本、环境和每轮结果见 [汇总](evidence/performance-comparison.json)。下表为实际菜单首次可见帧观察；每行冷首次 n=3，热操作 n=30，p50/p95只来自热操作。

| 模式 / 入口 | 改前冷首次三轮 | 改后冷首次三轮 | 改前热 p50 / p95 | 改后热 p50 / p95 |
|---|---|---|---|---|
| production Active | 5.8 / 6.9 / 9.3 | 43.0 / 40.3 / 48.9 | 3.4 / 4.6 | 18.0 / 21.9 |
| production Display | 10.0 / 10.2 / 9.8 | 26.6 / 36.6 / 42.3 | 4.9 / 5.9 | 18.2 / 20.2 |
| development Active | 7.1 / 7.2 / 7.5 | 42.4 / 67.5 / 85.2 | 4.5 / 6.1 | 17.4 / 37.9 |
| development Display | 9.7 / 9.0 / 7.8 | 60.7 / 60.5 / 68.4 | 6.4 / 8.0 | 18.6 / 27.0 |

新菜单的定位、焦点、Presence和入场增加了开销，**没有比旧条件渲染更快**。这些样本中首次可见/可操作仍均小于100ms，不需要等入场结束才能选择。生产热操作的稳定/动画结束p95：Active203.7/203.7、Display202.7/202.7；开发为220.3/220.3、209.1/209.2。这包含三帧稳定观察，不等于配置的160ms CSS时长，更不等于首次点击被阻塞200ms。Grouping改为Assignee/Status的真实重排各模式 n=30：生产反馈p50/p95为13.7/24.4、内容稳定p95为39.8；开发34.1/57.9、稳定71.8；该项没有改前基线。

以下每格依次为三轮结果。除“首次”外为该轮已报告EventTiming的p95，不能把三次首次当成可信的总体p95。Project details是保留的另一入口。每轮重复下拉11次、侧栏开合8次、长会话返回4次、Diff切文件6次；不足16ms而未报告的事件不填零，实际有效 n 在JSON中。

| 路径 | 生产改前 | 生产改后 | 开发改前 | 开发改后 |
|---|---|---|---|---|
| 重内容交互 p95 | 128/128/120 | 128/112/120 | 168/152/144 | 152/136/176 |
| Project details 首次 | 128/128/120 | 128/112/128 | 88/112/104 | 112/128/72 |
| Project details 重复 | 72/72/64 | 64/72/72 | 72/80/64 | 72/56/56 |
| 侧栏开合 | 64/64/72 | 64/64/56 | 72/72/64 | 64/64/48 |
| 65消息会话返回 | 144/128/128 | 136/144/120 | 136/168/192 | 192/136/208 |
| 32文件Diff首次 | 208/216/192 | 112/120/168 | 256/296/272 | 136/144/144 |
| Diff切文件 | 40/48/40 | 40/40/40 | 40/48/48 | 40/40/40 |
| 已记录长任务总时长 | 2849/2833/2815 | 2484/2575/2599 | 12610/12314/12076 | 9843/9932/9397 |

32文件后测进一步分阶段。每格均是三次真实打开的单次值，没有借用其他页面的响应时间：

| 模式 | 真实选择反馈 | 32文件可操作 | 内容稳定 |
|---|---|---|---|
| production | 64.5 / 75.3 / 121.9 | 143.4 / 154.1 / 208.7 | 207.8 / 216.1 / 309.7 |
| development | 97.0 / 106.9 / 109.2 | 181.6 / 197.0 / 193.9 | 344.1 / 317.9 / 277.6 |

结论：Diff路径有一致的EventTiming下降，长任务总时长也下降；但生产一次、开发两次首次选择反馈仍超过约100ms，长会话与Project details没有一致改善，开发第三轮整体p95反而更高。**整体流畅目标尚未全部达成**。没有将较好的一轮替代全部结果，也没有关闭动画、删数据或扩大到认证/列表引擎重写来追数字。

登录逐键输入的后测EventTiming：生产三轮 n=76/70/66、p95=24/24/24；开发 n=70/63/70、p95=24/16/24；所有已报告键入最大24ms。仅代表当前场景，缺少可靠改前记录，不声称“输入提升了多少”。密码显隐与真实提交错误的补充采样单独记录，避免将后端返回耗时混同为按钮反馈。

补充 [production](evidence/after/production/auth-performance.json) / [development](evidence/after/development/auth-performance.json) 各使用3个独立进程，每轮10次真实密码显隐和1次真实无效账号提交，不录输入内容、请求体或明文密码画面。显隐 n=30 的首次变化帧p50/p95：生产5.2/5.8、开发3.8/7.3。提交首次反馈三轮为生产5.0/4.6/5.4、开发7.0/6.6/6.9；实际错误出现帧为生产38.1/37.5/38.5、开发59.8/49.4/52.5，包含本机后端请求，不推断远程服务速度。等待来自真实auth.loading，错误来自真实返回；不是延迟模拟，也没有改前对照。

## 上轮六项关闭表（本轮逐项复核）

| 要求 | 实际入口/实现 | 当前证据状态 | 仍缺什么 |
|---|---|---|---|
| 启动与登录门禁 | `ProductStartup` / 正常桌面启动 | 已实现并实测：未登录深链、无效/过期凭据、正常会话、退出迟到响应；最终包重跑 | 无新增门禁缺口；真实外部provider另列 |
| GitHub / Google | `ProductOAuth` / `colloIdentity` / `colloAuthRelay` | 代码存在；本机配置检测确认两者均未配置；没有伪造提供商成功 | 真实控制台配置、隔离用户授权往返 |
| 桌面菜单 | owned Electron main / native appearance | 已实现并实测：原生句柄、Windows菜单隐藏、最大化、Ctrl+0/编辑/设置快捷键、主题重启；新菜单四档缩放 | 未声称验证跨物理显示器拖移或原生60fps |
| 登录左右布局与原创视觉 | `/login` / `ProductAuthScene` | 已实现并实测：生产1920/1440/1280/960/390、light/dark、输入/错误/备用图；真实提交、目标跳转、最小化暂停与恢复 | 视觉尚待用户认可；OAuth等待图仅组件预览 |
| 真实菜单和性能 | Tasks / `ProductListMenus` / `ProductFilters` | 已接通正式入口并实测：单选、全部分组轴、分层Esc、快速切换、保存/分享/刷新、窄窗；性能单列 | 见性能结果及未达标项，不以功能通过替代性能结论 |
| 项目标识与应用外观 | `ProjectIdentity` / `ProductAppearance` | 已实现并实测：创建/编辑/取消/刷新、并发冲突草稿、跨窗口外观；最后原生可见性补丁未改变这些模块 | 无新增实现；保留appId/userData等兼容 |

## OAuth 与兼容

最小配置仍按 [OAUTH.md](../../../integrations/codecast/OAUTH.md)：本机后端私有文件配置 `AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`。实际服务为 loopback 3409，回调为 `/api/auth/callback/github`、`/google`；控制台需登记匹配地址，不能把示例当成已经注册。secret 不进入前端、日志、截图或仓库。真实 provider 验证待外部配置；这不阻塞菜单、登录视觉与模拟安全回归。

appId、userData、持久化 auth namespace、DB/IPC 和现有用户数据不迁移。显式账号关联仍不支持，邮箱碰撞沿用原登录方式而不自动合并。此前的 [迁移说明](../identity-motion/MIGRATION.md) 保留适用；本轮新增内容只是菜单适配、视觉资产和展示状态。

已复核 [GitHub 官方回调规则](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) 和 [Google Web application 回调规则](https://developers.google.com/identity/protocols/oauth2/web-server)：当前 loopback 地址用于本机开发配置，不是已注册的客户端。Google 使用 Web application 类型；桌面通过系统浏览器委托本机服务，不将 Web 客户端误称为 installed-app 客户端。

## 发现的问题与修复边界

- 原列表全局 Enter 会与新浮层抢键盘；采用已有 `data-owns-keys` 契约。所有原始数据回调仍由原页面提供。
- 连续重开/切换时，仍在退出的非模态层会把新层当外部点击，随后焦点归还又关闭新层。触发器归属判断只取消浮层自定义 dismiss 事件，不吞原生 pointer/key；退出时尊重新目标已取得的焦点。原生测试实际覆盖 Display → Active 立即切换。连续采样还发现选项退出的110ms内Esc被已关闭的子层吞掉；已关闭子层现在把Esc交给父设置面板，不增加等待，专项回归覆盖。
- 关闭内容设 pointer-events:none 仍不够，Radix 外层定位盒的内联 auto 会挡住下方；对仅处于 closed 的实际 wrapper 明确关闭命中。
- 早期 CSS zoom 测试使浮层越界。产品没有该缩放模式，没有为测试往产品加比例补丁；正式替换为真实 Electron webContents 缩放，并保留640/720/960 CSS px低高度窗口检查。Electron CDP 在系统200%DPI叠加页面缩放时会裁错截图，图像改用实际 webContents.capturePage；原生句柄、系统DPI、页面缩放、viewport分别记录。
- 32文件路径基线 trace 有超过200ms的主线程调用。`LocalWorkspaces` 现在先提交真实检查点选择/状态，再由 React 调度昂贵 Diff 子树；仅对该子树 memo，按事件 key 隔离，撤权仍立即卸载，不给数据/动画加固定等待。改善与仍未达标路径以本轮后测为准。
- 第一轮仅拆分Diff的后测未达目标，完整三轮保留在 [intermediate/deferred-only-production](evidence/intermediate/deferred-only-production/menus.json)：重内容p95为152/128/136ms，Diff首次EventTiming为192/184/240ms。第3轮 trace 的 checkpoint click 为178.779ms，其中一次同步layout42.4ms；CPU采样落在 `dayLabel`、`RailRow` 和 `formatDateFull` 的重复locale格式化，以及focus。新增 `ProductTime` 复用四个Intl格式器，通过owned接缝接入真实rail与web utils；没有修改shared协议或上游镜像。与原共享时间函数逐字比较，UTC/上海/纽约、跨年/DST/无效日期合计2628例一致，见 [equivalence](evidence/time-format-equivalence.json)。最终效果另列，不把微基准当整条链路改善。
- 测试本身修正：Project轴仅在全局Tasks提供；No grouping按原模型清空两轴；清除Status恢复All；分享链接不包含默认排序；已经位于Tasks时重复点侧栏会展开钻取，不用于刷新偏好验证。没有删掉数据、force click或改业务来适配断言。
- 存储回归原先依赖前轮残留的恢复副本，该副本已到期；现在仅在已核实的 `.local/.../TEST-independent-directory` 为测试创建新加密恢复副本，并校验源文件字节未变。异步拦截请求在关闭前清理。一次失败日志包含隔离测试会话请求头，该会话已撤销、证据已脱敏，回归日志写出前统一脱敏。

## 验证命令与覆盖

[verification.json](evidence/verification.json) 记录 typecheck、69/69 tests、1m52s build、当前完整fork的80个owned文件integration typecheck、9854原始文件零失败校验。构建仍有上游循环re-export/混用动态导入/大chunk警告，不称零警告。

[13组运行回归](evidence/regression/suite-results.json) 包含菜单、原生菜单、登录视觉、启动、认证竞态、真实本机后端安全、隔离provider策略、项目身份、原生外观、连续性、存储审查、真实撤权和认证持久化。安全/隔离provider策略/项目身份/存储/撤权/认证持久化在fd8f610版通过；新增原生可见性通知后，启动/认证竞态/原生外观在c464369版重跑通过。最终7f4ea77再修正已关闭子层Esc并接入日期格式器缓存，随后重跑菜单/原生菜单/登录/连续性，以及两种模式的菜单、登录和性能。各证据保留实际版本，不将较早安全回归重新标成最终构建；这些后续改动没有更改认证、后端或存储逻辑。实际恢复和存储测试仅操作隔离TEST目录，未改用户工作文件。

复跑：先 `npm start`；普通浏览器调试使用 `npm run codecast:app`。在已有生产服务上执行 `node tests/product-menu-regression.mjs`。采样须与其他检查串行：`node tests/product-menu-measure.mjs`；开发服务上加 `--development`。密码显隐/真实错误补测使用 `node tests/product-menu-auth-performance.mjs`，开发模式同样加 `--development`。不要同时运行编译、其他浏览器测试和性能测量。

收尾时已经从与 `npm start` 完全相同的入口启动默认配置，实际 ColloSys 原生窗口保持打开；确认原生句柄、响应状态、ready回调及最终资源指纹，3407–3411均仅监听127.0.0.1。见 [正常入口证据](evidence/normal-desktop-entry.json)。未对默认账号执行登录操作或编辑工作区数据，未将该账号画面放入公开证据。以后在 `D:\Github_Ku\ColloSys` 运行 `npm start` 即可再次打开。

[证据检查](evidence/credential-audit.json) 对本轮文本和压缩trace的高置信凭据模式未发现命中；它不包含视频OCR或任意未知secret保证。证据索引的本地链接均存在，`git diff --check`通过。当前更改仍未提交、推送；视觉尚未获得用户确认，真实OAuth及上文列出的性能缺口保留为未完成。

2026-10-30，用户随后明确指示“提交并推送”，授权将本轮源码、测试和证据提交并推送至现有 `codex/product-ui` 分支。上面的未提交状态描述实施与验收阶段；截图和测量保留当时的 e0854f8 / dirty 构建信息，源码指纹仍为7f4ea77，不重标旧证据。发布不代表视觉认可、性能缺口关闭、合并main或公开部署应用。
