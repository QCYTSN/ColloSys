# ColloSys 启动、身份与交互交付记录

本轮在 `codex/product-ui` 的 `c48ce92fac30778181a30b2fde51144c4b2ac624` 干净工作区开始，实施于正式产品入口。没有使用本地 skills、修改不可变上游、自动提交/推送、公开部署、发送邀请或调用付费模型。视觉审美仍由用户验收；下面的行为通过不代表审美已获批准。

用户随后明确要求“先推送提交”，授权将本轮源码和证据提交、推送至公开仓库的 `codex/product-ui`。上面的未自动发布描述属于实施阶段；发布不改变未完成项，也不代表部署或审美批准。下述构建标识保留实际录制时的 commit/dirty 状态；实现指纹不因 Git 提交而改变，不重新标记历史截图。

## 当前运行版本与打开方式

在仓库根目录执行 `npm start` 打开独立 Windows 软件窗口。浏览器开发调试单独使用 `npm run codecast:app`。切换模式前关闭上一套运行服务；不要删除 `.local/codecast-app`，其中有真实数据库、账号和目录配置。

本轮最终实现指纹：`f613f7df01ab27e34819ed40b0ae4715c4f0fcd35332fff6457759207f847f2f`；commit 为上述 `c48ce92`，dirty=true。源码→191 项 prepare 改动→生成 fork→生产构建→当前 HTTP 资源已核对一致，见 [build-identity.json](evidence/build-identity.json)。About 中可展开 **Build diagnostics** 查看 commit、dirty 和完整指纹；没有添加常驻调试条。普通 launcher 会拒绝附着到指纹过期的运行资源。

收尾已用正常 `npm start` 打开默认 profile 的真实 ColloSys Windows 窗口，记录在 [default-launch.json](evidence/default-launch.json)。没有截取默认 profile 的私人内容充作公开验收图片；公开截图/视频只用隔离 TEST 数据。[evidence-audit.json](evidence/evidence-audit.json) 记录文本和压缩 trace 的已配置秘密/JWT 检查及 review 文件链接检查；它不冒充视频 OCR 或未知凭据的全面审计。

真正修改入口是 `integrations/codecast` 与 owned 准备/启动脚本。`.local/codecast-app/source` 是生成结果，`dist/codecast-app` 是生产资源，主进程是 `integrations/codecast/desktop/main.cjs`，加载 `http://127.0.0.1:3407`。端口 3407–3411 均限 loopback。

## 六项结果

| 需求 | 实际入口及结果 | 状态 |
| --- | --- | --- |
| GitHub / Google | `ProductAuthRoot.tsx`、`ProductOAuth.tsx`、`colloIdentity.ts`、`colloAuthRelay.ts`：同一 Convex Auth 签发会话，浏览器回调及系统浏览器桌面授权领取。真实邮箱密码仍可用。两个 provider 当前均未配置，未发生外部成功授权。 | **已实现待外部配置**；领取安全与账号映射含明确标注的模拟输入，不能当作 provider 联调 |
| 启动和左右登录 | `ProductStartup.tsx`、`ProductAuth.tsx`、`ProductAuthScene.tsx`、`boot.mjs`：服务端确认后才挂载保护内容；慢服务可重试；原创花生信使场景、宽屏 57/43、窄窗口折叠场景。动画支持 reduced-motion 与不可见暂停。 | **已实现并验证**；断网和延迟采用真实组件的受控传输条件 |
| 桌面菜单和窗口 | owned `desktop/main.cjs` / `preload.cjs`：移除传统 File/Edit 菜单栏，保留 OS frame、窗口控制、编辑/缩放/设置快捷键；主题写入非敏感本机偏好。 | **已实现并验证**：菜单/窗口控制/快捷键/缩放；标题栏指针拖动未验证（前台限制）。OS 标准标题栏仍保留，不声称是自绘标题栏 |
| 命名、契约、领域与迁移 | `product-contracts.ts`、`colloDirectories.ts`、`colloProjectIdentity.ts`、owned entrypoints：目录 v1 API、项目 identity/revision、显式 scope、产品 auth/appearance/IPC 等调用链。 | **已实现并验证**：重复迁移、权限、实际事务失败回滚；保留必要底层兼容，不声称重写全部框架 |
| 控件反馈和卡顿 | `ProductControlTriggers.tsx`、`product-controls.css`、ConversationView narrow patch：实际共享触发器 pressed/open、焦点与退出生命周期；隐藏会话 header 不再因导航进度重渲染正文。 | 交互 **已实现并验证**；性能有真实前后采样，约 100ms 全链路目标 **未完成**，详见下文 |
| 项目标识和应用外观 | `ProjectIdentity.tsx`、`ProjectCreate.tsx`、`ProductProjectHeader.tsx`、`ProductAppearance.tsx`、`appearance-runtime.mjs`：搜索/键盘图标、命名颜色、一次保存、并发冲突恢复；Light/Dark/System 和四种 accent 使用同一套启动/运行 tokens。 | **已实现并验证**：真实创建/编辑/取消/刷新/冲突重试、多窗口与系统切换。最终包未检出 ThemeIntro 推荐卡 |

