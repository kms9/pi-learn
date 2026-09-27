# Controller 边界集成证据索引

本页只索引实际 CLI/HTTP/SQLite 子断言，不代表对应主 ID 已 PASS。合成 adapter 没有真实 Pi/模型，不能代替 U/R 判据。完整阶段状态由 `cases.json` 和独立 `RESULT.md` 维护。未新增或执行单元测试。

| 主 ID | 已观察的子断言 | 原始证据 | 仍需补查的主要边界 |
|---|---|---|---|
| P4-A04 | Go doctor 共用配置夹具；大小写、越界、缺文件、capacity=0 拒绝 | `evidence/codex-config-cli-fixtures.json`、`codex-path-config-cli.json`、`codex-strict-json-field-case.json` | 真实 Pi/TS 同判与全部配置子项 |
| P4-A06 | dry-run hash 不变；显式迁移保留旧表/WAL/授权历史；失败不发布；旧库不能隐式启动；迁移产物可 serve | `evidence/codex-migration-cli.json` | 真实 Pi 迁移链与完整混协议场景 |
| P4-A02 | 第二 Controller 被锁拒绝，discovery hash 不变 | `evidence/codex-exclusive-controller.json` | 错 Project/protocol、过期 discovery、端口复用 |
| P4-A27/P4-A38 | CLI 预览保留多等号参数、不写 revision | `evidence/codex-cli-preview.json` | 真实 Dashboard 预览、竞争后提交、观察退出 |
| P4-A06/P4-A28 | 旧写路由和无效握手/凭据拒绝，实体数与 revision 不变 | `evidence/codex-protocol-auth-http.json` | 真实 Pi 各入口与跨 Team 授权 |
| TR-A14 | 默认 32 项等待队列满后拒绝第 33 项，无半记录 | `evidence/codex-http-boundary.json` | 真实 Pi 无重入及其他容量竞争 |
| P4-A17/P4-A20 | stale CAS、同 request 重放、并发重复一实体、同键异内容拒绝 | 同上 | amend/complete 竞争、响应丢失和重复结果窗口 |
| P4-A19 | task_after_persist 故障使事务回滚，无 Task/event 半记录 | 同上 | 其余 SQLite/磁盘故障窗口 |
| P4-A28 | 模型 runtime 管理命令拒绝；合法 standalone root；active Team Primary 不得借 root direct 调 Secondary 逃 scope | 同上 | 真实 Pi 旧入口、无预授权、operator 目标 gate |
| TR-A19/P4-A35/P4-A36 | 失租保留资源；无停止证明 retry 拒绝；精确旧 runtime 人工证明留审计；retry/resume 新 Attempt 保留历史 | 同上 | 真实离线子执行、各类恢复/rebind/重启及旧心跳 |
| TR-A01/P4-A32 | Leader 提议不提前终结；有 pending 不得 settled；wait 不自行反复起模型轮 | 同上 | 重复 Leader、真实绕过工具/纯文本结果 |
| TR-A27/CMD-A11/P4-A13 | capacity=1 standalone 父 yield→子 clarify→父 response-only→子续接→父续接；保留 affinity；旧 segment 拒绝 | 同上 | 真实 Pi Team 澄清、无关任务竞争与完整父子范围 |
| TR-A32/P4-A33 | Result 固定 child ref；父 acceptance 覆盖精确 child hash；父 reject 使覆盖失效；checker 实际校验输入产物 | 同上 | 真实策略组合、goal/child 改版、自审拒绝 |
| TR-A23/P4-A10 | 存活节点依赖已取消节点时 Gate 拒绝；显式取消过期依赖后当前结果可完成 | 同上 | 多写资源/Agent blocker 的独立解除 |
| TR-A01/P4-A29 | complete 提议后 guidance 推进 revision，旧提议失效；新 LeaderStep 提议 settled 后释放 | 同上 | 真实 Leader 普通输入与 Worker 接管差异 |
| M0 故障入口 | 无 integration tag 的生产构建返回 404，revision 不变 | `evidence/codex-production-fault-isolation.json` | 全部 adapter/controller 故障点窗口 |

