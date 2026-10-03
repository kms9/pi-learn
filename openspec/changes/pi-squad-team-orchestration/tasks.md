> 执行顺序更新（2026-09-27 用户明确要求）：先完成全部需求开发，再统一进行整体集成测试；不新增或运行单元测试。各任务的验证子项保留至开发完成后的集成阶段，未验证不勾选。M0 的编译/能力契约核对及开发期间编译、类型检查继续；4a/4b 是验收分组，M7 开发不再等待 4a 运行验收。

## 1. M0：契约与能力检查（4a）

- [x] 1.1 固定 config/TaskContract/错误码/协议 v2 schema 和 D08 HTTP 契约；补 Go/TS 共用有效及无效 fixture，验证未知字段、ID、refs、JSON 及 P4-A04。
- [x] 1.2 增加 doctor 与 Pi API 编译/运行探针，核对 sections、before_provider_request、agent_settled、input、autocomplete、UI API 及安装版本；验证缺能力 fail closed、P4-A39，不以消息 ask 兜底。
- [x] 1.3 实现旧目录/数据库迁移只读 dry-run，输出映射、冲突和备份计划；验证运行前后文件 hash/DB 不变及 P4-A06 静态部分。
- [x] 1.4 建立仅测试构建启用的故障点及 fake clock/adapter harness；验证可暂停事务前后、最后 gate/注入/ACK/result/settled/release 窗口，生产入口不可触发。
- [x] 1.5 在阶段验收目录建立 89 项索引及 INV-01—15 映射、版本/证据模板；验证唯一 ID、4a=71/4b=18、全局=160 和 P4-A40 静态部分，结果初始 NOT_RUN。

- [x] 1.6 扩大Pi探针到native session/user_bash事件及sendUserMessage不展开命令；验证selector取消、实际切换、manual/auto compaction顺序（P4-A39），固定源码证据见设计D12。

## 2. M1：Project、身份与显式迁移（4a）

- [x] 2.1 在 controller/project 与 extension/config 实现最近根 canonical discovery、严格 Role/Team/Workflow loader 和不可变 ConfigSnapshot；验证嵌套根、别名、越界、大小写及同版本异内容冲突（P4-A01/A04/A05）。
- [x] 2.2 在 serve 实现进程锁、动态监听和原子 discovery；更新 health/client 握手并移除固定端口 fallback；验证双 Controller、陈旧文件、错误 project/protocol/端口复用（P4-A02）。
- [x] 2.3 引入版本化 SQLite migration、事务入口及持久 event/outbox；将 Registry 更新和消息失效纳入共同事务；验证 rollback、旧消息/owner/撤销记录保留且不伪造 online（P4-A06）。
- [x] 2.4 实现 leader/role 启动身份、未启用 no-op、Leader 唯一和 Primary/Secondary 原子绑定；验证 TR-A01/A03/A04/A20、P4-A03/A07，无身份不增加工具/gate。
- [x] 2.5 实现连续性、binding epoch 及显式 release/promote 基础接口；验证旧凭据拒绝、offline 不释放、Secondary 不自动升级（TR-A05/A06/A16），执行状态不明时拒绝换人。
- [x] 2.6 建立 TeamRun、queue_seq、配置快照和整 roster admission 事务；验证 TR-A07、P4-A11 全有或全无、不在 Task 派发时逐个占 Role；后续 M2/M4 接正式入口和 FIFO 生命周期。
- [x] 2.7 实现显式迁移、备份/WAL 一致性、失败回退与混协议拒绝；同步 `.runtime` 忽略规则、根/插件/controller AGENTS 和 USAGE；验证迁移正反例及 P4-A06，用户已有配置不被静默迁移。
- [x] 2.8 增加只读身份/Team/Role 查询基础面；验证 Primary/Secondary、owner、epoch 可查询且客户端不打开 SQLite，暂不记完整 Dashboard 通过。

- [x] 2.9 建立独立operator凭据、非破坏binding撤销与Primary unassigned tombstone；验证runtime伪造origin被拒、凭据权限/轮换/脱敏、跨Team显式管理审计和旧v1写拒绝（P4-A06/A07/A28）。

## 3. M2：真实单 Task 闭环（4a）

