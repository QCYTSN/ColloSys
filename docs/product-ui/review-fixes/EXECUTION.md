# 0ffc13a 定点修复与独立回归

基线：`codex/product-ui` / `0ffc13a6be5ca1f8975d48ca822efdea24eb3d2e`，开始时工作区干净。交付为正常 `npm start` 独立 Windows 应用；本轮修改尚未提交/推送。没有使用本地 skills，也没有重新设计主题、字体、图标或页面骨架。

后续发布授权：用户随后明确要求“你先提交推送”，授权将本轮源码、测试及证据提交并推送到既有 `codex/product-ui` 分支。本文“未提交/推送”描述实施验收阶段；本次发布不代表审美批准、解决已记录的管理服务退出原因、合并 main 或部署应用。

最终 owned 源码、准备清单及实际构建的指纹一致：`f2a15a9f42a149cc5db8803fa80308d3aa9b92b55c22761fa8eb048af7b00eef`。基线构建指纹为 `39971719174bae017d27fdd466c7a07991dc1da943644d716829f6f4d4ab10e8`。上游仍固定为 `5dfb04f516122fe4f59a61137219b5a4e2e1f9f8`，9,854 个原始文件验证零差异；156 个显式准备改动、58 个 owned 文件参与集成类型检查。没有直接修改生成目录作为真源。

附件执行书已读取；附件目录与 Downloads 中未找到可选的 `ColloSys_0ffc13a_Independent_Review_Evidence.zip`。下面是本轮建立的复现，不是该证据包或旧 JSON。真实写入、清理和恢复仅使用 TEST 账号、明确隔离的目录；原生恢复保护、业务 store、认证和权限保持。

## R1–R6：失败、修复与邻近正常路径