`codex-http-boundary.json` 保留历史：第一条同键异内容检查误把预期错误码写成 IDEMPOTENCY_CONFLICT，matched=false；随后按实际协议 REQUEST_ID_CONFLICT 重测。r10 Leader retry 的 ROLE_NOT_SCHEDULABLE 是真实旧版本缺陷，r11 修复复测另记。顶层 binary 是首轮 r10，后续版本在各子项 details 中记录。不要删除失败链或把 matched=true 解释成完整父 ID PASS。

隔离测试现场是 wJ:p3，r10→r11→r11 production→r12；无真实 Pi。末次从 snapshot.views 检查所有 Attempt/Run 的 cleanup_state 均 released 后停止 Controller。临时 helper 的 runtime 凭据会话文件已删除，报告不含凭据。

补充 `evidence/codex-presence-lease-http.json`：r13/r14 fake-clock HTTP 对应 P4-A36/TR-A17 子项，区分 suspect、offline、lease_expired，迟到心跳不复活许可；doctor/snapshot 时间参数一致。未覆盖真实 Pi 断网及所有旧心跳场景。

补充 `evidence/codex-source-binding-http.json`：r14 旧 source header 被忽略的缺陷与 r15 精确源 binding 复测，对应 TR-A16/P4-A07/P4-A39 子项；旧/缺失源绑定拒绝、当前绑定正常、拒绝不写 revision。真实 Pi 的旧回调、reload 和 session 切换仍需独立验证。

补充 `evidence/codex-transaction-windows-http.json`：先暂停具体 Task 持久化再注入事务故障，P4-A18/P4-A19/P4-A20 子项覆盖提交前完整回滚、提交后错误响应的已提交事实、同键重试仅一个 Task。合成目标保持 working、无模型注入，不替代真实 Pi ACK/settled 崩溃窗口或磁盘满。

补充 `evidence/codex-discovery-clients-r15.json`：Go CLI 与实际 TS TeamClient 对可见隔离 r15 Controller 的 canonical/alias、嵌套最近根、另一Project、错误project/protocol/controller/epoch、失效端口共9组检查均符合预期；停止Controller并将保留的旧discovery端口交给不相关HTTP服务，两客户端均只请求health后拒绝。覆盖P4-A01/A02对应子项，不要求额外U证据；与双Controller锁证据合并后由独立验收方按完整判据裁决。正常停止删除discovery的首次夹具准备失败也已保留，未当成端口复用通过。隔离服务已停止并删除人为保留的旧discovery。

补充 `evidence/codex-config-capacity-integer.json`：P4-A04正整数Project容量子项，r15实际doctor接受1.5的失败与r16文件/环境/flag共10组复测保留；Viper合并优先级不变，拒绝小数/布尔/非整数而不截断。生产及集成构建通过，非单元测试。

补充 `evidence/codex-result-replay-amend-r16.json`：P4-A17/A20的实际HTTP/SQLite子项；running amend推进goal_revision但保留applied_revision，旧结果settled成为superseded历史、同Attempt segment2应用新要求再完成；相同结果/settled请求重放不重复写，同键改结果返回REQUEST_ID_CONFLICT。最终精确两版历史且只有新版为当前结果。合成adapter无Pi/model，runtime release=200，所有Attempt/Run清理为0未释放后停止隔离Controller。

补充 `evidence/codex-extra-config-cli-r16.json`：P4-A04配置负例补16组实际doctor，涵盖目录/声明ID不符、重复Role/Team声明、非法JSON/YAML、acceptance模式/child_policy、direct名单非法/重复和write/bash工具拒绝。固定路径外的坏sidecar不被解析且hash不变，未创建.runtime；与旧缺文件/大小写/环/引用及容量证据合并审查，未启动Pi。

补充 `evidence/codex-migrated-protocol-offline-r16.json`：P4-A06在此前显式迁移产物Project上可见启动r16，备份/迁移agent行对照保留identity、scope、session，last_seen明确重置1970；v2实例为空，不导入伪online。旧7类写路由各无握手/v1/v2-header三变体，加v2 register缺/v1握手共23组均409 PROTOCOL_MISMATCH，snapshot revision及旧行不变。无Pi/model，未释放资源为0后停止。