[REVIEW.html](REVIEW.html) 浏览本轮实际截图与连续录屏。不是另一个产品 Demo，也不是 `/workbench-preview` 的交付。

## 认证架构与真实验证边界

保留安装版本 `@convex-dev/auth 0.0.79`、原 SDK 上下文、原 authPrincipal、四个 SDK 存储键和 durable IDB。ProductAuthRoot 在该 SDK 边界隔离旧主体/旧代际的请求和存储写入。退出先写 tombstone，清本机身份与缓存，再等待有限时间的真实服务器撤销；撤销未确认会明确报错。没有新建第二套账号系统或双份 token 主数据。

ProductStartup 区分初始化、恢复、已验证、未登录、可恢复失败与离线。持有字符串 token 不放行共享页面；已验证且未过期身份的离线读取必须主动确认，未知/失效身份没有离线按钮。服务端仍独立校验每次业务权限。原公开分享的 guest 分支保留，未用新门禁代替分享权限。

GitHub 仅 `read:user user:email`；Google 仅 `openid email profile`。现有服务端 SDK 负责 state/PKCE，Google 加 nonce；产品回调严格限制同源完成/桌面路径。provider + stable subject 对应账号，邮箱碰撞拒绝自动合并，未保存 provider access token。**显式关联已有账号尚未实现**，碰撞时需使用原登录方式。

浏览器走服务端回调后 `/auth/complete`，再使用经过验证的内部 return_to（路径/查询/锚点）。桌面主进程只打开自行构造的本机授权地址；系统浏览器要求新鲜提供商证明和显式账号确认。桌面用仅内存持有的随机 secret 领取 5 分钟、一次性授权，服务端原子消费并检查授权者会话仍有效；URL 中没有 bearer 或 claim secret。取消、重放、错误 secret、过期、跨退出迟到响应都有隔离。

实际完成：真实邮箱登录、刷新、三个 A/B/A 退出循环、跨窗口退出、服务器撤销、旧 durable 值/迟到 refresh 不复活身份；实际后端一次领取签发同账号正常会话、重放/过期/取消/撤销拒绝。领取测试只对隔离 TEST 用户注入提供商证明，**该部分是模拟外部验证输入**。provider callback 策略测试使用合成资料验证稳定身份/邮箱碰撞。GitHub 和 Google 的真实控制台注册、授权、取消和端到端回跳均 **未验证**。

最少配置见 [OAUTH.md](../../../integrations/codecast/OAUTH.md)：服务所有者创建 GitHub OAuth App 与 Google **Web application**，向忽略的 `.local/codecast-app/oauth.env` 写四个后端变量：`AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`。准确回调为 `http://127.0.0.1:3409/api/auth/callback/github` 和 `/google`，Google 测试模式加入预期用户。无需把秘密发到聊天或前端。

未来托管配置使用同一 Convex Auth，改为该服务的 HTTPS SITE_URL / CONVEX_SITE_URL 和单独生产 provider client；当前桌面仍严格 loopback，**未部署云端团队服务**。邮箱重置页面已接回原真实 hook，未配置发信服务时明确提示不可用；真实邮件发送未验证。

