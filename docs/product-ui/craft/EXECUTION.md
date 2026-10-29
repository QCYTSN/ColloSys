# ColloSys 视觉品质与交互连续性执行账本

发布授权更新：2026-10-29用户明确要求“先推送提交”，授权将本轮源码与证据提交并推送到 `QCYTSN/ColloSys` 的 `codex/product-ui`。下文“未提交/未推送”是实施与取证阶段的记录；本次授权不代表审美批准、合并main或公开部署应用。已核对当前构建输入仍与验收指纹一致。

基线：`codex/product-ui` / `98dd71924f0fe78c90ac6a10360282881d55f269`，开始时工作区干净。正常入口 `npm start`，Windows 独立窗口，原 Convex/store/connector、Google Sans、花生资产与 AgentTypeIcon 保留。本轮未提交、推送或部署，不使用本地 skills。

本轮的新基线保存在 `evidence/baseline/after`（该 `after` 是原测试脚本的输出目录名，内容是本轮修改前）。使用现有隔离 TEST 项目、真实持久化数据、Chrome 1440×900；原 11 组 refinement 操作已重新运行，未拿上一轮文件冒充新采集。桌面及补充状态证据随后独立记录。生成 fork 不是真源。

## 决策与证据口径

视觉方向候选：中性内容面、稳定的结构边界、可读的元信息、小范围紫色选择标记、深色主操作。压缩项目范围层的重复空间，让内容先出现；项目索引与概览按实际可读宽度分配；认证围绕软件身份、表单与恢复路径组织，不再用大口号/重复标志占据半屏。暂时工具采用实色表面与短阴影，正文不模糊。不同动作分别验证，技术通过不等于视觉批准。

问题状态仅使用：未核实、已复现、已修改未验、已验证、受阻、确实不适用。静态风险不冒充实际应用复现。