| 问题 | 位置、触发与根因 | 修复前证据 | 修改、同路径和邻近路径结果 | 边界 |
| --- | --- | --- | --- | --- |
| R1 | `CheckpointSource.tsx`、`ProjectHandoffs.tsx`：辅助按钮嵌入交接 form；Verify/Retry 缺显式 type；父子重复订阅同一收据 | 正式基线 Verify/Retry 均观察到 invalid=0、submit=0，未复现误提交。另实际复现 Retry 后仍仅一次订阅，解除注入错误后无法恢复 | 明确具体辅助调用的 type，保留 Send 的 submit 和 required；校验即时锁、scope/卸载保护；父子共用收据。10 组正式验证：鼠标/Enter/Space、空/有效输入、慢响应、六段迁移、真实路径冲突、无效 Send、双击只发送一次、busy 内 Inspect 导航及旧响应不清返回草稿 | 默认 type 属静态语义风险，不声称基线误发。读错误及延迟在 WebSocket 响应层控制；旧收据迁移与发送是真实后端请求。共享 Button 默认值没有全局更改 |
| R2 | `DirectoryStorage.tsx`：读写共享错误、两服务一起等待、读取没有顺序保护 | 正式页本地 503→真实成功仍残留旧错误；实际准备组件隔离测试基线 10 项中 8 项失败，覆盖乱序、迟到错误、服务耦合、写后回退、后续 inspection 失败误报 | 本地/备份独立 pending/error/序号，scope 包含身份 epoch、项目、workspace、端点；写开始与成功各使旧读失效。同 scope 撤权优先，旧 scope 回复无效；真实 pin 与旧 GET 交错、policy 提交后读取失败均通过。读取恢复不清除错误口令 | 时序隔离支架替换 transport/principal；真实写入证据另列。没有取消确认后的写入，没有新增业务事实源 |
| R3 | `ProductProjects.tsx`、`colloHandoffs.ts`、`colloSchema.ts`：最新十条截断后筛 pending | 真实数据库有两个旧 pending（不同收件人），之后 105 条真实接受/拒绝记录；基线概览遗漏旧 pending | 增加 project/status/updatedAt 索引；概览严格取 5 条、显示 4 条并给 hasMore；完整列表服务端 pending 分页。8 组通过：37+ pending 不重不漏、跨项目隔离、接收/拒绝/取消、权限、加载/空态、窄屏键盘进入详情获取完整姓名。标题明确为项目内待回应 | 不显示未经计算的总数，不增加事实表。旧记录已有必填 status，不编造补值。索引只在本地后端准备验证，未公共部署；查询错误有局部 Retry/完整列表入口 |
| R4 | `DirectoryStorage.tsx`、局部 CSS：反馈在长面板顶部，与下部动作分离 | 基线复制成功文本 top=-291.8，而面板 top=20，操作位置不可见 | 服务错误在各区头部、复制反馈在对应行且等待 promise、失败可选完整路径、表单错误关联字段并聚焦；完成区保留确认位置和高度，显示实际返回路径。真实加密、错误口令、恢复、无效路径、导出、删除及完成焦点通过；源与 TEST 队友文件逐字节不变 | 正式浏览器复制使用可控 promise；原生额外验证真实系统剪贴板。恢复到期的两种时序用真实组件/受控响应验证，没有等待真实 24 小时到期。解密错误说明口令或损坏两种可能，不把服务限额错误误归为口令 |
| R5 | `tests/product-ui-overflow.mjs`：过早排除离屏、缺自身纵向裁切、没有点击命中类别 | 合成基线检出祖先裁切，漏自身/状态条/完全离屏，无独立操作检查 | Range、实际裁切、client/scroll/比例检查；另做 scroll + Playwright trial + 实际命中，并恢复滚动。两套尺寸文案反例、透明遮挡、SVG 子命中、装饰层、合法滚动、关闭 inert 通过；标题仅是完整文本候选，键盘实际展开另验。正式存储/交接四尺寸和原生125%零已检几何/操作故障 | 有限诊断器，不是通用无障碍认证。line-clamp 只豁免允许的后续文字行；不豁免第一行、控件、祖先和可达性。虚拟化设置项不按不稳定 nth 扫描；设置验证实际导航、搜索、编辑/保存和 switches |
| R6 | 保留此前认证、权限、草稿、确认、阅读位置、presence 和面板生命周期 | 前述真实失败及旧回归断言保留；没有把未复现的面板中断跳变当已确认 Bug | 原有连续性/详情/迟到回复/存储审阅、交接、完成流程、深浅主题、左右栏挤压、reduced motion、认证、原生文件恢复通过；命令和组数如下 | 管理服务在一次原生测试中途退出，原因未定位；重启后本轮原生流程通过。该未解决项没有被写成已修复。审美仍由用户判断 |

## 实际命令与结果

以下为本轮执行；本地原始日志为 `.local/review-*.log`，可分享的摘要在 [verification.json](evidence/verification.json)。失败尝试保留在 run JSON、开发证据与原始日志中，不把失败批次整体写成通过。

| 命令 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 65/65，0 skipped |
| `npm run build` | 通过，最终 1m20s；保留上游 circular/manual-chunk 与大 chunk 警告 |
| `npm run typecheck:integration` | 当前准备 fork 的 58 个 owned 文件通过；不是全上游类型检查 |
| `npm run codecast:verify` | 9,854 个原始文件，0 failures |
| `npm run test:integration` | 13 组；`.local/codecast-app/acceptance-1793253197397` |
| `npm run test:backend` | 10 组；`.local/codecast-app/backend-completion-1793253327330` |
| `node tests/codecast-backend-completion.mjs --after-restart .local/codecast-app/backend-completion-1793253327330` | 重启持久性 1 组 |
| `npm run test:backend:native` | 原生接口授权 10 组；`.local/codecast-app/native-backend-audit-1793254502903` |
| `node tests/codecast-desktop.mjs .local/codecast-app/acceptance-1793253197397` | 真正 Windows 窗口、系统目录选择、确认后恢复字节、队友文件、关闭/重开等 9 组 |
| `node tests/product-ui-review-regression.mjs buttons pending detector auth-storage` | buttons 10、pending 8、检测器原始及变体、实际 IDB auth-storage 6 通过 |
| `node tests/product-ui-review-regression.mjs storage storage-isolated`（分别执行） | 正式存储 10 组、实际组件隔离最终 16 项通过 |
| `node tests/product-ui-review-regression.mjs continuity detail late-reply storage-review handoffs`（分批顺序执行） | 7 / 1 / 1 / 2 / 6 组通过 |
| `node tests/product-ui-review-regression.mjs surfaces refinement completion native-surfaces native-completion`（分批重跑） | 4 / 11 / 12 / 4 / 12 组通过。浏览器 surfaces 本轮明确 `--skip-static-boot`，不声称静态启动三项重跑 |
| `node tests/product-ui-review-regression.mjs access auth-continuity auth-storage`（分批） | 权限/切账号 3、双窗口退出 3、durable IDB 6 通过 |
| `node tests/product-ui-review-native.mjs` | 新增真实原生125%确认、系统剪贴板、交接辅助操作 3 组通过 |
| `node tests/product-ui-overflow-counterexamples.mjs`（runner 指定本轮证据位置） | 原有三种故意失败均检出；title-only 不再自动判为全文可用 |
| `git diff --check`、新增/修改 mjs 语法检查 | 通过 |

