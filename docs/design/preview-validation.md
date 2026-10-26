# 阶段 C 实际检查与收尾

2026-10-26：用户要求暂时收尾并将源代码仓库公开到 GitHub。本轮停在研究、信息架构及两套候选预览；正式前端重构尚未开始，候选未获用户选择。产品仍通过 `npm start` 使用既有独立桌面窗口。

## 运行与证据

仓库根目录完成 `npm ci --ignore-scripts`、`npm run codecast:setup` 后运行：

```powershell
node node_modules/vite/bin/vite.js --config design-explorations/workbench-20261026/vite.config.ts
```

- A：`http://127.0.0.1:3417/?layout=queue&work=CW-42`
- B：`http://127.0.0.1:3417/?layout=focus&work=CW-42`
- 验证：另一个终端执行 `node design-explorations/workbench-20261026/verify.mjs`。
- [机器可读结果](evidence/candidates/validation.json)：17 项检查通过，未观察到页面错误或外部请求。

| 尺寸 | A 队列 | B 专注阅读 |
|---|---|---|
| 1440×900 | [截图](evidence/candidates/queue-1440.png) | [截图](evidence/candidates/focus-1440.png) |
| 1280×800 | [截图](evidence/candidates/queue-1280.png) | [截图](evidence/candidates/focus-1280.png) |
| 1920×1080 | [截图](evidence/candidates/queue-1920.png) | [截图](evidence/candidates/focus-1920.png) |
| 800×900 | [截图](evidence/candidates/queue-800.png) | [截图](evidence/candidates/focus-800.png) |
| 390×844 | [截图](evidence/candidates/queue-390.png) | [截图](evidence/candidates/focus-390.png) |

这些截图来自实际 Chrome 渲染。两套使用同一组明确标注的演示工作，不能据此宣称已完成真实后端接入或新版原生桌面实现。

## 已检查的交互

搜索与无结果恢复、按成员键盘筛选、命令查找、空评论禁用和按工作保存评论；弹窗焦点约束、Esc 关闭与焦点返回；未知来源保持未知、同伴工作不出现恢复权；本机恢复预览模拟过期拒绝且无写文件动作；新记录等待读者主动加入；错误、无权访问与首次使用均有退出路径；系统减少动态效果生效。

最终复查修正并验证：交接生成可再次打开的本页草稿，展示接收者、工作、请求和文件；桌面折叠证据后缩窄，仍可通过“变更”访问；已查看按钮有提示与按下状态；浮层截图等待动画结束，避免把过渡帧作为结果。证据见 [交接弹窗](evidence/candidates/handoff-dialog.png)、[保留草稿](evidence/candidates/handoff-draft.png)、[缩窄后的变更](evidence/candidates/focus-collapsed-to-narrow-changes.png)。

交接草稿没有发送给他人，刷新页面后丢失。评论、成员状态、执行记录、diff 与检查点都是 fixture。菜单或弹窗存在不代表真实生产流程已经完成。

独立复核确认上述五项修正解决，最终 `disposition: ship`，仅表示阶段 C 候选可供用户评估。没有把该结论当作视觉选择或正式产品批准。预览实际使用的设计规则记录在 [DESIGN.md](DESIGN.md)。

## 工程验证

本轮 `npm run typecheck`、`npm test`（61/61）、`npm run build`、`npm run typecheck:integration`（24 个自有文件）均通过。`npm run codecast:verify` 校验 9,854 个原始普通文件，失败为 0。原始上游及其平台镜像保持不变。

独立预览的 TypeScript 检查和 Vite 生产构建通过。预览产物约 454 kB JS、34 kB CSS，并保留现有约 4.97 MB Google Sans 字体；尚未做字体子集化或性能认证。正式产品构建仍存在上游分包体积和混合动态导入提示。

真实本地证据另行检查：现有产品活动、差异、消息和恢复预览的只读基线通过；原版 Codecast 参考应用在独立数据中通过 8 项账号/任务/设置检查，见 [结果](evidence/references/codecast-verified-result.json)。本轮未重跑此前全部真实恢复/十人并发验收，也未新增桌面原生行为验证；历史验收不转换为新候选的验收。

## 尚未完成与失败记录

A 在 1280×800 中详情低于首屏，存在页面滚动与详情内部滚动的取舍；B 超过可见任务数量时需横向滚动或搜索。长记录、完整无障碍、深色主题、性能、真实数据接入、全页面迁移、安装包/更新器和公共网络使用均未完成。用户选择候选之前不进入正式迁移。

初次参考页面复用过期登录态而跳转到官网，保留的 `codecast-original-*` 仅用于诊断，不能作为产品工作台证据；后续通过独立参考验收重新获取有效截图。预览检查曾遇到菜单退出动画和错误状态按钮期望不匹配，修正等待与断言后通过；正式构建首次被运行实例保护拒绝，停止本轮拥有的实例后重跑通过。这些失败不计入成功结果。

研究与设计文档、源码和截图可以公开；本机数据库、凭据、测试登录态、运行副本、缓存及构建产物留在被忽略的 `.local` 等目录。公开源码不等于部署服务。