| ID / 状态 | 现象 / 期望 | 证据等级 / 触发条件 | 当前源码位置 | 根因 | 处理 | 回归 | 剩余限制 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V1 / 已验证 | 活动主体偏弱，顶部空间和细线分散注意力 | 视觉判断；新基线03-activity | product-shell.css、product-ui.css、LocalWorkspaces | 项目头84px、较小列表角色、重复边界组合 | 66px范围头、32px内容轴、明确文字/表面角色；认证重组 | [11页对照](REVIEW.html)、refinement/after 与 native 实际截图 | 已验证应用与尺寸，用户审美未批准 |
| K1 / 已验证 | 正常关闭不应等于撤权 | 初始静态风险；正式应用分别测试关闭和真正撤权 | useProductQuery、ProjectHandoffs、DetailSplitLayout patch | skip 纳入 denied | 拆分 idle/loading/valid/transient-error/access-denied | [关闭/重开](evidence/continuity/results.json)、[真实撤权/换号](evidence/access/results.json) | 不把静态风险改称修改前必现Bug |
| K2 / 已验证 | 概览短暂失败保留已成功内容 | 正式页面故障注入；已有数据后查询503 | ProductProjects:ProjectOverview | 任意 error 提前返回整块错误 | 按拒绝/无缓存/可重试分开处理 | [continuity](evidence/continuity/results.json)：成功区块保留、重试恢复 | 503是明确的测试注入，不是生产事故 |
| K3 / 已验证 | 确认绑定确切参数与对象 | 正式TEST操作及inspect响应注入；审阅A后改B/失效 | DirectoryStorage、storage-api、retention.ts | operation只存kind；清理按执行时状态重算范围 | 不可变审阅参数、对象失效拒绝、运行锁定、清理摘要在串行区验证 | [存储12组](evidence/completion/native/results.json)、[失效/路径变更](evidence/storage-review/results.json)、storage.test.ts范围变化拒绝 | TEST目录；旧客户端可不传摘要，当前UI始终传递 |
| K4 / 已验证 | 回包不清除新草稿 | 正式TEST交接；延迟实际mutation回包，真撤权/再授权 | ProjectHandoffs:submit | busy仍可编辑；URL新来源绕开锁定；finally曾受denied阻断 | 字段锁定、epoch/inFlight/草稿版本、mounted清理busy | [新URL来源](evidence/continuity/results.json)、[迟到回包与再授权](evidence/late-reply/results.json)、[原交接6组](evidence/handoffs/results.json) | 仅同会话内草稿连续性，不承诺关闭应用后草稿恢复 |
| K5 / 已验证 | 初始化失败可明确退出重登 | 正式恢复路由；已有本地有效身份 | ProductLoader:SlowBootNote、ProductAuth、boot.mjs | /login 被本地身份自动重定向 | recover模式，provider内完整durable sign-out | [恢复/刷新](evidence/continuity/results.json)、[多窗口认证](evidence/auth/results.json)、[持久化6组](evidence/auth/storage-results.json) | 静态fallback仍只提供链接，不调用auth hook |
| K6 / 已验证 | 局部标题、焦点和错误样式实际生效 | 基线及修改后computed；真实错误/焦点 | product-ui.css / product-completion.css | 全局h1/h2/input和父级p规则压过组件 | 低优先级:where基础层、真实reader类、局部错误样式 | [基线数值](evidence/baseline/extra/auth-computed.json)、[最终对比度](evidence/visual/results.json) | 样本检查不是全应用无障碍认证 |
| M1 / 已验证 | 动画完成与卸载使用同一契约 | 初始静态维护风险；正式应用650ms覆盖与cancel | useProductPresence、craft-patches | JS和CSS重复180ms，修改前数值一致 | 真实surface动画完成/取消决定卸载，快速重开取消旧清理 | [中间帧、取消、reduced](evidence/continuity/results.json)、[原生设置](evidence/completion/native-surfaces/results.json) | 未声称修改前已有时长错配；不报告FPS |
| M2 / 已验证 | A→B只反馈变化身份，不重建列表 | 正式详情实测发现没有命中h3所在容器 | craft-patches:DetailSplitLayout | selector漏掉collo-review-heading | 命中实际review/reader标题；不新增业务key | [实际A→B与reduced返回](evidence/detail-continuity/results.json)：surface/list为同一节点，只有标题140ms | 既有业务key与分页机制保留；网络等待不靠动画遮掩 |
| M3 / 已验证 | 提示按所属表面叠放 | 原生菜单与隔离真实组件契约分别测试 | ProductTooltip、product-shell | 单一提示层不能同时服务下层页面与菜单内部 | 页面140/设置160/弹窗205/菜单内220，菜单210 | [实际菜单](evidence/completion/native-surfaces/results.json)、[组件契约](evidence/tooltip-contract/results.json) | 隔离组件图不冒充完整产品页 |
| M4 / 已验证 | 程序开合两侧同步，拖动即时 | 正式页面31帧宽度采样、原生两侧极限 | productPanelMotion、DashboardLayout patch | 原左轨动画与主区不共时，偏好回显容易重复播放 | 同组轨道共同过渡；拖动/resize/减少动态取消 | [宽度采样](evidence/continuity/results.json)、[原生四宽度](evidence/completion/native-surfaces/overflow.json) | Windows200%显示缩放；未测多显示器 |
| N1 / 已验证 | 可达产品名与反馈统一 | 正式可达分享页、页面标题、桌面窗口 | browserPane、SharedObjectPage、ProductCopyLink | 原分享身份/外链、复制未等待成功 | 精确owned patch，成功才反馈Copied，失败可手动复制 | [实际分享](evidence/visual/results.json)、[原生标题](evidence/refinement/native/window.json) | 原生标题此前已正确；保留合法来源与兼容项 |
| T1 / 已验证 | 溢出审计可发现真实反例 | 隔离3个故意错误与正式长内容审计 | tests/product-ui-overflow.mjs | ellipsis提前跳过；只横向和固定标签 | 几何/可达性与全部文本Range分离 | [反例](evidence/counterexamples/results.json)、[实际长内容](evidence/completion/native/overflow.json) | 代码横滚/虚拟项及合法title逐项登记，未给ellipsis豁免几何 |