- [x] 3.1 在 task/scheduler 实现 Task、Attempt、reservation、segment lease、request_id/hash 幂等和 revision CAS；验证并发重复、异内容冲突、容量不足和事务回滚（TR-A14、P4-A11/A19/A20）。
- [x] 3.2 实现最小 Run 创建、handoff、agent_task_get 和 standalone direct HTTP/CLI 路径，接受时冻结 expected target；验证 Leader/target 离线拒绝、queued 无 Attempt、默认 32 队列满时拒绝、无隐式 Team Run 及 direct/Secondary 绕行、active Run ownership 的 ROLE_BUSY 拒绝（P4-A08/A28）。
- [x] 3.3 实现 dispatch_intent/outbox 及 adapter received/input observed 分层收据；验证持久化失败无注入、重复通知不重复输入、绑定变化阻断旧队列（P4-A18/A19/A20）。
- [x] 3.4 新增 invocation/execution-gate，整合 messaging work gate；验证最后检查至输入无 await、busy/deferred、不 steer 手工工作、单 Pi 无重入（TR-A14、P4-A28）。
- [x] 3.5 新增 context-assembly 的进程/Run/Attempt 快照和 segment sections，保留 Pi 原生规则；验证真实请求中 IDs/hashes/工具集合及新 Attempt/continuation 边界（TR-A30、CMD-A12、P4-A05）。
- [x] 3.6 实现权限交集、Leader 协调工具、read_only/write_set gate、结构化结果工具；验证违规工具阻断、details/截断及写 fixture 正式执行（CMD-A09、P4-A32）。
- [x] 3.7 实现 result_proposed、refs/schema 校验和 settled/no pending 完成判定；验证 RESULT_MISSING、旧 binding/result 拒绝、agent_end 不提前完成（P4-A32）。
- [ ] 3.8 按插件验收规范启动真实单 Task 与 operator→standalone reviewer 调用；保存 U/E/R 证据，核对 INV-01—05/10 映射判据并同步本增量 USAGE。

- [x] 3.9 落地Project容量与direct授权配置、standalone只读root/child预算；验证未授权root调用拒绝、scope=null继承、队列32边界及容量计数（TR-A14/A27/A28、P4-A04/A28）。

## 4. M3：恢复、写资源与输入隔离（4a）

- [x] 4.1 在 recovery 实现 epoch/失租/deadline/restart reconciliation 和隔离门；验证未知注入不重发、TTL 不释放、迟到事件不绕门（TR-A19、P4-A18/A36）。
- [x] 4.2 实现 task/run cancel 及子树 cleanup，精确绑定 abort；验证 queued 取消不影响别的工作、离线 child 未核实不释放（P4-A16/A35）。
- [x] 4.3 实现 recover attach-evidence、retry rebind-current 和审计；与 release/promote 联动对账；验证新 Attempt/retry_of、历史保留及 suspended/quarantined 拒绝换人（TR-A06、P4-A35）。
- [x] 4.4 实现统一 InputClassifier 和 /new、reload generation 清理；验证只读操作不中断、普通输入/takeover 持久中断、旧回调隔离（TR-A15/A29、P4-A29/A39）。
- [x] 4.5 实现中断/失败向父及所有等待祖先的持久传播；验证三层链普通输入、/new、失败不会被当成功或永久等成功（P4-A15）。
- [x] 4.6 实现规范化 write reservation、目录包含及受管工具检查；验证同文件别名互斥、不同文件并行、symlink/嵌套 Project/控制文件越界拒绝（TR-A31、P4-A37）。
- [ ] 4.7 注入 intent 提交/注入/ACK/result/settled 崩溃窗口并执行真实会话恢复检查；保存 P4-A18 逐窗口证据及 INV-06—09/14/15 映射，同步 USAGE。

- [x] 4.8 实现operator人工confirm-stopped、Run resume及Leader release完整恢复入口；验证无Task queued Run可解冻、未知执行仍拒绝、人工声明不伪装自动证明（TR-A19、P4-A35）。
- [x] 4.9 实现从未有Attempt的Task显式rebind及预算耗尽retry拒绝；验证CAS、旧新绑定审计和既有Attempt不绕retry（P4-A09、TR-A28）。
- [x] 4.10 接入实际session/branch变化、user_bash和manual_compaction中断；验证suspended父任务失效、selector取消无副作用、自动压缩不误中断（P4-A15/A31/A39）。

## 5. M4：单 Team、Leader、DAG 与续接（4a）

