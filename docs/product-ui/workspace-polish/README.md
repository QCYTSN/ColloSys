# 工作区性能、连续性与精修 · 2026-10-31

本轮以 d28c94e9c18eeec05c7324d326de1746ee08d14b / codex/product-ui 为起点；开始时工作区干净。正常 `npm start` 已实际启动原生窗口。运行资源与 owned 源码指纹均为 `5fb3d306dd4c61493bafda0cbd0b3a0c4224a4df97a29af914b38262596b92d9`；沿用的构建元数据仍记录构建时的父提交 6f9c577，不能将该字段误称为当前 HEAD。

只读原生默认 profile 核对：浅色 / Iris、侧栏17.596%、zoom1、Windows scale / DPR2。元数据见 [actual-profile.json](evidence/actual-profile.json)。生产性能对照为相同隔离 TEST 账号、项目、200任务、65消息（加载三页60条后返回）、32文件，1440×900 / DPR1；原生布局另用实际 DPR2。没有修改用户外观或业务数据。

登录与 OAuth 按用户安排留到收尾。本轮仅用现有密码登录进入 TEST 工作区，不扩展登录实现或验收。

## 当前 trace 的三个成本入口

先采集当前完整生产路径，再下钻 CPU 栈；下列为诊断样本，不替代最终三轮对照。350ms输入窗口的采样叶节点权重与包含子调用的时间片不可相加。

| 真实入口 | 主要调用与观察 | 触发原因 | 本轮处理与验证 |
| --- | --- | --- | --- |
| Project details 项目头属性浮层 | Radix Presence读取animationName约24ms采样；首次click58.8ms，UpdateLayoutTree19.5ms | 新挂载浮层/嵌套触发器的样式读取与工作面布局耦合；没有发现该点击加载大型模块的证据 | 在已有菜单边界约束布局，不增加启动时全应用预加载；保留原浮层键盘、写入与焦点行为，独立测冷/热操作 |
| 已访问长会话返回 | 早期诊断中同步focus约22ms采样；第二次诊断发现时间线sticky检查约20ms重复几何读取 | 详情提交中焦点迁移强制布局；重新挂载重播分页；默认空commits/PR数组使未变时间线重复派生 | 将焦点迁移放到子布局提交后；当前项目最多保留两个实时授权阅读器，隐藏时停用快捷键/跟随；稳定默认输入引用。正文就绪必须匹配可见消息ID |
| 32文件检查点Diff | 面板注册按offsetLeft排序约34–40ms采样；JS正则高亮首轮约200ms提交，WASM候选降至约107ms | 初次语言、高亮器与布局准备叠在首次挂载；初始未知宽度还会改变布局分支 | 从可见授权历史准备首文件语言；沿用既有renderer加载门；选择库内WASM引擎；以实际容器宽度初始化、约束文件阅读面布局。分开测选中、导航与当前文件Shadow DOM真实代码 |

## 验证记录

复用现有 `product-menu-heavy-performance.mjs --workspace`、菜单与汇总脚本；加强对象身份、真实正文/Shadow DOM差异就绪判定，保留原始EventTiming。分段测量不与历史宽松探针混为前后对照。构建与其他测试不在正式性能采样时运行。

本轮基线已保存：项目属性冷反馈三次最高79.3ms、热P9527.9ms；会话返回反馈P9547.5ms，但正确锚点正文P95334.2ms；Diff冷首真实内容最高486.4ms，切文件P9520.7ms。此基线等待真实退出后再返回，不能用早期“退出动画未完即重开”的诊断值代替。

连续性实现还包括：每文件行号按检查点/原始路径保存；切模式、缩放及返回恢复行；缩窄后恢复先前的宽屏文件树选择；真实目录历史直接打开共享Diff；任务文字草稿受实时任务查询与身份epoch约束；活动成员过滤保存在现有视图状态。复制路径和评论操作复用32/36px共享控件。展开代码时发现外壳`overflow:hidden`会被焦点/scrollIntoView横向卷走，改在原DashboardLayout调用处使用`overflow:clip`，正文与代码仍在自己的区域滚动。

现有捕获适配器只导入用户/助手文本，不导入工具调用事件；本轮以真实捕获Markdown代码的展开进行验证。捕获阅读器是只读，未伪造其中的评论输入；未发送评论在现有任务评论入口验证，交接草稿在现有交接入口验证。尚未发送的图片附件不新增跨页面持久化承诺。

