# ColloSys：认证、登录重构与产品精修执行记录

本轮依据 [TASK.md](TASK.md)、附件35358e38-07e5-45a3-bbee-e0f4dd15efe6与ColloSys_6f9c577_Next_Task_Packet.zip。用户选择“先完成其余实现，真实授权待配置”。正常交付入口仍为 npm start 的独立Windows窗口。

开始时codex/product-ui的HEAD为6f9c5779b9f38c8e67ad3e68a8335e6d70703319，工作区干净。当前修改未提交、未推送；此前发布指令已经完成。未使用本地skills、子Agent、公开部署、邀请或付费模型API。

当前构建指纹：5fb3d306dd4c61493bafda0cbd0b3a0c4224a4df97a29af914b38262596b92d9，dirty=true，220个明确准备变更。基线指纹7d773de1755a4c27abd5cfc4655aef57391de908507d365a39958494c7a0ea42保留实际构建元数据。实现从owned源码经prepare/patch进入正式产物；固定上游镜像未修改。

## 四个主目标

| 目标 | 状态 | 当前交付与边界 |
| --- | --- | --- |
| GitHub / Google可用性与安全关联 | 已实现待外部配置 | 配置检测、正式入口、服务端关联/解除、交接与验证命令已实现。真实提供商往返未执行。关联权限及实际设置页为**仅受控验证**。 |
| 统一认证事务与稳定表单 | 已实现并验证 | 同帧同步锁、跨方式互斥、取消重试、迟到响应保护、验证后单一导航；四尺寸和长错误下主要输入锚点稳定。 |
| 完整水岸与图文关系 | 已实现并验证 | 保留实际浅深整页、原尺寸和25%缩略图、局部动作与原生最小化验证。工程检查不代表用户已经认可审美。 |
| 用户外观、控件与慢路径 | 已实现并验证 / 未完成 | 外观预览/恢复、正式控件与业务回归已验证。严格所有反馈≤100ms和整体提速未完成：长会话12次中两次103/105ms，总事件时长未稳定下降。全部轮次见[PERFORMANCE.md](PERFORMANCE.md)。 |

## 实际起点

两家provider的四项配置在实际后端均缺失，私有oauth.env不存在；密码登录可用，邮件发送尚未配置。只记录布尔状态及真实origin，不输出client ID、secret或token。产品为127.0.0.1:3407，Convex Auth callback origin为127.0.0.1:3409。

源码与完整应用确认：未启用provider仍可点；邮箱和OAuth忙碌状态独立；插入提示后整体重新垂直居中；邮箱hook和页面同时导航；图文是分开的flex项。真实字体和完整应用复现了标题上移48px、邮箱/密码下移48px。附件的精简复现没有冒充正式证据。

实际默认profile仅只读allowlist：浅色/Iris，侧栏size17.596、hidden=false，原生1440×852、内容1427×817、页面zoom1、Windows scale/DPR2。TEST原生profile复制这些值；实际业务内容不进入公开截图，没有删除用户localStorage或改写原选择。

## 实际实现

### 认证与安全关联

authTransaction同步取得attemptId/method/generation锁，共享状态不保存密码或凭据。SDK请求与凭据写入受当前尝试、generation、principal epoch约束。成功展示是终态，但同一次SDK响应仍能完成受保护的refresh-token写入。邮箱hook仅上报结果，验证后的统一完成入口导航。

Provider明确区分checking、ready、unconfigured、temporarily-unavailable。固定状态区、独立帮助、刷新与取消保留草稿；ready仅表示可以发起。Login methods沿用原有authAccounts与会话，密码复验复用SDK哈希/限流，不创建第二套账号库。

关联绑定服务端用户/会话、provider、purpose、有效期、单次挑战和近期原方式复验。provider+稳定subject为身份，不按邮箱合并。最终关联需要原会话明确确认，重新检查复验、唯一性和有效期；后端拒绝解除最后一种当前可用方式。外部浏览器登录另一个账号时，既不能覆盖桌面目标，也不会切换浏览器自己的账号。

Convex Auth0.0.79的identity callback缺少所需verifier/session上下文；owned内部auth:store adapter只在SDK验证OAuth证明后接管匹配的link verifier，其他请求交回原handler。内部_handler接口有运行时防护和真实后端测试，升级需重验；公开客户端不能调用它。/auth/link在SDK挂载前清除link-complete标记，避免误作浏览器登录验证码。

[OAUTH_HANDOFF.md](OAUTH_HANDOFF.md)是集中交接。npm run auth:check安全报告缺失项。npm run auth:verify -- --provider=github --native（或google）配置后检查真实桌面领取、刷新和重开；省略--native单独检查Web路径。本轮确认未配置时退出2且不发起授权；真实成功分支尚未执行。参考当前Convex、GitHub和Google官方文档，并单独核对安装SDK，未假定旧SDK具有新API。

### 登录画面与外观