补充 `evidence/codex-concurrent-amend-settled-r16.json`：P4-A17两种实际并发HTTP提交顺序。task_before_persist将第一事务暂停，第二HTTP请求同时在途等待事务，释放后：amend先提交(seq313)，旧结果superseded(seq314)、settled(seq315)不能完成新goal，segment2按新goal完成；settled先提交(seq328)完成旧goal，竞争amend返回REVISION_CONFLICT且无operator_amend事件。两组matched，runtime release200，无未释放执行后停隔离服务；无真实Pi，符合该项F/E证据类型。

补充 `evidence/codex-call-boundaries-r16.json`：隔离可见Controller真实HTTP/SQLite，standalone及Team各验证self/ancestor/dependency cycle拒绝、深度3接受而4拒绝，共8项且无Task/Attempt半记录。`codex-child-budget-r16.json`保留实际缺陷：standalone只接受19child；r17 SQL排除root后，`codex-child-budget-r17.json`第20child接受、第21拒绝。`codex-team-retry-budget-r17.json`确认Team仍计20个业务Task（root+19child），并在两scope中实际创建3个不同Attempt后拒绝第4，不产生多余Attempt。均为合成adapter，没有Pi/model；driver嵌入证据，最终未释放Attempt/Run为0，p3隔离服务已停止。供TR-A28及对应预算子断言独立审查，不代替真实递归模型执行。

补充 `evidence/codex-atomic-admission-r18.json`：Project capacity=4，独立HTTP合成Adapter，alpha(r0+r1)/beta(r1+r0)/gamma(r2+r3)。新增integration-only `ownership_after_acquire_each` 在已INSERT一个Role后失败，实际事务回滚后Run/Attempt数和revision不变、无ownership；同request重试成功。Barrier同时提交交叉roster，单一winner持r0/r1、另一个全queued且queue_seq有序；不相交gamma可准入，同请求重放不重复；winner释放后loser只出现一次run_admitted，释放seq在前。6项matched，runtime均撤销、未释放Run/Attempt0后停p3。供TR-A12及P4-A11/跨Team子项审查，不冒充真实Pi并行。

补充 `evidence/codex-write-reservations-r18.json`：10项真实HTTP预约/准入检查，父child申请文件别名或包含父锁的目录拒绝且父revision不变；外部symlink、nested Project、越界路径拒绝无半记录；别名等待真实owner，不同文件运行，无关释放不清冲突，owner释放后才派发；目录覆盖尚未创建文件。没有执行Pi写工具，不冒充CMD-A09。原标control的路径实际越出Project，该局限已写入证据。

补充 `evidence/codex-multiple-blockers-r18b.json`：同一Task同时等待agent_affinity/write_conflict，第三分支实际进入running；amend后两wait仍在，revision于0.46秒内经调度刷新，解除write owner只清write wait，affinity继续阻塞，最后释放才派发。另补正确的Project内.runtime/AGENTS.md/.git拒绝。首轮 `codex-multiple-blockers-r18.json` 的即时revision断言失败保留（读在调度刷新前），复测最多等2秒并记录时间，非生产修复。两份fixture全部清理、runtime撤销，未释放资源0，p3已停。供P4-A10/A14/A37、TR-A24/A31的F/E子项独立审查。

补充 `evidence/codex-identity-races-r18.json`：9项隔离HTTP/SQLite身份竞争，barrier并发首注册仅一个Primary；同ID重复Leader在线/假时钟离线均拒绝、原binding不变；Primary release留空tombstone，第三实例注册不自动填补；两个Secondary同revision并发promote仅一项200另一409；旧Primary binding拒绝；Leader显式release后新runtime可重绑、旧凭据拒绝，binding_history与revoked_runtimes实际行保留。合成adapter无Task/Pi/model，fake clock复原、runtime全部撤销、未释放资源0后停p3。供P4-A07的F/E完整判据及TR-A06/A16子项审查，不替代其真实Pi部分。
