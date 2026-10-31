# 三轮生产构建性能记录

当前构建：5fb3d306dd4c61493bafda0cbd0b3a0c4224a4df97a29af914b38262596b92d9。基线为6f9c577的实际实现指纹7d773de1755a4c27abd5cfc4655aef57391de908507d365a39958494c7a0ea42。所有轮次保留，不能从中挑最快的一轮。

结论：菜单与认证状态反馈保持快速；长会话分段反馈79–105ms，12次中两次为103/105ms，严格全部≤100ms仍**未完成**。重内容总事件时长没有稳定改善；Diff首开和文件切换的部分对照值反而增加。因此不声明整体提速，也不把动画完成时间当成输入迟钝或用功能通过代替性能通过。

## 环境与方法

Windows，同机同本地服务，生产构建，Chrome156，1440×900 CSS px / DPR1，正常动画。每个场景三次独立浏览器进程；OS缓存保留。测试使用相同项目ID、200条任务、65条消息、32文件检查点。既有会话导航序列显式加载三页共60条，再返回；虚拟列表不要求65条同时挂在DOM。未减少消息、文件或关闭动画。

正式测量期间不并行运行构建、其他浏览器测试或测试套件。原生功能验收另用真实Windows scale/DPR2、zoom1与用户Iris偏好；它不与浏览器性能值混用。没有多台设备、OS DPI变化、多显示器或硬件呈现延迟结论。

EventTiming按每个interactionId的最大duration统计，阈值16ms；未报告的快事件不计为0。Playwright往返耗时不是输入延迟。分段探针单独运行，给出按下后首个可观察反馈、内容可操作、文字/几何连续三帧不变、有限动画结束；都是浏览器帧机会，不是屏幕实际亮起时间。“数据稳定”在这里指上述DOM稳定，不代表所有订阅永久停止。

原始对照：[performance-comparison.json](evidence/performance-comparison.json)。分段与认证：[presentation-and-auth-summary.json](evidence/presentation-and-auth-summary.json)。每轮保留环境、原始事件、长任务、帧记录、trace和录像。

## 配对结果

下表单位ms。冷首次每轮1次；会话返回每轮4次。文件切换每轮6次，EventTiming未报告的不足16ms事件仍不补0。

| 指标 | 改前第1/2/3轮 | 当前第1/2/3轮 |
| --- | --- | --- |
| Project details冷首次，EventTiming | 152 / 184 / 216 | 168 / 184 / 144 |
| 长会话返回，EventTiming P95 | 112 / 144 / 136 | 160 / 136 / 136 |
| 32文件Diff首开，EventTiming | 64 / 64 / 96 | 112 / 112 / 96 |
| Diff文件切换，已报告EventTiming P95 | 24 / 32 / 40 | 48 / 40 / 40 |
| Diff真实选中反馈 | 40.8 / 40.1 / 63.7 | 76.0 / 73.4 / 65.8 |
| Diff全部文件可操作 | 116.4 / 111.6 / 146.3 | 184.2 / 161.6 / 158.7 |
| Diff内容稳定 | 162.0 / 163.9 / 200.9 | 271.4 / 226.1 / 222.4 |

菜单热操作每入口合计30次，冷首次另有3次：

| 入口 | 改前首反馈P95 | 当前首反馈/可操作P95 | 当前稳定/动画结束P95 |
| --- | ---: | ---: | ---: |
| Active | 20.3 | 20.0 | 203.3 |
| Display | 20.6 | 24.3 | 207.2 |
| Grouping子选择 | 15.8 | 30.4 | 48.7 / 48.8 |

当前Active冷反馈35.7/57.4/35.8，Display37.5/28.6/35.2。Grouping没有虚构冷首次样本。虽均低于100ms，Display和Grouping也不能称为更快。

## 当前分段观察（另三轮，不混入配对EventTiming）