尺寸：正式存储/待回应为 1440×900、1280×800、960×720、1920×1080；原有矩阵覆盖左右栏最小/最大、深浅、reduced motion。新增原生证据记录实际 Electron `zoomFactor=1.25`、Windows `displayScale=2`、DPR `2.5`、CSS viewport `1025×641`、CSS zoom `1`，Electron44.3.0/Chromium152.0.7977.78。不是 CSS 模拟，也不是多台物理显示器认证。

## 前后图片与操作录像

[REVIEW.html](REVIEW.html) 仅浏览本记录对应的现成图片和录像，不是新的产品入口或第二份报告。原生截图含真实窗口边框；浏览器正式页、真实组件隔离与合成 HTML 分开。

| 观察 | 修复前 | 修复后 |
| --- | --- | --- |
| R1 表单与收据重试 | [空表单 Verify](evidence/before/r1-empty-verify.png)、[Retry 原始失败摘录](evidence/before/buttons/retry-failure-excerpt.txt) | [重试恢复](evidence/after/buttons/retry-form.png)、[真实冲突阻止发送](evidence/after/buttons/conflict-blocked.png)、[busy 导航返回草稿](evidence/after/buttons/busy-navigation-draft.png) |
| R2 读取错误 | [成功后残留旧错误](evidence/before/r2-stale-read-error.png) | [局部恢复](evidence/after/storage/local-read-recovered.png)、[已写入但重读失败](evidence/after/storage/policy-committed-read-failed.png) |
| R3 旧待回应 | [真实旧记录遗漏](evidence/before/r3-missing-old-pending.png) | [旧记录出现](evidence/after/pending/old-pending-found.png)、[加载](evidence/after/pending/pending-loading.png)、[确认空态](evidence/after/pending/pending-empty.png)、[960详情完整姓名](evidence/after/pending/keyboard-full-participants.png) |
| R4 操作反馈 | [复制反馈在视区外](evidence/before/r4-feedback-outside-task.png) | [行内复制](evidence/after/storage/row-copy-feedback.png)、[手动复制完整路径](evidence/after/storage/row-copy-manual-fallback.png)、[错误口令](evidence/after/storage/wrong-passphrase-local-error.png)、[恢复完成](evidence/after/storage/recovery-completed-in-place.png) |
| R5 检测边界（合成） | [原始漏检 JSON](evidence/before/detector/results.json) | [同例结果](evidence/after/detector/results.json)、[不同尺寸文案](evidence/after/detector/variant.json)；HTML 故意错误不会被“修漂亮” |
| R6 真正原生125% | 本轮不伪造原生前图 | [确认](evidence/after/native-125/storage-confirm-window.png)、[真实系统复制](evidence/after/native-125/storage-copy-window.png)、[交接](evidence/after/native-125/handoff-window.png)、[实际环境](evidence/after/native-125/environment.json) |