## 参考映射（同一张表持续更新）

OpenDesign 源码固定 `6bf7fa79120f9da261be43a71d7ec1a28c2b2ef9`，本地研究checkout HEAD不同，使用 `git show` 读取指定对象。官网 [open-design.ai](https://open-design.ai/) 于2026-10-28读取，只作可见产品展示参考，不把生成作品当控件。Codecast pin不变。以下均为实际阅读的参考，未运行完整OpenDesign/DSH应用。

| 参考画面/代码 | 可观察处理 | ColloSys区域 | 采用 / 舍弃理由 | 实现 / 证据 |
| --- | --- | --- | --- | --- |
| OpenDesign tokens.css / shell.css | 结构面、正文、选择与动作分工；范围信息收进真实工作层 | 外壳、项目、认证 | 采用角色关系，不复制绿色品牌或营销构图 | productTheme及CSS语义桥；REVIEW活动/项目/认证同数据对照 |
| OpenDesign material.css | 统一scrim与浮层，实色降级 | 设置、菜单、Dialog | 当前密集内容上的94%透明收益不足，默认实色、有限阴影 | product-shell浮层；refinement/after/06-settings及project-properties |
| OpenDesign project-split-layout.ts | 首次/最终几何共用输入，偏好与约束分开 | 原Panel分栏与boot | 保留成熟Panel，采用几何责任边界 | surfaces静态→React采样、native-surfaces四宽度拖动 |
| OpenDesign AnchoredMenuShell.tsx/module.css / useAnchoredPopover.ts | 锚点、翻转、层级属于整体系统 | 原Radix menu/popover | 保留Radix，处理下层hint与菜单内hint不同上下文 | ProductTooltip；M3正式菜单+隔离契约，不复制源码 |
| Codecast ConversationView / FileDiffLayout / Button（原pin） | 阅读意图、文件行定位、控件状态已有真实实现 | 阅读、审查与全局控件 | 保留行为；修cyan变体同时覆盖背景和文字 | refinement长会话消息锚点、32文件返回；visual深浅实际Save按钮 |
| DSH columns.ts / AppFrame.tsx/module.css / stores.ts（下文固定SHA） | 实际容器测量、主区最小宽、右轨让位、拖动即时 | 左右轨与主内容 | 不替换当前Panel库；不采用手动关闭重置偏好的策略 | productPanelMotion；continuity31帧和原生拖动/reduced |
| DSH use-chat-scroll.ts / use-scroll-follow.ts | 自动跟随依赖阅读意图，用户滚动可打断 | ConversationView、长会话返回 | 用作验收原则，不另建滚动事实源；保留原分页机制 | refinement消息锚点与返回偏移验证 |
| Claude官方Desktop及Projects redesigned；Codex官方介绍/Features | 可见项目/会话/审查分工，窄窗口先保障阅读 | 项目范围头、内容与辅助轨 | 局部空间关系；不推断闭源DOM或复制概念卡片比例 | 活动首屏66px范围头、项目概览min300px；官方URL/日期见下文 |

## 命名分类

N1：产品可见文案与document.title精确处理。N2：owned组件使用产品语义，旧sol/cc变体集中适配。N3：codecast-theme、auth IDB、IPC、appId/userData保留兼容，不迁移格式与身份。N4：固定镜像、@codecast依赖、许可证/来源及真实Agent标志保留。可达和死分支逐项复核后补证据。

## 实际验证与限制

所有破坏性验证仅隔离TEST目录。未运行完整OpenDesign/DSH应用，不假称闭源Claude/Codex内部实现；没有测量FPS、外网容量或多物理显示器。

### 本轮实现与当前验证进度

正式入口仍为 `npm start`，交付版本为同一不可变 Codecast pin + 156 处明确 patch，构建输入指纹 `39971719174bae017d27fdd466c7a07991dc1da943644d716829f6f4d4ab10e8`。没有另建业务页面替身、没有切换认证/Convex/store，也没有提交或推送。正常启动后再次准备的manifest与dist指纹一致。

同内容前后对照的视觉冻结构建是 `b070ccc0fedaebe50fd06aa1d1291f5a0419f43935ec0bde94680d7e8cd01be2`：对应 `refinement/after`。最终构建仅补上M2遗漏的 `.collo-review-heading` 动效目标，静态CSS/DOM/字体未变；其A→B专项、continuity与原生refinement/surfaces另行重跑，不把先前截图标成这次重跑。后续原生写入测试增加了TEST项目和活动，因此保留已冻结的同内容对照，最终原生录像另列。

- 视觉：项目范围头由84px减为66px，活动标题区和筛选区共用32px内容轴；活动主题15px、来源12px，明确保留页面标题600字重。项目概览获得至少300px阅读宽度，窄容器转为上下排列。主工作面实色，工具面与应用底面分工，浮层取消无收益的背景模糊。登录从近半屏大口号改为456px表单面与58px产品身份栏，保留同一Google Sans、花生资产和认证行为。
- 语义：`productTheme.ts` 仍是既有主题协议的适配点；`product-ui.css` 集中桥接旧sol变量，owned样式改用content/tool/ink/secondary/action等角色。共享Button的旧cyan变体同时修正fill与label消费者，避免只改背景仍留下固定base03文字。功能图标适配按strokeWidth映射light/regular/bold；absoluteStrokeWidth不支持逐像素等价，这属于兼容差异，不宣称完整保留Lucide绘制参数。
- K1/K2：skip单独为idle；同身份同参数的暂时失败可保留成功内容，明确拒绝立即清除。真实概览查询的503故障注入后，成员、目录、标题仍可见，重试恢复。
- K3：审阅快照绑定策略、检查点、备份ID、导出路径和清理摘要；改变策略/检查点撤销审阅，导出路径改变撤销勾选；执行期间锁定参数。清理摘要在connector串行区内重新核对，包含检查点与过期预览/恢复副本。失效对象不会自动改为其他检查点。服务端单元实测过期范围变化时不删除任何已审阅对象。口令只在当前组件状态，执行/退出清除，不进入快照或持久化store。
- K4：表单锁定并增加同步inFlight守卫；草稿版本同时覆盖URL新来源，旧成功回包不清新版本。回包内容需仍有权限，非敏感busy清理只需同epoch且仍挂载，避免撤权期间回包留下永久锁定。
- K5：静态HTML和React慢启动恢复入口使用明确的recover模式；recover页面在认证provider内提供重试与完整durable sign-out，不在provider外调用认证hook。已有本地身份时可停留该页，退出后刷新仍保持退出。
- K6：低优先级基础标题规则。基线实际认证标题为48.96px/600/-1.224px；本轮新标题为28px/500/-0.84px，记录在baseline/extra/auth-computed.json和continuity/results.json。两者是不同构图，数值不作为审美分数。
- M1：真实surface的Web Animations完成/取消决定卸载；测试把退出CSS改为650ms，240ms仍保留退出节点，快速重开700ms后仍可见，取消和reduced motion均完成退出。真正撤权仍走同步安全清除。左右分栏在同组的两个flex轨道使用共同过渡；31帧样本证实有中间宽度且总宽差恒定，未测FPS。
- T1：重写审计先查几何再判断省略，包括垂直裁切和全部文本节点的Range。三个已知反例均检出，真实完整title可作为文字省略入口但不豁免控件几何。新检查发现会话所有者缺少完整名称入口，已补title并重跑完整12组交互。

本轮实际结果逐项见下方验证矩阵和 `evidence/verification.json`。root typecheck、65/65 root测试、稳定prepared fork 58文件类型检查、9854文件/0失败源镜像检查均已通过。最终构建1分21秒，保留上游大chunk与shortcut循环依赖提示。验收数字不代表用户已批准审美。

验证过程也保留了实际失败原因：第一轮新增patch字符串转义错误、重复React key、清理过期预览从JSON而非SQLite主键取ID，均在验证中修正。类型检查曾与准备脚本重写fork并行，读到临时未打patch的上游签名；最终在启动准备结束、fork稳定后单独运行通过。后续计算样式还发现全局input覆盖了焦点边框、auth辅助p覆盖了错误色，分别降低基础规则优先级修复；焦点边框4.76:1、错误样本4.51:1，真实深浅Save按钮也通过。

最终refinement测试原先点击已删除的Workspace静态标签，改为点击真实topbar空白处，保留菜单关闭断言。原生验收在重开后的完整页面导航被真实待同步离开框拦住；测试对这次隔离导航明确选择Close now，独立下一组仍分别验证Keep open和Close now，产品保护未关闭。tooltip隔离支架使用实际dialog类时继承了固定高度/translate，修正支架几何；第一下Escape关闭hint、第二下关闭menu，两层断言都保留。M2实测发现真实h3标题容器未命中，补selector后重新验证，而非仅以存在140ms代码判通过。

### 命名分类的实际边界

| 分类 | 文件/用途与读写双方 | 处理/迁移风险 | 当前证据 |
| --- | --- | --- | --- |
| N1 可见身份 | browserPane.appDocumentTitle → Dashboard document.title；ShareControl → /share/project/:token → SharedObjectPage；ProductLoader/HTML启动、ProductAuth、About、desktop/main | 标题和真实可达分享页改ColloSys及花生图；分享页移除原站外链、原营销句、固定青色底材。原生窗口主进程此前已固定ColloSys，不重复报为旧缺陷 | visual实际分享路由、native-flow/About与window证据 |
| N2 展示语义 | productTheme → ThemeProvider/旧Tailwind消费者；product-ui角色桥 → owned CSS；Button variant → button.css | 保留旧调用契约，集中转换产品动作/选中/文字；同时移除cyan固定label色，避免每页特判 | visual/results实际文字、选中、错误、聚焦与深浅按钮对比度 |
| N3 兼容字段 | codecast-theme由静态boot与ThemeProvider共同读取；__convexAuth与durable IDB由平台认证双写/清理；__CODECAST_ELECTRON__、codecast-navigate、__CODECAST_NEW_SESSION由原生主进程/preload/renderer读取 | 全部保留。本轮无appId/userData、加密格式、业务schema或IPC迁移；修改恢复入口复用现有完整sign-out | auth多窗口3+IDB6；native-desktop9；不把内部文件名当可见品牌 |
| N4 合法来源 | third_party只读镜像、@codecast依赖、THIRD_PARTY_NOTICES、About attribution、AgentTypeIcon/BrandIcons | 原pin与声明保留，第三方Agent标志不替换成通用终端 | 9854文件完整性检查0失败 |
| 静态死分支 | UserMenu旧codecast.sh环境跳转；已从ALL_SECTIONS移除的CLI/daemon/harness/macOS设置 | 当前正式入口不渲染，不夸大为实际用户界面缺陷；保留在参考和兼容代码中 | materialized菜单与fallback调用链检查，未宣称全仓无Codecast |

### 动作契约

| 动作 | 即时/变化区域与结果 | 保留/焦点 | 中断、失败、减少动态效果 |
| --- | --- | --- | --- |
| 选择项目或详情A→B | 选中立即改变；仅详情身份标题短淡入，正文不整块闪烁；数据继续用原查询 | 业务子树不为了动画新增key；原列表和阅读store保留 | 重选取消上一动画；减少动态效果直接最终态 |
| 详情打开/返回 | 详情surface进入；返回先使退出层inert，等真实动画结束再清理 | 列表仍挂载、原位置保留；焦点归还触发控件 | 快速重开取消旧清理；撤权/换号立即清除，无延迟 |
| 左/右面板开合 | 同一组两条flex轨道同步变化；首次布局不播放 | 原宽度偏好和业务store保留 | pointerdown/窗口resize取消过渡，连续拖动即时；减少动态效果直接变化 |
| Settings/菜单/Dialog | 原Radix锚点/翻转/碰撞机制；实色工具面与短阴影；进入退出成对 | 原焦点陷阱及返回；设置section沿既有路由 | 快速开关和Escape；提示按所属层140/160/205/220，菜单210；没有无限提高z-index |
| 交接提交 | 按下立即发请求，保留按钮宽度、显示Sending、锁定已提交字段 | 重试保留draft/requestId；新URL来源有独立版本 | 失败不清草稿；失效身份回包不回填；busy清理不依赖是否仍有访问权 |
| 存储审阅/执行 | 对象和参数有可读摘要，精确动作按钮；结果来自服务端；复制路径在clipboard成功后反馈 | 当前目录key隔离；执行前修改必须重审 | 确认失效拒绝；失败保留恢复路径；密码执行后清除；不用动画等待请求 |
| 长内容/刷新 | 不逐条延迟入场；现有分页/虚拟化和阅读意图继续工作 | 原文件选择、行位置和消息锚点 | 暂时失败只标记受影响查询；确认撤权才清除 |

### 参考补充（对应上面的唯一参考映射表）

DSH访问2026-10-28 14:04–14:21 UTC，`deepseek-ai/deepseek-harness`固定`f3803c96974ad4a94195fb97e5c637e9c2a3afe3`（0.2.2-alpha.2，提交2026-10-27T18:17:58Z）。实际阅读packages/client/ui-layout/src/client/{columns.ts,AppFrame.tsx,AppFrame.module.css,stores.ts}以及ui-chat/src/client/chat/{use-chat-scroll.ts,use-scroll-follow.ts}。采用容器测量、程序开合与连续拖动分开、偏好和响应式让位分开；不复制其手动关闭重置默认宽度的策略，也不替换当前Panel库。阅读侧采用尊重follow意图、用户打断和历史锚点的验收原则。

Claude仅官方可见资料：[Desktop文档](https://code.claude.com/docs/en/desktop)、[产品页](https://claude.com/product/claude-code)、2026-09-17 [Projects redesigned](https://claude.com/resources/articles/projects-redesigned)。窄窗口次要操作收进菜单、聊天宽度足够才出现详情，作为空间优先级参考；文档v1.2581.0+不是本次实测客户端版本。Codex仅[2026-02-02产品说明](https://openai.com/index/introducing-the-codex-app/)与[Features文档](https://learn.chatgpt.com/docs/features)的可见展示，参考项目/线程/代码审查分工，不推断闭源DOM或token。不把营销概念图当密集工作台几何依据。

## 最终验证矩阵

以下均为本轮实际运行结果。测试源码位于仓库tests；[汇总JSON](evidence/verification.json)链接每份结果。[工程日志](evidence/engineering)保留实际构建、类型、65项测试及镜像检查，不含认证凭据。各组不合并成一个“产品完成百分比”。

| 验证 | 结果 | 证据与边界 |
| --- | --- | --- |
| npm run typecheck / npm test | 通过 / 65通过0失败 | root业务代码；新增清理摘要变化拒绝与原恢复/备份保护 |
| npm run build / npm run typecheck:integration | 通过 / 58 owned文件通过 | 最终3997171输入；原上游类型，非全上游项目typecheck；大chunk/shortcut依赖提示保留 |
| npm run codecast:verify | 9854文件，0失败 | 固定镜像与原platform保持不变 |
| refinement 浏览器 / Windows | 11 / 11通过 | 配对静态图为b070ccc；最终Windows录像和结果为3997171；长会话、32文件选择/返回、设置、四尺寸、深浅与reduced |
| completion 浏览器 / Windows | 12 / 12通过 | 真实存储策略、pin、清理、加密备份、恢复副本、导出、删除、独立restore preview；只写TEST目录 |
| surfaces 浏览器 / Windows | 7 / 4通过 | 浏览器额外验证static→React、注册/错误；原生四尺寸、侧栏极限、右轨、菜单、125%缩放、深色/reduced |
| continuity / detail A→B | 7 / 1通过 | 最终构建；真实查询503注入、慢回包、新来源、650ms退出/取消、31帧分栏；实际checkpoint标题命中 |
| handoffs / late reply | 6 / 1通过 | 原交接权限/来源/失败与真实成员撤销期间回包、再授权可编辑 |
| access / multi-window auth / durable storage | 3 / 3 / 6通过 | 真撤权、换号、双窗口logout/reload及IDB延迟竞态；保留原认证事实源 |
| storage review race | 2通过 | inspect响应中移除审阅A、导出路径变更；未执行错误目标或修改源目录 |
| computed/可达分享 / tooltip契约 | 3 / 1通过 | 实际对比度、中文fallback、复制成功/拒绝；tooltip是隔离真实组件，正式菜单另有原生证据 |
| 溢出反例 | 3错误均检出，合法title例通过 | ellipsis控件越界、垂直裁切、长span；真实页面长文审计另存overflow.json |
| 原本地backend / restart | 10 / 1通过 | [结果](evidence/backend/result.json)、[重启](evidence/backend/restart-result.json)；含24MiB流、并发配额/删除/撤权、加密与真实持久化 |
| 原生UI工作流 / 原生文件系统验收 | 7 / 9通过 | [流程](evidence/native-flow/results.json)、[桌面](evidence/native-desktop/results.json)；真实OS目录框、确认恢复实际字节、队友文件不变、重开、深链接和两种退出选择 |

### 环境与证据阅读

本轮实施和采集于2026-10-28，收尾跨至2026-10-29（Asia/Shanghai）。配对浏览器截图为实际Chrome、CSS1440×900；其四尺寸测试为1440×900、1280×800、1920×1080、960×720。Windows是实际Electron 44.3.0 / Chromium 152.0.7977.78，显示缩放200%，zoomFactor1时DPR2。Win32窗口尺寸换算实际记录到1441×901等1px差异，未将请求的1440×900冒充精确物理像素。

真实Electron zoomFactor1.25时CSS视口1153×721、DPR2.5，Windows显示缩放仍为2。逐次真实值见 [environment.json](evidence/completion/native-surfaces/environment.json)。浏览器的CSS zoom模拟另标，不冒充物理显示器切换。实际英文使用本地Google Sans，中文标题使用Microsoft YaHei UI fallback；CDP字体记录与最终computed值在visual/refinement/auth证据中。

[对照页](REVIEW.html)提供11组原尺寸图片、滑动对照与遮住标志看结构的开关。原图未覆写，遮挡只发生在查看器。目视复核包含活动、项目、认证、设置、密集Diff、深色及原生窗口；遮住标志后仍可看到范围头、内容轴、项目概览、表单/浮层比例的变化，但不能据此宣布已达到独有品牌语言。

最终连续性录像43.32秒、最终原生refinement录像60.84秒，分辨率均1440×900。[查看器校验](evidence/review-check/results.json)验证11组图片全部存在、链接可读、控件可用、录像可解码；从原生录像另取实际帧复核。录像包含页面加载、按下、设置关闭/重开、会话和Diff返回、表单与尺寸切换；帧取样不是FPS测量。650ms退出属于测试覆盖，不是默认产品时长。

中间失败的截图/JSON移至 `evidence/iterations` 留档，修复后的结果单独保存，不删除断言。两轮最终构建的差异和各证据时间已在前文说明；没有把旧素材标成最终重新采集。

### 尚未完成或不在本轮证明范围

视觉方案仍是待用户认可的候选：需要判断活动密度、主操作强度、表面边界及认证构图是否真正达到期望，不能由本账本自评分替代。默认账号保持原状态，TEST数据只在测试账号；正常 `npm start` 窗口已打开，3407–3411全部loopback。

本轮未新增邮件/OAuth/密码重置服务、远程模型执行、其他Agent捕获适配器或检查点逐行评论。真实Agent图标不意味着新适配能力；同机加密副本不等于异机灾备；页面filter不等于全文搜索。安装器/更新器、跨平台、多物理显示器、全量隐藏上游管理入口与完整无障碍认证、公共云容量仍未验。没有费用、邀请、公开部署、提交或推送。