## 操作与视觉验收

本轮在实际操作中另外修正了两处连续性问题：项目任务的关闭/Esc和看板卡片原先跳到全局任务页；没有任务标签的详情链接还会卸载底下的项目任务列表。现在任务详情保持项目任务标签，关闭回到同一项目，非默认All、Assignee分组、Title排序和Board视图均保留。960px截图暴露的长标题遮住属性按钮来自产品CSS覆盖了原有标题省略；移除该覆盖后，标题在自己的轴内省略并保留全文tooltip，编辑输入也限制在标题列。

| 实际流程 | 已核对行为 | 可查看材料 |
| --- | --- | --- |
| 团队活动 → 会话 → 文件 → 返回 | 成员过滤、当前项目、会话身份和已加载范围保留；A→B→A保留代码展开；65条消息逐页可达 | [完整录屏](evidence/continuity/activity-session-file-return.webm)、[展开代码](evidence/continuity/session-expanded-iris.png) |
| 目录历史 → 检查点 → Diff → 另一文件 → 返回 | 真实32文件；同名不同路径、复制原始路径、逐文件行号、统一/并排、四种宽度；回到历史后重开正确检查点 | [完整录屏](evidence/continuity/history-diff-file-return.webm)、[960px](evidence/continuity/diff-960-iris.png)、[1920px](evidence/continuity/diff-1920-iris.png) |
| 任务列表 → 详情 → 评论 → 返回 | 未发送文字跨关闭/重开保留；发送结果由真实后端查询确认；关闭和键盘返回都留在项目 | [评论保存](evidence/continuity/task-comment-persisted.png) |
| 过滤/分组/排序 → Board → 详情 → 返回 | 非默认All、Assignee、Title与Board保留；Project details的Planning/Active写入实际项目状态 | [流程与computed styles](evidence/continuity/results.json)、[属性浮层](evidence/continuity/project-details-iris.png) |

真实延迟测试拦住会话A的服务端消息，先选择B，再按原顺序放行Convex消息：最后仍只显示B。文件快速A→B→C也核对当前路径和真实代码，测试不强制点击。二进制、超限差异和排除内容分别显示原因；当前协议对重命名呈现删除旧路径/新增新路径，没有宣称存在独立rename状态。

复制路径和项目属性为32px、13/18、500字重、8px圆角；评论发送为36px、14/20、500、8px圆角；文件行32px、14/20。实际字体为Google Sans/Noto Sans SC。文件选择取消重复左强调线，路径与代码保留各自的阅读区域，标题和控件之间留出稳定边界。以上尺寸/字体由最终computed styles断言，并非只看CSS声明。截图在有限动效结束后拍摄；录屏保留中间状态。

[原生真实Iris/DPR2](evidence/native/native-actual-iris-dpr2.png)、[浅色Forest](evidence/continuity/project-details-light-forest.png)、[深色Iris](evidence/continuity/project-details-dark-iris.png)分别核对。原生窗口实际zoom100/125/150/200通过；浏览器1440×900、1280×800、960×720、1920×900检查逐文件锚点及标题内部边界。没有把CSS zoom当原生缩放，也没有改动实际用户profile。

视觉结论仅限已查看的当前工作区状态：长标题不再盖住操作，代码展开不再卷走外壳，文件/评论操作沿用既有角色。它不代表用户审美批准，也不代表每个历史页面都在本轮重新验收。

## 验证与当前状态

功能验收结果：[四条流程13项](evidence/continuity/results.json)、[真实撤权/恢复/换号](evidence/access/results.json)、[菜单](evidence/menus/results.json)、[临时错误与交接/恢复保护](evidence/transient/results.json)、[检查点切换和reduced motion](evidence/detail/results.json)、[原生缩放](evidence/native/results.json)。撤权立即移除阅读器、交接草稿和任务文字草稿；同身份临时失败保留有效区块并可重试。恢复确认、源目录与协议没有为展示层改造而放宽。

当前HEAD仍为`d28c94e9c18eeec05c7324d326de1746ee08d14b`，分支`codex/product-ui`，本轮未提交/推送。最终owned源码、prepared manifest和运行生产资源指纹为`5711822e23746f30813c47f2330f499897d61770d89f0aa94084585505e860c2`，dirty=true。225个显式准备变化；9854个不可变上游文件校验零失败。没有用生成目录作为修改源。

