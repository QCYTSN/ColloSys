# ColloSys 工作台方向预览

阶段 C 的两个候选，共享同一组隔离演示数据。**尚未获得正式产品迁移批准**。不访问业务 API、不扫描文件、不调用模型、不应用队友文件；评论、任务和交接仅在当前页面内存中演示，刷新即重置。

从项目根目录启动：

```powershell
node node_modules/vite/bin/vite.js --config design-explorations/workbench-20261026/vite.config.ts
```

- [A · 交接队列](http://127.0.0.1:3417/?layout=queue&work=CW-42)
- [B · 会话工作面](http://127.0.0.1:3417/?layout=focus&work=CW-42)

顶端切换方案。可体验：选任务/会话、按成员筛选、搜索、文件切换、讨论/执行/来源切换、预览评论、交接草稿、创建演示任务、自己的恢复预览及过期状态。右上“体验状态”演示首次使用、加载、连接失败、权限拒绝和新记录。`Ctrl K` 打开查找，`Esc` 关闭浮层；窄窗口用“记录/变更”切换。

入口仍是浏览器设计预览。正式 `npm start` 的独立桌面启动方式没有改变。本目录不是桌面实现完成的证据。

```powershell
node node_modules/typescript/bin/tsc -p design-explorations/workbench-20261026/tsconfig.json --noEmit
node node_modules/vite/bin/vite.js build --config design-explorations/workbench-20261026/vite.config.ts
node design-explorations/workbench-20261026/verify.mjs
```

构建输出只在 `.local/design-exploration-build`，不进入正式产品 dist。依赖沿用已安装的 root React/Phosphor/Vite 与固定 Codecast 的 Radix packages；没有添加新组件库。设计规范和验收记录在 `docs/design`。