依据为实际安装 SDK 源码，以及 [Convex OAuth](https://labs.convex.dev/auth/config/oauth)、[Convex callbacks](https://labs.convex.dev/auth/api_reference/server#convexauthconfig)、[GitHub 授权流程](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[Google 服务端 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)。没有把文档支持等同于本机 provider 实测。

## 迁移与兼容

详见 [MIGRATION.md](MIGRATION.md)。旧安装关闭后执行 `npm start`，生成 fork 并兼容扩展原 schema。目录下次注册或授权 upgrade 补 directoryVersion/directoryId；项目编辑或 upgrade 补 identity，保留原始 icon/color 以便追溯。_id、workspaceId、owner/project、事件、授权、备份和 pending outbox 引用保持原值，不扫描新根、不应用同伴文件。

普通外观偏好新键优先，先写新值再标记迁移，原旧值保留；重复执行不覆盖新选择。认证仍原位使用 SDK namespace/IDB，禁止双源恢复。旧 bridge 只作为同一基础 bridge 的单个别名；新的产品 auth/appearance/navigation 调用用版本化 ColloSys 接口。原 profile、数据库和依赖目录均未搬移/清空。剩余第三方包名、`--sol-*` 适配、历史研究名称和脚本路径在 MIGRATION 中逐项分类。

实际新旧数据、重复迁移、跨账号拒绝、退出竞态和迁移中断已测。中断用两条独立 TEST 目录记录触发真实事务第二行失败，确认第一行写入也回滚。偏好写入中断/损坏在纯本机策略测试覆盖，不代表断电/磁盘损坏恢复认证。

## 验证索引与环境

必需命令结果：`npm run typecheck` 通过；`npm test` **69/69**；`npm run build` **1m44s** 通过（原有大 chunk/动态静态混合导入警告保留）；`npm run typecheck:integration` **77 owned 文件**通过；`npm run codecast:verify` **9854 文件/0 failures**。integration 检查针对当前 prepared fork，不是整个第三方所有应用的类型认证。

`npm run cost:audit` 为源码估算：9 个维护任务、52,590 次/月入口估算。不是 provider 遥测，也不是免费额度足够十人的容量证明；没有开启付费订阅。

TEST 账号/独立目录上的实际命令、结果和证据由 [verification-index.json](evidence/verification-index.json) 汇总。主回归命令为 `node tests/product-identity-regression.mjs`，包含项目/主题、生产登录、原生窗口、真实集成、后端恢复、阅读/草稿/交接、存储检查、权限撤销、durable IDB、启动和认证竞态。外部策略单独 bundle 后执行；安全/迁移执行 `node tests/product-identity-security.mjs`。本轮额外原生授权10组、桌面文件夹/字节恢复/关闭重开9组、真实后端重启持久化1组也通过。真实字节恢复仅发生在隔离 TEST 根，原目录/同伴文件/Git index 均作保持检查。

Windows 11 10.0.26200，Intel Core Ultra 5 125H，Node24.15.0；浏览器 Chrome156，默认1440×900 CSS/DPR1。登录另验1920/1440/1280/960/390、浅深两种主题及 reduced-motion。原生 Electron44.3.0 的实际 Windows DPI=200%；测试真正设置 webContents zoom=1.25/1.5，不把浏览器 DPR 冒充原生缩放。OS DPI 未改到125%/150%，多物理显示器/其他系统没有认证。

发现并修复的实际问题：Dialog 关闭焦点未回触发器；并发项目保存后重新加载仍取滞后 props；OAuth SDK 自动 callback 异常导致恢复卡住；退出与 refresh 的迟到写入；根页面漏返回目标；深色强调色预览与实际色不一致。原生 Ctrl+0 首次测试失败是 CDP 绕过 Electron before-input-event 的测试输入方式错误，改用真实 webContents 输入路径后通过，未放宽断言。一次未就绪启动在服务准备阶段退出且没有充分诊断，原因未确认；随后串行启动并完成回归。该记录不把重启恢复写成已定位修复。

## 性能

原实现基线指纹为 `f2a15a9f42a149cc5db8803fa80308d3aa9b92b55c22761fa8eb048af7b00eef`，最终 after 的开发与生产采样都记录了当前 `f613f7df…` 构建标识。文件位于 `evidence/before/{production,development}` 和 `evidence/after/{production,development}`；每份含完整 gzip Chrome trace、原始 EventTiming/长任务/rAF、连续录屏和真实 Diff 截图。中间尝试保留在 `.local/identity-intermediate-evidence`，没有挑选更好的中间分数冒充最终结果。

同机、同 Chrome、1440×900/DPR1、同持久化 TEST 项目，65 条消息、32 文件 Diff。每轮有 1 次首开、11 次重复下拉、8 次侧栏切换、4 次长会话返回、1 次 Diff 首开和6次文件切换；另录侧栏拖动与8次邮箱输入。没有换成空页或删除重内容。最终性能录制期间没有同时跑其他验收；数据库保留了整轮积累的其他 TEST 记录，后台状态/缓存/系统负载不是完全控制的实验变量。

| 观测 | 生产 before → after | 开发 before → after |
| --- | --- | --- |
| 去重交互样本 / p95 | 53 / 120ms → 53 / 160ms | 52 / 152ms → 51 / 144ms |
| 首次下拉，n=1 | 104 → 160ms | 112 → 120ms |
| 重复下拉 p95，n=11 | 40 → 72ms | 56 → 64ms |
| 侧栏切换 p95，n=8 | 64 → 56ms | 64 → 64ms |
| 长会话返回 p95，n=4 | 112 → 168ms | 152 → 144ms |
| 32文件 Diff 首开，n=1 | 208 → 248ms | 280 → 256ms |
| 文件切换 p95 | 48 → 48ms | 56 → 48ms |
| 长任务数量 / 总时长 | 27 / 2778ms → 28 / 3290ms | 43 / 11851ms → 59 / 14245ms |

**没有测出整体改善，生产若干链路反而变慢；约100ms目标未完成。** 原始差结果保留。[performance-comparison.json](evidence/performance-comparison.json) 给出计算方法；样本是每页 interactionId 去重后的最长 EventTiming，阈值16ms，未报告的快事件没有计成零。因此不同动作的有效样本数会不同。每模式只有一组基线与最终完整流程，不能将小样本差异归为某一个代码改动的因果效果。

Trace 中 React 调度/commit 与虚拟列表滚动通知占用明显：最终开发 `performWorkUntilDeadline` 单次最高252.6ms，`@tanstack/react-virtual` 回调最高243.6ms；生产对应 React 调度最高266.6ms、虚拟列表相关回调202.5ms。源码核对发现 captured reader 隐藏 header 时仍更新导航进度 React state，现仅可见 header 更新该状态，原命令式进度条/虚拟列表/消息 key/阅读恢复保留。这个修正移除了一个不必要的更新来源，**并未证明整个长会话重内容挂载已足够快**。没有依据把网络请求、全局订阅或绘制阴影宣称为全部卡顿的唯一原因。inclusive trace 时间有嵌套，不可相加当 CPU 总量。

生产 trace 开启 CPU/screenshot 类别，开发采用 timeline/frame 类别；各自 before/after 类别一致，跨模式不直接比较 trace 开销。自动化动作耗时包含定位、往返、两次 rAF，侧栏另含240ms明确等待，不能当首次物理显示反馈；邮箱 `.fill()` 记录说明动画期间输入可用，不是逐键输入延迟基准。headless rAF 不证明原生显示60fps。原生连续动画/真实键盘逐键时延仍未测。

## 未完成与限制

- GitHub / Google 的真实端到端和真实邮箱发信等待所有者提供配置；已有账号的显式 provider 关联尚未实现。
- 约100ms所有重链路目标尚未达成，不宣称全平台60fps。标题栏指针拖动因 OS 拒绝前台切换而未验证（测试已停止输入，失败记录保留）；系统 DPI 切换、多物理显示器和穷举可访问性未认证。
- 本机真实持久化/加密备份不等于异地灾备；没有公共部署、安装包、自动更新或全框架独立重写。
- 功能证据和视觉验收分别成立；没有用测试数量宣布用户审美通过。