- [x] 5.1 完善通用 Run 原子准入、同 Team 单 active FIFO、cleanup 后整体释放及同事务 outbox 唤醒；登记等待与周期性有界重扫共用该路径；验证 queued 固定快照无资源、取消 queued 不影响当前 Run、cleanup 未完不准入（TR-A33、P4-A34）。
- [x] 5.2 实现 squad_decide dispatch/wait/complete 和 Leader 事件协调轮；验证结构错误不部分建 Task、不同合法分支可分别排队、无进展不模型忙等（CMD-A10、P4-A17/A32）。
- [x] 5.3 实现 Workflow materialize、统一 DAG、typed dependency、root/parent/depth 及预算；验证 review 消费未验收候选、失败不满足边、环/深度/任务和重试预算拒绝（TR-A21/A23/A28）。
- [x] 5.4 实现 Task blocker 集合与 WaitGraph；验证第三分支可运行、取消/改版只清自己的 wait，以及父写锁冲突在 child 接受前拒绝（TR-A24、P4-A10/A14）。
- [x] 5.5 实现 agent_invoke、yield、affinity 保留和同 Attempt 新 segment 续接；验证 capacity=1 child 可运行、澄清时 child yield→父答复→child 续接不死锁、无关任务不进入父会话（TR-A27、CMD-A11、P4-A13）。
- [x] 5.6 实现关联 amend/peer handoff intent 与 response-only clarification；验证父 yield 前不派发、终结后拒绝 intent、不自动 steer 或反向执行祖先（P4-A30）。
- [x] 5.7 实现 immutable Result/Review、独立 reviewer 身份校验、rework/re-review 新节点和 Acceptance Gate；验证 sum=50 拒绝后返工、产物/目标变更使旧 review 失效（TR-A18/A22/A32、P4-A33）。
- [ ] 5.8 运行两计算 Role 真实并行、review/Gate 和 capacity=1 续接主流程；以运行区间、事件及独立 count=3/sum=60 检查证明，覆盖 INV-11—13 并同步 USAGE。

- [x] 5.9 实现同Store LeaderStep、run_guidance与completion intent→settled→Gate；验证capacity=1、未知注入不重发、普通Leader补充不误接管（TR-A01、P4-A29）。
- [x] 5.10 实现planned→accepted、acceptance_policy解析、checker/review/human及parent覆盖；验证hold不自动accept、父子不验收自锁、review不递归自验和覆盖失效（P4-A09/A33、TR-A32）。
- [x] 5.11 实现受理/应用amend版本与child澄清yield链；验证旧revision结果不完成新要求、capacity=1响应后正确续接（P4-A13/A17）。

## 6. M5：Pi 调用交互（4a）

- [x] 6.1 实现 `/squad` help/whoami/agents/roles/teams/run/use-run/status/task/inbox/transport 与三个旧 alias；验证参数补全、显式 Run 选择及失效清理（P4-A08/A09/A24）。
- [x] 6.2 实现 call/ask/send/amend/takeover/cancel/recover/retry/role release/promote 命令适配，共用 Go 操作接口；验证 request/source 关联、权限及错误无副作用（CMD-A16、P4-A28/A38）。
- [x] 6.3 实现行首单目标 mention parser、文件歧义消解、空任务/附件/多目标拒绝；验证正文/代码/email/Assistant 不路由，已识别失败不落 LLM（CMD-A04/A13/A14、P4-A21/A22）。
- [x] 6.4 实现 team-roster 缓存和 autocomplete wrapper，透传文件 fallback/取消/应用补全；验证 Role/Primary/state、原文件补全、提交重新裁决（CMD-A01/A02/A05/A06/A08）。
- [x] 6.5 实现 `/pisquad-use` Picker 填稿和只读默认 TaskContract、显式 --write；验证不隐式创建 Run、不自动提交及正式 Router 调用（CMD-A03/A09/A12）。
- [x] 6.6 将全部入口接入统一 InputClassifier 并在真实 Pi 验证注册 hook/工具无重复；核对 P4-A24/A29/A39 和 USAGE 命令逐项一致，M8 功能明确尚不可用。

- [x] 6.7 暴露resume/reconcile/rebind/leader release/accept/reject和--parent current；验证operator与runtime客户端分离、活动Workerplain@拒绝、命令/USAGE与策略配置一致（P4-A24/A28/A30）。

## 7. M6：Go TUI 与 4a 退出门

- [x] 7.1 实现 projection 一致 snapshot、revision/age 和 Team/Role/Agent/Run/Task 详情；验证身份/在线/活动/ownership/acceptance 分字段、Secondary 不计容量（TR-A17）。
- [x] 7.2 扩展 Resty client/Go TUI 的筛选、选择、刷新、DAG/事件详情；验证从 API 读取、不打开 DB、退出不停止 Controller/Pi（P4-A38）。
- [ ] 7.3 全部开发完成后执行整体 HTTP/SQLite/Pi 集成测试及竞争/恢复故障窗口，不运行 Go/TS 单元测试；记录实际命令、版本和结果，确认前序身份/消息关键回归无退化。
- [x] 7.4 按 `pi_squad/AGENTS.md` 关闭旧测试 workspace 后建立新 workspace，当前项目 cwd 启动至少三个不同 Role Pi、独立 Controller/Dashboard；派发独立验收前实时获取 callback pane/terminal 并登记 handoff_id、报告路径，核对结果主动回传。
- [ ] 7.5 完成下方 4a 的 71 项、数字夹具第一轮与单 Team 故障窗口、P4-A40 静态部分和 INV 映射；逐项 U/E/R/F/D 记录，全部 PASS 才标 4a 通过，BLOCKED/NOT_RUN 不通过。
- [ ] 7.6 更新 USAGE、阶段结果及 wiki，记录 4a 已可用和 4b 待实现边界；检查命令/配置/结果一致，不把 4a 通过标为整个阶段完成。