必要检查通过：`npm run typecheck`、`npm test`70/70、`npm run build`（最终1m17s，保留既有上游循环导入/大chunk警告）、`npm run typecheck:integration`（最终prepared fork，89个owned文件）、不可变来源校验。根目录检查在最后UI修正前运行，所测根目录模块没有随后变更；最终UI由上述89文件检查、生产构建及实际流程回归覆盖。这不是完整上游全项目的类型检查。

正式入口为仓库根目录`npm start`，启动独立桌面窗口。`npm run dev`是单独的浏览器调试入口。实际运行与证据索引见[verification-index.json](evidence/verification-index.json)。登录与OAuth按用户安排留到收尾。

最终正常`npm start`已启动并保持打开：ColloSys原生窗口响应正常、Windows handle非零，3407–3411均仅监听127.0.0.1，见[正常入口核对](evidence/normal-start.json)。未拍摄默认profile中的业务内容。[证据检查](evidence/evidence-audit.json)覆盖文本/压缩trace中的已配置后端秘密、当前本地配对值和JWT格式，以及文档引用；无发现。该检查不宣称识别任意未知秘密或对录屏做OCR。`git diff --check`通过。

## 本轮三轮生产性能对照

三次独立Chrome进程，固定同一TEST数据、1440×900、DPR1、浅色Iris；未同时运行构建/其他测试。冷首次每轮一次；Project details热操作33次、会话往返12次、文件切换30次；Active/Display各30次热操作。冷进程仍保留操作系统文件缓存，没有声称清空OS缓存。Active/Display本轮仅做最终回归，不把历史报告充作本轮配对基线。

| 操作 | 首反馈：本轮基线 → 最终 ms | 正确内容：本轮基线 → 最终 ms | EventTiming P95：基线 → 最终 ms | 最终目标判断 |
| --- | --- | --- | --- | --- |
| Active热，n30 | 最终P9526.8 | P9526.8 | 本轮简短菜单回归未做配对 | 反馈≤50，达标 |
| Display热，n30 | 最终P9527.0 | P9527.0 | 本轮简短菜单回归未做配对 | 反馈≤50，达标 |
| Project details冷，n3（各轮） | 79.3/78.9/65.2 → 70.1/64.6/59.6 | 79.3/79.0/65.2 → 70.2/64.6/59.6 | 184 → 168 | 反馈≤80、内容≤160，达标 |
| Project details热，n33 | P9527.9 → 26.8 | P9527.9 → 26.8 | 64 → 56 | ≤40/100，达标 |
| 已访问会话返回，n12 | P9547.5 → 72.9 | P95334.2 → 73.1 | 72 → 96 | 正文≤150达标；反馈≤60未达标且较基线变慢 |
| 32文件Diff冷，n3（各轮） | 71.7/67.5/62.5 → 67.6/64.6/67.7 | 462.5/486.4/482.5 → 267.0/265.4/279.6 | 104 → 96 | 内容改善；反馈≤60与内容≤180均未达标 |
| 文件切换，n30 | P9520.7 → 18.9 | P9520.7 → 18.9 | 40 → 40 | ≤50/100，达标 |

Diff全部32文件导航仍可达，但冷首导航就绪由163.7/150.8/162.3ms变为266.7/265.3/279.5ms，**存在回退**。预加载后，首次文件树和已准备高亮器在同一次较重提交内完成，真实代码更早出现，文件树却更晚获得绘制机会；这不是首开全部改善。

EventTiming单独比较：项目属性冷P95184→168ms（最终168/160/152），热P9564→56；会话返回P9572→96ms，达到≤100但较基线增加；Diff冷104→96，切文件40→40。每个实际interactionId取最大上报duration；没有上报的快速事件不补0。分段探针从pointerdown处理器记录的输入到达开始；EventTiming另含事件队列/处理与下一次绘制，不将它们混为同一个指标。

最终四阶段P50/P95，单位ms；DOM稳定和有限动效完成不充作内容可操作时间：