表单固定起点，宽368、认证控件44、provider状态区40；错误在密码之后，低窗口自然滚动。1440×900下标题/邮箱/密码顶部170/478/564。1440×900、1280×800、1920×1080、960×720状态切换均在1 CSS px容差内；960×600注册可以滚动到全部操作。长中文内容明确标为布局压力注入。

水岸是一幅分层SVG：连续水面由画框和近岸限定，主要远峰及次级起伏在后，暖岸接壤水面，深色前景属于岸线。1440×900中画幅560×300、实际着色高度约277，着色下缘到标题32px。风景与标题同组，品牌标记独立；浅深主题各自设计明度，没有整图opacity/invert。保留Google Sans、Newsreader和用户提供的peanut标记。

主山/岸线静止，倒影±9 SVG单位、8秒往返，聚焦光带220ms内响应，等待光带由真实认证状态驱动。2.1秒采样、reduced-motion、离屏与实际原生最小化/恢复分别检查；艺术组件只接收展示枚举。

Iris等保存强调色作用于链接/focus/selected，主操作和危险色各有语义。Forest预览改变实际应用，取消/离开恢复，采用持久化并备份原值，重开后可以恢复原选择。项目status/deadline及日期编辑归入32px trigger家族和13/18文字，移除旧属性局部规格。AgentTypeIcon/BrandIcons保留。

### 运行中发现的修正

原生登录后Ctrl+,失效：DesktopProvider因router对象变化移除监听，而initRef阻止重新注册。owned patch使用稳定facade转发到当前router；实际登录、设置与重开通过。

消息合并结果和回调保持引用，避免同一页加入累积集合后重复重建会话；列表日期复用Intl formatter。trace定位到无尺寸变化时仍读取offsetParent，现只在确有已挂载行尺寸修正时测量。完整stage隔离布局；按压层仅在中断正在播放的动作时读取transform。完整会话由React延后调度，先绘制已验证的选择/标题，无固定计时器；原有principal/project/session边界和拒绝访问时的同步清除保留。授权查询、消息、虚拟列表、阅读恢复和动画保留；效果以三轮实测为准。

## 实际验证

- npm run typecheck、npm test 70/70、生产build、npm run typecheck:integration 87个owned文件对当前prepared上游类型均通过；build保留现有大chunk警告。
- codecast:verify：9854个固定上游文件，failureCount0；9437个Windows换行与2个已记录链接。
- 账号关联后端10组：无权限/无复验/错误密码、两家关联后同账号同项目SDK登录、稳定subject冲突、相同邮箱拒绝合并、取消/过期/撤销会话、争抢唯一身份、确认时复验过期、已有provider复验、最后方式保护。真实本地后端，外部证明受控注入。
- 当前设置UI3组：真实密码复验，两家provider原窗口明确确认，另一已登录浏览器打开回调保留原账号；解除GitHub仍保留密码/Google及原项目。含连续录像。
- 当前登录6组：实际能力查询超过8秒后重试；四尺寸布局；真实慢密码请求和同帧双击仅一次；真实relay双击/跨方式互斥/取消重试/旧失败迟到；双主题静态和动作；低高度注册。
- 当前原生3组：匹配实际profile、最小化/恢复；密码复验；预览/离开/采用/重开/恢复外观。
- 本轮11组业务回归全部通过，阅读渲染调整后重验continuity、access、auth-continuity：menus、native-menus、startup、auth-races、security、provider-policy、identity、continuity、storage、access、auth-continuity。保留键盘/父子Escape、快速开关、阅读位置、草稿、目录确认、换号和撤权。破坏性测试只使用TEST数据与隔离目录。

首次重放早于3407完成启动，连接被拒绝；服务ready后重放通过，没有把这次失败记录为产品通过。中间性能候选与一次单元测试重叠，保留在evidence/candidate-before-success-guard并排除正式对照。正式性能测量与构建、其他浏览器/测试串行执行。

## 交付与剩余项

在仓库运行npm start。设置入口：账户菜单或Ctrl+, → Profile & appearance → Login methods / Appearance。实际画面、前后对照、25%检查和录像见[REVIEW.html](REVIEW.html)。具体构建和结果索引为evidence/verification-index.json。

GitHub/Google真实授权、真实关联、拒绝/取消/退出后重登待用户配置与提供商所有者授权；邮件发送也未配置。受控回调不代表外部往返。性能未达项见专门记录；未测多显示器、OS DPI变化或硬件呈现延迟，不宣称全平台60fps。用户审美选择与工程验收分开。

证据保存：全部轮次数值、正式前后trace/录像、当前登录整页与状态录像留在仓库。未纳入最终验收的中间图像/录像/trace，以及另两轮和原始轮目录中的重复登录媒体，保留在本机.local/auth-completion-evidence-archive；映射见evidence/local-archive-map.json。没有删除原始材料，也没有把较慢轮次从数值报告中移除。