## 8. M7：多 Team 准入与唤醒（4b，依赖 4a 开发完成）

- [x] 8.1 完善 Project queue_seq 跨 Team 公平准入；验证 roster 相交不插队、不相交可越过、交叉 roster 无部分占用（TR-A02/A08/A09/A12/A26）。
- [x] 8.2 完善他队/standalone 模型工作 ROLE_BUSY 与 queued Run handoff；验证 review/rework 间隙仍占 Role、不改选 Secondary、queued Task 不建 Attempt（TR-A10/A13、CMD-A07）。
- [x] 8.3 加固 4a 已交付的 release 同事务 outbox 和等待登记，补多 Team 事件 replay/gap 对账与调度去重；验证释放后只准入一次、重复迟到事件不重复派发（TR-A11/A25、P4-A12）。
- [x] 8.4 验证补全后 Run 终结/Role 换 owner 的提交竞态；Controller 重新裁决、UI 显示失效，不信缓存授权（CMD-A15），同步本增量 USAGE。

## 9. M8：Pi Dashboard 与观察交互加固（4b）

- [x] 9.1 实现 Pi `/squad dashboard` 原生只读视图；与 Go TUI 对照同 revision 的列表/筛选/详情，无模型轮和人工中断（P4-A25）。
- [x] 9.2 增加精确目标/revision 的管理命令预览及显式提交；验证预览无写入、提交再 CAS、失败不乐观展示成功且有审计（P4-A27）。
- [x] 9.3 加固 projection 客户端乱序、gap、慢消费者、断线/epoch 变化的 stale 和 resnapshot；验证不假在线/accepted，观察退出不影响执行（P4-A26）。
- [x] 9.4 加固 Picker 取消/草稿保留、快速切 Run 与旧 autocomplete 响应；验证 generation 隔离和未提交不派发（P4-A23），同步 USAGE。

## 10. M9：最终证据与全量收口（4b）

- [ ] 10.1 在真实 Pi 覆盖自动重试、压缩、长上下文及后置扩展改写；保存最终 payload 的脱敏结构/hash/工具集合，验证 agent_end 不冒充 settled（P4-A31）。
- [ ] 10.2 运行数字夹具第二轮：两 Leader、共享 reviewer Primary、Secondary、另一个 roster 不相交 Team（Project capacity显式≥4，Team额度记录）；记录并行区间、整体排队、返工期间持有及释放唤醒，补第三轮多 Team 故障窗口。
- [ ] 10.3 依当前验收回传规范完成独立 4b 验收，核对 18 项全部 PASS、4a 关键回归及问题相关复测；保留失败和重测链、实际版本、handoff 和报告，不以静态检查替代运行证据。
- [ ] 10.4 完成 P4-A40 全量检查、89 项证据核对、阶段总索引 160 一致性和资源安全收尾；同步 USAGE、阶段文档、wiki/index/log，所有退出门满足才标阶段 04 完成。

- [ ] 10.5 逐一执行本轮协商新增的既有ID子断言与四项用户裁决，记录每个子项证据；验证主ID仍89、4a/4b仍71/18，不以旧父ID的PASS覆盖新子项。

## 11. 验收分段与追踪规则

以下是索引，不增加实施任务或验收计数。每个 ID 的规范场景在 `specs/*/spec.md` 恰有一处；完整原判据见 [阶段 04 需求](../../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)。实现进度以上方复选框为准；本轮开发已收口、待重新统一集成验收，结果以逐项证据为准。本轮评估新增子断言仍属原ID，真实报告须逐子项记录；详见需求当前矩阵和spec scenarios。

4a（71）：TR-A01、TR-A03—TR-A07、TR-A14—TR-A24、TR-A27—TR-A33；CMD-A01—CMD-A06、CMD-A08—CMD-A14、CMD-A16；P4-A01—P4-A11、P4-A13—P4-A22、P4-A24、P4-A28—P4-A30、P4-A32—P4-A39。

4b（18）：TR-A02、TR-A08—TR-A13、TR-A25、TR-A26；CMD-A07、CMD-A15；P4-A12、P4-A23、P4-A25—P4-A27、P4-A31、P4-A40。

4a 中 P4-A29 的观察操作可使用已交付 Go TUI/只读查询；完整 Pi dashboard 交互在 4b P4-A25 验证，不能将该后置能力提前记 PASS。P4-A40 静态部分在 4a 检查，整项在 4b 计结果。