| 操作（样本数） | 首反馈 P50/P95 | 内容可操作 P50/P95 | DOM稳定 P50/P95 | 动画完成 P50/P95 |
| --- | --- | --- | --- | --- |
| Active热（30） | 18.8/26.8 | 18.8/26.8 | 201.8/209.6 | 201.9/209.6 |
| Display热（30） | 17.9/27.0 | 17.9/27.0 | 200.9/209.5 | 201.0/209.7 |
| 属性冷（3） | 64.6/70.1 | 64.6/70.2 | 255.0/342.8 | 226.7/232.7 |
| 属性热（33） | 22.4/26.8 | 22.4/26.8 | 200.6/210.9 | 178.9/186.9 |
| 会话返回（12） | 68.5/72.9 | 68.8/73.1 | 97.4/103.0 | 259.5/268.8 |
| Diff冷（3） | 67.6/67.7 | 267.0/279.6 | 316.6/331.0 | 294.9/295.2 |
| 切文件（30） | 13.3/18.9 | 13.4/18.9 | 31.8/38.1 | 169.0/179.9 |

基线同样保存四阶段的全部原始值及P50/P95：[汇总JSON](evidence/performance-comparison.json)。基线会话动画完成在探针限时内没有观察到，n0/null，不能写成0ms。内容判定要求当前session/消息锚点，或当前event/文件名及Shadow DOM真实代码；不是旧内容留在DOM即算就绪。浏览器帧机会与自动化观测不是硬件显示延迟/原生60fps证明。

配对可查看：[改前Diff](evidence/before/production/flows/round-1/real-diff.png)、[改后Diff](evidence/after/production/flows/round-1/real-diff.png)。同内容的完整路径录屏：[改前](evidence/before/production/flows/round-1/flow.webm)、[改后](evidence/after/production/flows/round-1/flow.webm)。三轮原始记录在before/after的production/flows/round-1至round-3；每轮都有performance.json、runtime-trace.json.gz和flow.webm。最终菜单原始30次记录在[menus.json](evidence/after/production/menus.json)。

## 未达目标与剩余调用

最终第一轮trace按实际输入到正确内容就绪后20ms分析，避免把紧接着的关闭混入返回成本：[基线栈](evidence/before/production/flows/round-1/trace-analysis.json)、[最终栈](evidence/after/production/flows/round-1/trace-analysis.json)。

会话首反馈仍需从P9572.9ms降到60ms：返回点击本身44.6ms，随后UpdateLayoutTree20.2ms，保留阅读器的可见性/工作面样式更新仍有成本。已有正文直接恢复，不再重播分页，但不能因此忽略反馈回退。

Diff冷首仍需从最高279.6ms降到180ms、反馈67.7ms降到60ms，同时恢复更早的文件导航。最终首次渲染提交约155ms；`diffs-container.connectedCallback → getMeasuredScrollbarGutter`在Shadow DOM插入测量节点并读取offsetHeight/clientHeight，采样约36.2ms，布局切片29.1ms；WASM首轮语法处理和面板注册也仍在这次提交内。面板注册采样约5.9ms，较早期40ms下降，但高亮与滚动条测量的串行初始化没有消失。采样叶权重和包含子调用的时间片不能直接相加。这些已定位的剩余成本未在本轮消除，三轮报告保留未达标与导航回退。

捕获适配器不含工具事件、捕获阅读器没有评论编辑器，因此“同一捕获会话中工具展开+评论草稿+关联文件并排”的复合流程尚不能作为完整已验收能力；本轮分别验证实际代码展开、任务评论草稿、真实文件阅读，以及现有交接与权限保护。尚未跨屏改变OS DPI或测量硬件帧率。以上边界与登录/OAuth留待收尾的安排均不因测试通过而消失。

## 后续提交与推送

用户随后明确要求“首先提交推送”，授权将本轮实现、测试与证据提交并推送到`QCYTSN/ColloSys`的`codex/product-ui`分支。上文“未提交/推送”及dirty状态对应实施验收时刻；原始构建身份、指纹与测量结果原样保留。此次发布保留性能缺口，不代表合并main或公开部署应用。

发布前的暂存差异检查还覆盖了此前未跟踪的新文件，发现`workspace-patches.mjs`第212行有一处字符串外的行尾空格。保留已验证源码字节与指纹；该格式问题不影响JavaScript执行。它与上文实施阶段的`git diff --check`结果区分记录。