| 场景 | 样本数 | 首反馈P95 | 可操作P95 | DOM稳定P95 | 动画结束P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Project details冷首次 | 3 | 83.1 | 83.1 | 306.2 | 268.1 |
| Project details重复打开 | 33 | 28.2 | 28.2 | 210.8 | 192.3 |
| 长会话返回 | 12 | 105.0 | 105.1 | 148.2 | 294.9 |
| 32文件Diff首开 | 3 | 78.3 | 169.4 | 511.5 | 514.3 |
| Diff文件切换 | 18 | 18.8 | 18.8 | 57.4 | 182.6 |

Project details首反馈三轮83.1/66.2/60.4；会话每轮最大反馈105.0/91.9/96.1；Diff反馈78.3/66.6/69.7。完整动画保留。Diff第1轮DOM稳定511.5ms必须保留，不能只报另外两轮239.1/258.7ms。

## 登录艺术、输入与provider状态

三轮均在真实字体和正常运行的水岸动画中逐键输入32字符；本组为after-only，不捏造历史基线。EventTiming P95分别24/24/48ms，最大32/24/48ms；rAF间隔P95为8.7/8.6/8.6ms，最大16.9/8.7/25.2ms。帧采样不证明硬件60fps或120fps。

提供商状态使用真实按钮输入、真实本地relay，外部浏览器打开受控；不代表真实提供商授权速度：

| 操作 | 样本数 | 首反馈P95 | 状态可操作P95 | DOM稳定P95 | 有限动画结束P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| GitHub发起 | 3 | 6.6 | 60.9 | 90.4 | 215.5 |
| Google发起 | 3 | 6.8 | 58.9 | 82.1 | 215.5 |
| 取消 | 6 | 7.2 | 7.2 | 30.4 | 122.1 |

同帧合成双击另用于竞态断言，不混入这12个真实pointer输入样本。密码显隐共30次，反馈P95为5.1ms；真实失败提交的反馈7.8/7.8/6.2ms，错误可见70.6/54.2/54.6ms，后者包括本地认证请求。

## Trace定位、改动与剩余慢路径

原始记录与分析在各轮runtime-trace.json.gz及trace-analysis.json。React提交、Radix Presence读取animationName触发布局、虚拟列表getMaxScrollOffset以及store复制/同步仍占用主线程。采样叶节点和包含子调用的duration不等于可相加的独立CPU耗时，也不单独证明某个依赖是根因。

已经落实：同一页合并后保持消息/回调引用；复用日期formatter；ConversationView无行尺寸修正时不读取offsetParent；stage隔离布局；只在中断正在播放的按压动作时读取transform；React先显示已验证会话选择/标题，再调度完整阅读器。没有计时器、授权缓存、消息删减或动画关闭。最后一次阅读调整后重新通过阅读位置、撤权、换号和原生验收。

剩余：会话两次反馈略超100ms；首开菜单的完整事件响应、Diff挂载/稳定、全局React提交及布局/滚动测量仍需进一步优化。当前数据不支持整体速度改善的结论。

中间记录完整保留：candidate-before-success-guard与一次单元测试重叠，排除正式对照；presentation-initial-observer把有效分页误判为未就绪并漏记Diff更早的选中反馈，已修正并重跑；candidate-before-deferred-reader包含前一实现的全部三轮结果，未混入当前构建数据。

全部中间数值仍在上述目录；其中不参加最终验收的媒体/trace移入本机.local/auth-completion-evidence-archive，位置映射为[local-archive-map.json](evidence/local-archive-map.json)。正式基线/最终三轮的trace、录像和原始数值留在仓库；当前登录整页/录像集中在after/login，auth-round目录保留每轮完整数值，重复媒体也已归档。材料没有删除。

复跑入口：先准备/构建并启动正式本地服务，保持其他验收程序关闭。对照用product-menu-performance.mjs、product-menu-heavy-performance.mjs与product-menu-performance-summary.mjs；分段运行另外设置COLLOSYS_PRESENTATION_PHASES=1并使用独立COLLOSYS_MEASUREMENT_ROOT；认证逐轮用product-auth-completion.mjs，独立目录由COLLOSYS_UI_EVIDENCE_DIR指定；密码控件用product-menu-auth-performance.mjs；最后product-auth-performance-summary.mjs生成合并摘要。