正式页面连续录像：[基线 R1–R4](evidence/before/before.webm)、[辅助按钮与发送/导航](evidence/after/buttons/buttons.webm)、[真实待回应与分页/状态](evidence/after/pending/pending.webm)、[真实存储操作和反馈](evidence/after/storage/storage.webm)。这些不是原生屏幕录像；原生证据使用 PrintWindow 截图、环境数据和真实动作断言。

隔离证据：[基线组件时序](evidence/before/storage-isolated/results.json) → [最终16项](evidence/after/storage-isolated/results.json)，[审阅中到期](evidence/after/storage-isolated/expired-review.png)、[服务报告过期](evidence/after/storage-isolated/expired-service-response.png)。实际组件/原有 Button/CSS，仅替换 transport 与 principal；不能称完整后端验证。

原有回归录像与 JSON 位于 [evidence/regression](evidence/regression)。不变控件的旧截图没有重命名充作本轮截图。

## 失败尝试、修正与未完成边界

1. 初始 ready.json 是历史文件，3408 拒绝连接；正常 `npm start` 后才开始有效基线。旧收据支架曾误用 Bearer 设备凭据，按实际设备头修正；隔离组件 about:blank 缺 crypto.randomUUID，改为 loopback origin。这些是环境/测试支架问题。
2. 集成类型检查曾因 owned 源码新于准备目录被指纹保护拒绝；完成准备后通过。没有绕过保护。共用 TEST 账号并行切团队曾互相影响，后续全部顺序执行。
3. 真实插入 pending 暴露 reactive paginate 会扩展游标范围，而旧 isDone 仍 true；概览改为严格 take(5)，完整列表仍正常分页。不是单纯提高旧 limit。
4. 增强检测抓到手动复制提示挤窄左列；局部改为有限宽度两列、窄容器单列，再通过四尺寸。交接姓名截断保留详情入口，真正用键盘进入详情验证全文，不能凭 title 判通过。pending 错误只在自身区域反馈，避免重复总览 alert。
5. 检测器初版把合法 line-clamp 后续行误报，已保留第一行/祖先/控件检查。设置虚拟化的 317 个快捷键编辑器不能按动态 nth 全遍历，改验实际关键可操作控件；没有删除业务断言。原生125%先显式滚到可达位置再 trial，结束恢复滚动；固定在视口外的反例仍检出。
6. 原生捕获曾误取 wrapper PID，改为 Electron 主进程 PID；捕获帮助器的进程/窗口/非空检查保留。曾在导航前设125%而被页面加载重置，断言发现实际为1；最终在页面就绪后设1.25并核验环境。旧失败截图保留在 `evidence/development`，不是最终图。
7. 一次 native-completion 存储页 Failed to fetch：本机3411管理服务已停止监听，3407/3408和根窗口仍在。日志未发现退出异常，原因尚未定位。通过正常窗口关闭/`npm start` 重启恢复，随后 native125 3项、native-completion12项、认证回归通过。不能把重启等同于已修复服务退出原因；该稳定性风险保留。
8. auth-storage 的六项断言后证据写出因目录不存在失败；runner补创建各输出目录后六项重跑通过。失败批次 run JSON仍保留。新增测试格式化后仅做语法/差异检查，没有用格式化代替回归。

没有重跑浏览器静态启动三项、没有等待恢复副本真实24小时到期、没有多台物理显示器/跨平台/完整无障碍认证。未进行公共部署、付费调用、邀请或安装包发布。真实本地加密存储不代表异机灾难备份。原生服务退出原因和用户视觉接受度仍待解决/判断。

## 需要用户判断的视觉取舍

本轮仅改变复制行、字段错误和完成区的局部布局：复制失败会展开可选择路径；完成区暂保留原表单高度，以免底部焦点和滚动突然跳走；项目概览明确常驻待回应区域的加载/失败/空态。请直接判断这些反馈的密度、距离、留白是否舒服。测试通过只说明所列操作与时序成立，不代表你已批准审美。
