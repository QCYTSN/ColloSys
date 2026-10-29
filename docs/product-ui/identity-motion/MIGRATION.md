# 本轮所有权和迁移

产品仍复用同一 Convex Auth、账号、团队、项目、业务 store、实时传输和持久化后端。没有第二套账号库或另一份任务主数据。所有修改从 `integrations/codecast` 经 prepare 生成；不修改固定上游。领域与 API 改动如下。

| 原约定 | 产品约定 | 行为、兼容和验证 |
| --- | --- | --- |
| 原 authRoot、AuthGuard、本地 token 直接放行 | ProductAuthRoot + ProductStartupProvider + ProductAuthGuard | 先查询真实 session，再挂载保护内容。完整框架入口仅 re-export owned 实现。原认证上下文实例保持一致。冷启动、失效 token、撤销和连续退出测试见 evidence。 |
| 四个 `__convexAuth*` 键和 `codecast-auth` IDB | 原位保留 SDK 存储；增加 `collosys.auth.generation.v1` 与 signed-out tombstone | 不复制 token 到第二套命名空间。退出同步清四键及原 durable store；旧请求和旧 provider 的写入受代际/主体限制，tombstone 阻止 durable backup 恢复。显式登录才解锁。 |
| `codecast-theme` / 客户端主题配置 | `collosys.appearance.v1`，version=1，mode + accent | 新键优先；仅无新键时读取旧键。先写新值、再写迁移标记，旧值保留。新键损坏/写失败安全回退；重复执行不覆盖新选择。认证偏好不使用此双读方式。 |
| 固定 HTML/ThemeProvider 主题及原主题推荐卡 | 同一 appearance-runtime 初始化 HTML 和 React；ProductAppearanceSettings | 系统主题监听、跨窗口 storage 事件、原生窗口主题投影。历史 ThemePicker/ThemeIntro 源文件属于保留基础依赖，正式入口不再挂载推荐卡。 |
| `__CODECAST_ELECTRON__` | `__COLLOSYS_DESKTOP__` version=1 | 新功能与目录选择只使用新 bridge。旧变量只在 owned preload 中向原基础 bridge 暴露一次别名，供尚未接管的成熟基础窗口调用；不创建第二组监听。 |
| `codecast-navigate`、`__CODECAST_NEW_SESSION` | `collosys:navigate:v1`、`__COLLOSYS_NEW_SESSION_V1` | 主进程配置、窗口注册分发、DesktopProvider 接收及 DashboardLayout 安装/销毁同时迁移。没有双重派发；监听有销毁。旧名称只剩基础源码注释，未扩大依赖。 |
| 任意外部浏览器调用 / 原 noop | `collosys:auth:start:v1` | 只接受主 frame、精确本机 origin、版本/UUID/provider；主进程自行构造本机授权 URL。不接受 renderer URL；原网络和导航限制仍保留。 |
| `.local/codecast-app/desktop-profiles/<profile>` | 原位保留 | 这是用户数据目录，不因路径含 codecast 搬移/清空。新增非敏感 `collosys-appearance-v1.json` 仅供 native 首帧背景，临时文件写完后原子重命名；不是第二套账号/业务状态。 |
| 项目 icon / color 零散可选字段 | ProjectIdentity `{version:1,icon,tone}` + identityRevision | 创建随标题同一事务保存；编辑校验稳定值及修订号，图标/颜色一次提交。旧字段只作基础控件投影，旧数据首次升级保存在 identityLegacy；合法旧值映射、不认识的值 fallback 但保留原值。可重复 upgrade，已迁移记录不覆盖。 |
| IntentHeader 全接口继承 | ProductProjectHeader 自有窄接口 | 接回 project identity、标题、操作、tabs 及 fallback glyph。实际创建、列表、详情、面包屑、项目行共用 stored identity。成熟标题编辑和 store 保留。 |
| 自有 `collo_workspaces.workspaceId` 被 UI 误作协作空间 | `colloDirectories:list` 返回 DirectorySummary v1，持久化 directoryVersion/directoryId | 新注册写 v1；旧目录重新注册或授权的 upgrade 原子补字段，不迁移文件。现有行 _id、owner、project、workspaceId 和 by_workspace 索引不变，事件、grant、backup、pending outbox 引用不变。list 对未升级行使用边界适配；没有另建目录表。真实重复迁移/跨账号拒绝已测。 |
| 原 workspace/personal/team 字符串创建请求 | CreateProductProject + CollaborationScope | 产品服务接收 personal/team 及 teamId，再在单个边界适配已有 store 的 audience 字符串。团队是可见受众；本机 directory 是独立授权根，不能自动应用同伴文件。 |
| `--sol-*` 广泛基础主题 token | owned `--collo-*` 产品语义 + 单个 appearance 适配 | 新产品主题/强调色在一处映射到成熟基础控件；不全仓替换第三方 CSS。项目色是独立 ProjectIdentity tone，不污染应用 accent。 |

捕获会话依然是授权协议事件/消息，不变成可控制的执行会话；实际控制入口仍走原执行/session 权限边界。Agent 工具身份由已有证据驱动的 AgentBadge/AgentIdentity 表示，模型标签独立。检查点记录、完整性状态和实际加密备份字节分别保留，未把 metadata 改名成“已备份”。这些是现有业务边界，未新增无用业务对象。

升级正常路径是关闭旧窗口后 `npm start`：准备 owned fork、原数据库 schema 兼容扩展并启动新构建。目录记录在连接器下次注册时升级；项目在编辑或 `colloProjectIdentity:upgrade` 时升级。两个 upgrade 都只处理有权限项目、同一事务内修改，不删除旧引用。老连接器的版本 1 数据包和旧导入仍可读；无需同时重写历史事件和备份。测试只对隔离 TEST 记录调用迁移。

剩余命名分类：

- **第三方/许可证**：包名 `@codecast/*`、固定 mirror、platform API、原生成 types，继续是实际依赖来源；保留正确归属。
- **兼容适配**：SDK auth keys/IDB、旧 bridge 唯一别名、foundation 的 `--sol-*`、store collection `colloWorkspaces`、协议 v1 workspaceId。这些有明确调用或持久化引用，不能无迁移地删。新公开目录 API 已不把这些当产品语义。
- **目录/脚本 provenance**：integrations/codecast、.local/codecast-app、现有 npm codecast:* 命令保留；用户入口仍是 npm start。
- **历史研究**：DesignLab/ContextWorkbench/reference=codecast 仅历史/隔离比较，非正式产品交付；旧 evidence 明确属于旧版本。
- **技术窗口基础**：原 detach-view、窗口注册等底层协议尚未重写，继续由同一 framework 实现。这一轮迁移 auth、appearance、导航与 new-session 调用链，不声称整个桌面基础框架由 ColloSys 原创。

原生 profile 与原数据库未移动；没有执行用户目录 reset、全仓字符串替换或删除未知目录。
