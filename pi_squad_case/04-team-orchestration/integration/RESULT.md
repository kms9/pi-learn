# 阶段 04 整体集成

handoff：`squad-p4-integration-20260927-01`
结论：**PARTIAL**。不是 89 项通过。未运行单元测试，未改生产源码。

## 现场

| pane | 内容 |
|---|---|
| `wJ` / `squad-p4` | 测试 workspace。旧 `wG` 已关 |
| `wJ:p1` | Controller。首轮 r2，安全重启后应换 r3 |
| `wJ:p2` | Go Dashboard |
| `wJ:p5` | `stats-lead` |
| `wJ:p6` | `counter-primary` |
| `wJ:p7` | `summer-primary` |
| `wJ:p8` | `reviewer-primary` |

验收配置是新建 `.agents/pisquad`，保留原 `.agents/roles`。`migrate --dry-run --mapping []` 退出 0，未写文件；计划仍列出复制 backend/reviewer/scribe，`requires_explicit_mappings=true`。没有执行写入迁移，避免把旧业务角色拷进验收 Project。数字 workflow 目标写明既有 fixture 路径，fixture 原文未改。

## 首轮 r2，不能改写成有 refs

二进制 `/tmp/pi-squad-phase04-controller-r2`。`127.0.0.1:62834`，epoch=1，`max-parallel-tasks=4`。config hash `1adebcf32e2baaac81e0371063a2a7b6090b55865c9594d4c70fd2d87edb337c`。

Run `run-5b6fdcd4109fed9f1afebd808fe1dfc0f7733c18231440fdf5a178d0c923c5be`，queue_seq=1，admitted，最终 phase=completed，cleanup=released，revision=7。Dashboard 可见同一行。

| 角色 | task | 结果 |
|---|---|---|
| counter | `task-2c051875c74f6ba165087184e244df051c0b53382a0839f49496bba348a9b019` | value count=3，numbers 10/20/30，另含 sum=60。hash `3c2a654e6c48e02cefbf4cada0982610f13e8e6ca30171fa862ff4f94cb785da` |
| summer | `task-a4a5885ebf3c9aa89588c12b915e4425aa45d7e5e9f7d98334577b0a13e2ca76` | value count=3，sum=60。hash `15756df9c7dfb739d1ec238fb68df46b47b5d112905ecf44b8161f35baf75ee3` |
| reviewer | `task-963337a5626261b54e80ae872b153df866e79b8c9625d4fd8f5e64d07af8e12d` | decision=accepted，candidates 为上面两个 hash。**refs=[]**。hash `0186bff173c182a612125c2cbff5b2e4030a87cdf71f41163f4813dec4c65f0a` |

三个 Role 都被该 Run/stats-team 占用，seq 193 `roles_released` 后一起释放。Pane 上 reviewer 独立读了 numbers.txt。这不是错误 sum=50 返工。

事件顺序，首轮原样：review `result_proposed` seq 160（21:32:00.324）后，execute 任务 `acceptance_accepted` seq 164/165，review `settled` seq 167（21:32:03.514）。Leader `leader_decision complete` seq 189，随后 seq 193 释放 Role、194 run_progress，195 才是 LeaderStep `settled`，时间同为 21:32:26.797。不能把这次完成写成“settled 之后才验收/释放”。

## 尚未覆盖

89 项里只有 TR-A03 有完整主项证据。TR-A07/TR-A21 只覆盖首轮子项。TR-A32、P4-A33 要等 r3 重启后复测。错误 sum=50 返工未做。


## r4 当前用例，未换 r5

二进制 `/tmp/pi-squad-phase04-controller-r4`，`127.0.0.1:64270`，epoch=3。r2 审查结果仍是 `refs=[]`，hash `0186bff173c182a612125c2cbff5b2e4030a87cdf71f41163f4813dec4c65f0a`，没有被改写。

新 Run `run-a2917b787c755570`。审查 task `task-55aee67478489a72d84bd058298ad4600480a1f0c21de2400a833438f8614c9e` 完成后 result.refs 有两条，不再是空数组：

- `task-ec921d09a609e52a0bac5ff2bb584174ce1fe4f86f8fde27cbbe4eadc9ae2504` hash `71c0f72024d20f023065e9b4b375a318fbab3818c2d710a98bef6e0af750f3eb` revision 8 length 121
- `task-b1f60de58bfe19f6b70f00569894f0c9aafca2c55f00767b3834c1ef8dacd0a1` hash `5f32b4f551202e594f603877a290bfd3fcc96d2fb98a84b601e643d166eeefac` revision 7 length 41

审查结果 hash `0d586d02fde20662d79555ec1a4c855b66e0003bb9177b709e1176a93064f19e`，decision=accepted。Pane 上 reviewer 重新读了 numbers.txt。这还不是产物文件改版失效测试。

r4 事件顺序仍是先验收再 settled：seq 482/483 `acceptance_accepted`，seq 485 `settled`，时间同为 21:37:49.872–873。这是换 r5 前的旧顺序，保留对照。

Leader 注入前放置了 `before_final_gate` pause。观察文件已写出。attempt `attempt-633829e57012` 收到 `adapter_received` 后 lease 到期，seq 492 `lease_expired`，Run 进入 `needs_review` / `recovery_hold=true`，没有自动重派。这是故障窗口观察，不是 Gate 通过。

P4-A04 子断言：临时 Project `/tmp/squad-p4-json-case.R70bkY` 的 team.json 使用 `TEAM_ID`。r4 doctor exit 1，`unknown JSON field "TEAM_ID"`。现场 `.agents/pisquad` 未改。


## 产物改版，r4，未打断 reviewer 当前轮

安全 `/reload` 后新建 Run `run-9571c5cd19888ce912183c6d12b03404bc76de894d988ae42d84bf7178cf9d8f`。counter `task-29458059a66b9` 与 summer `task-afb5757c936fe` 都把受管 read 的 artifact 写入结果：path 为 numbers.txt，sha256 `a1852ec81c3b20981618e10c24edce1a85ba43ef5f09aaf13bd44d6a715ed5b5`，length 9。没有用 bash 算 hash。

随后把该文件从 9 字节改为 12 字节。下一次 tick 发出 `acceptance_invalidated` seq 699、700，reason=`ARTIFACT_LENGTH_CHANGED`。Run 仍是 needs_review，不是终态。文件已恢复为 `10\n20\n30\n`。这不覆盖拒绝后返工，也不把 r2 的空 refs 说成有 artifact。


## CLI 配置夹具，不能升成整项 PASS

`integration/evidence/codex-config-cli-fixtures.json`：r5 doctor 在隔离临时 Project 跑了 15 个配置夹具，15/15 matched。现场 `.agents/pisquad` 未改。这只是 Go CLI，没有 Pi/TS 同判，P4-A04 仍不是 PASS。现场 Controller 仍是 r4 epoch=3，没有为这份证据重启。

产物 Run `run-9571c5cd19888ce912183c6d12b03404bc76de894d988ae42d84bf7178cf9d8f` 现为 needs_review，cleanup=reconciling，recovery_hold=true。counter/summer/review/leader_step 都是 needs_review。seq 699/700 之后没有自动重派。reviewer attempt seq 764 settled、765 adapter_stop_confirmed。四个 Pi 当前 done。


## 多 Team 准入，r4 epoch=3，尚未换 r6

三个 Leader 同时在线：`stats-lead`、`audit-lead`、`share-lead`。`reviewer-secondary` 是 reviewer 的 Secondary，Primary 仍是 `reviewer-primary`。

| Run | team | admitted | phase | queue_seq | roster |
|---|---|---|---|---|---|
| `run-a675bb9a17f11b65c1b088da5c5244ec51df23b4cdaeea5fde8ea2286513f911` | stats-team | true | planning | 4 | counter, summer, reviewer |
| `run-15114d45f4eb6709b429508897a985d9b0498c4cc430299564a7bd9c949e7996` | audit-team | true | planning | 5 | auditor only |
| `run-2da43258dead46e90e8be4050d6b1bfd08ba33295ffcfc67499ac6ece1f9e0bc` | share-team | false | queued_run | 6 | 不持有任何 Role |

share-team 的 blocker 是 `role_busy`，owner 为 stats Run，resource=`reviewer`。投影里没有 `waiting_roles` 字段。Go Dashboard 同时能看到两个 planning 和一个 queued_run。这不是 r6，也不是迁移 CLI。


## r7 waiting_roles 复测

二进制 `/tmp/pi-squad-phase04-controller-r7`，`127.0.0.1:50821`，epoch=4。旧 r4 排队记录没有这个字段，没有回写成已有。

新 share Run `run-71457512fd724dbb9f0102648b501f9acc83c06353521be49321931f6f501f42` 在 stats Run 占着 reviewer 时为 queued_run。`waiting_roles` 为一条：role_id=reviewer，owner_team_id=stats-team，owner_run_id=`run-e63165524b849199beac17f86aa463710d04da24c8daa7f7994fa1946bc8faf6`，ownership_revision=1。share 不持有 Role。不相交 audit Run `run-e535cbc5ff9d5743c8d63ff627ff494bb74317445059b074a76c67fe12d6f040` 同时 admitted。

取消 stats 后 seq 1623 `roles_released`（21:51:37.814），seq 1625 `run_admitted` share（21:51:38.161）。waiting_roles 清空。reviewer owner 变为 share-team。share-lead pane 进入工作并看到新的 owner_run_id。


## r8 迁移正例启动，未换现场

现场 Controller 仍是 r7 epoch=4。隔离 Project `/var/folders/yw/k8drw3x52_j3z401tt505xl00000gn/T/squad-p4-migration-r8-sk_x8o_u` 在 `wJ:p3` 用 r8 启动成功：`127.0.0.1:51147` epoch=1。没有挂 Pi。这只证明迁移后的 Project 能 serve，不把 P4-A06 整项标 PASS。

从已取消 Run 的 stats-lead 发 ask，得到 `RUN_UNAVAILABLE/cancelled`，request_id=`15ac9d43-ef05-4147-8730-2c607ae404fa`。从 audit-lead 发 ask，得到 `RUN_UNAVAILABLE/needs_review`。从没有选定 Run 的 reviewer-secondary 发 ask，得到 `NO_ACTIVE_TEAM_CONTEXT`。这三下都不是 ROLE_BUSY，TR-A13 仍是 NOT_RUN。


## TR-A13 有效来源

r8 epoch=5。reviewer 被 stats Run `run-29e8e1395915c5b8ef8cd1a15b18a79ddd6361e745b9b7c4ea5c6b93874df6c6` 持有时，reviewer-secondary 执行 `/squad ask agent:reviewer-primary -- ...`。返回 HTTP 409 `ROLE_BUSY`，request_id=`18706c90-9ea7-4515-a31c-ff9b51396300`，owner_team_id=stats-team。此前 role: 入口的 `RUN_UNAVAILABLE` 不算本子项。模型来源的 direct.allowed_callers 未测，不能写成 DIRECT_NOT_AUTHORIZED 即 ROLE_BUSY。


## wrong-sum 失败链，不能当返工通过

Run `run-29e8e1395915c5b8ef8cd1a15b18a79ddd6361e745b9b7c4ea5c6b93874df6c6`，r8 epoch=5，workflow wrong-sum。summer `task-076b6207ae1` 完成值为 sum=60，不是要求的 50。Pane 写明任务要求 50，但角色规则要求按文件实际内容，所以没有交 50。这不是返工覆盖。

review `task-d86c6007ab9` 的 attempt `attempt-26639f64` 停在 receipt=`dispatch_intent`，error=`lease_expired`，cleanup=pending，没有 adapter_received。reviewer pane 有 `request_id=none /v2/dispatches: outcome unknown; TypeError: fetch failed`，以及 inbox 不可用。Run 现为 needs_review，recovery_hold=true。rework 没有开始。

控制面证据只作子项：`codex-exclusive-controller.json` 第二 serve 拒绝且 discovery hash 不变；`codex-cli-preview.json` 预览不写；`codex-protocol-auth-http.json` 18 个 HTTP 负例拒绝且计数不变。不把 P4-A02/A06/A27/A28 整项标 PASS。


## TR-A05 Primary 离线

退出 reviewer-primary 进程后，heartbeat 超时。projection：primary_agent_id 仍是 reviewer-primary，secondary_agent_ids 仍是 reviewer-secondary，presence=offline，team_schedulable=false。没有自动提升。随后已重新启动该 Pi。


## wrong-sum 真实返工通过，r9 epoch=6

Run `run-9bf7a88fcbf4ec7722c657e7b000b139e89a66f1a53b8b9282c376ffb3b96a61` phase=completed，cleanup=released，recovery_hold=false，revision=9。旧失败 Run 的快照没有被改写。

| 步骤 | task | 结果 | hash |
|---|---|---|---|
| bad-sum | `task-783fb4b32203acbff88cab7993780dd35b4a10d32ebfc089f8d9052d592a95c8` | sum=50，acceptance=rejected | `759cd6cc8e14fb7216b356a81179307e2e95a9ca57fc090f1a2b4ab7b80fc136` |
| reject-review | `task-cb8b1879114975e985571d7ace0d14e91bf8be06508b8d2230ab0a41b3b450ef` | decision=rejected | `548b20c207a813f2503f5c263e732b3d0c3d0c84527c1d3ea28c62a3b6cf4e09` |
| rework | `task-b468c49fd2f42c0e17879302ac15f9553e6d969bf2fe6adb95f3839a69b4decf` | sum=60，acceptance=accepted | `eaa967edfcd2d66038afe280a4230686310a9ac6ab190645f6c993391aca0eba` |
| rereview | `task-f6f52eff398b8650d1d94d771c2f3c7a859b749c1706f2608b02db5a517d3157` | decision=accepted | `d89642f8ac398b0ba4464b782b51385ad1de83980152b20b167415504cb24621` |

`codex-http-boundary.json` 的 capacity=1 父 yield/clarify 是 HTTP 模拟，不算这条真实 Pi 主流程。


## capacity=1 真实父子，r11 epoch=7，未换 r12

`--max-parallel-tasks 1`。Run `run-47e535f129af9410dace7daa4dcabc76f6e10ac939dd06b512610e64853bff6f` 仍在 planning。counter `task-14d9536209c` 调用了 depth=1 的 summer `task-5e44d66aa78`。child settled 后 seq 5076 `continuation_ready`，父 Attempt 进入 segment 2 并提交 count=3、sum=60。观察窗口内同时 running 的 Attempt 不超过 1。没有看到 clarify 或 response-only。这不是 HTTP 模拟，也不能把缺澄清的路径标成 P4-A13 通过。

随后该 Run phase=completed，cleanup=released，recovery_hold=false，revision=9。LeaderStep attempt-140e24a1 settled。clarify/response-only 仍然没有出现。


## 短场景，r12 epoch=8

- 第二个 Leader `stats-lead-2` 注册被拒：`INVALID_LEADER` / team leader mismatch。快照里没有该 Agent。`stats-lead` 仍是 stats-team Leader。没有把“退出 Leader 模式”的工具重置单独拍到，TR-A01 仍是 PARTIAL。
- `/squad call role:reviewer --` 返回 `EMPTY_HANDOFF_TASK`，没有开模型轮。
- `@reviewer @summer count both` 返回 `MULTI_TARGET_NOT_SUPPORTED`，stats-lead 保持 done。选定 Run 已终结时另见 `RUN_TERMINAL`，也没有落成模型任务。
- reviewer release 后 primary 为空，两个进程都是 Secondary，binding_epoch=2，没有自动提升。显式 promote reviewer-secondary 后 epoch=3。已把 Primary 恢复为 reviewer-primary，epoch=4。
- Dashboard `q` 只退出 `wJ:p2` 的 TUI。Controller 仍在 `127.0.0.1:58554` epoch=8。随后已重新打开 TUI。
- `CODEX-BOUNDARIES.md` 所列 CLI/HTTP 子项已写入 cases，相关 NOT_RUN 改为 PARTIAL，没有升 PASS。同键异内容第一次 matched=false 按 harness 预期码拼错保留；r10 retry 失败保留，r11 成功另记。


## TR-A01 同 ID 第二进程，r14 epoch=9

`stats-lead-2` 的 `INVALID_LEADER` 只是否定了错误 agent_ref，不算重复占用。

同 `PI_SQUAD_AGENT_ID=stats-lead`、`PI_SQUAD_TEAM_ID=stats-team` 的第二个进程 `dup-lead`（wJ:p4）注册返回 `IDENTITY_ALREADY_OWNED`，request_id=none。原 Leader 仍在线，runtime `86996389-5a81-4f74-8131-44141855f11b`，binding_epoch=1。快照只有一个 stats-lead。

第二进程 `/squad whoami` 仍是 mode=leader。随后它列出的可调用工具只有 `squad_run_create` 和 `agent_task_get`，没有恢复普通工具。这是注册失败后工具未恢复的真实证据，不是通过。


## 第二 Leader reload 后复测

旧实例证据保留：reload 前工具只有 `squad_run_create`、`agent_task_get`。

`dup-lead` `/reload` 后，通知“Leader 模式已退出；普通 Pi 可继续使用”。`/squad whoami` 有 `disabled_reason`，`active_tools` 为 read/write/edit/grep/find。`/squad run` 返回 `LEADER_MODE_DISABLED`。普通输入只回复 `ordinary`，没有调用工具，也没有提到原 Leader 的 Run。原 `stats-lead` runtime 未变，没有新的活动 Run。bash 不在恢复出的工具列表里。

counter `/new` 后 runtime 仍是 `8cbf0577-4999-4377-bf5c-72e3c74612a6`，session 从 `01a0df9f-6a63-7793-9193-6de9fd86df90` 变为 `01a0dfdb-021a-7793-9193-6dea9ddf8b9c`，仍是 Primary。这只是 /new 子项，不是整组 native 通过。


## 本批进行中，r14 epoch=9

- 同名文件 `reviewer` 存在时，`@reviewer count the file` 返回 `TARGET_AMBIGUOUS`，reviewer-secondary 保持 idle，没有新 Run。文件已删除。
- `@README.md` 没有创建 Squad Run，但被当成普通输入并启动了模型轮。随后已 ctrl+c。这是文件 fallback，不是 handoff。
- 空闲 counter `/tree` 打开选择器后 esc，session 保持 `01a0dfdb-021a-7793-9193-6dea9ddf8b9c`。`/resume` 打开选择器后 esc，session 不变。`/fork` 显示 No messages to fork from，session 不变。随后实际 resume，session 变为 `01a0dfaf-1286-753c-a991-7b1da817ad16`，runtime `8cbf0577-4999-4377-bf5c-72e3c74612a6` 不变，仍 online primary。
- Pi Dashboard 显示 epoch 9 revision 6724，视图含 waits。同时 snapshot revision 6733。按 q 后 summer 回到提示符，Controller 进程仍在。Go TUI 未退出。


## native/UI 批次，r14 epoch=9，未切 r15

- 同名文件存在时 `@reviewer` 为 `TARGET_AMBIGUOUS`，没有开模型轮。文件已删除。
- `@README.md` 未创建 Run，但作为普通输入启动了模型轮，随后被打断。这是文件 fallback，不是 handoff 通过。
- 空闲 `/tree` esc 和 `/resume` esc 都没有改 counter session。`/fork` 无消息可 fork，session 不变。实际 resume 后 session 变为 `01a0dfaf-1286-753c-a991-7b1da817ad16`，runtime 不变，仍是 Primary。
- `/pisquad-use` 打开 counter/summer/reviewer 选择器。esc 取消后没有提交。再选中后编辑器留下未发送的 `@role:counter`，agent 仍是 done。之后在草稿未清时再次发送命令，把草稿提交成了 Leader 输入；这是发送方式混入草稿，不把产品说成自行提交。
- Pi Dashboard epoch 9 revision 6724，含 waits。q 只关观察，Controller 仍在跑。Go TUI 同时仍在。
- `codex-source-binding-http.json` 是隔离 HTTP，不升真实 Pi PASS。


## 中断与澄清，仍不升父 ID

普通输入打断了 counter `task-e8ff11c8e37`。事件 seq 7229 `attempt_interrupted` reason=`manual_interference`。Run `run-fb92210df6a34e7f12dba81bd80e8ed75aa699d6f7bc647ac71dba03e68627ab` 随后 needs_review。probe 文件 `.agents/pisquad/.runtime/integration-probes/01a0dfaf-1286-753c-a991-7b1da817ad16.json` 有 37 个事件类型，但没有 `manual_interference` 字符串；权威记录是 Controller 事件。`!bash` 和 manual compact 这次没有单独做成。

撤回：下面这句只看了 snapshot 最近事件和 pane 里的合计数字，漏了分页历史。不能再把这条 Run 归因成模型猜答案。

原句保留：clarify 夹具 Run `run-15f1ed932769559c36730f2e9cf74d3a8cb436dca1ebce707b46a2c5c99b3824`：summer 子任务 `task-2f54430c450` 直接提交 10+20=30，没有 `agent_clarify` 事件。角色已要求先澄清再 yield，模型仍猜了答案。这不是 capacity=1 澄清通过。

更正：Controller 事件名不是 `agent_clarify`。主库核对 seq 7528 `clarification_requested`，child=`attempt-4be26ea2ab899a30a2f265520d86883e346ac4f6f03fa81c5cec9fcec968494b`（summer `task-2f54430c45094eff1221d6cca8f6c65d3528cf43d5820d23c630abca77493fd2`），parent=`attempt-c873f3a6857d711d6d51bfab74478aa77f434bca6b3a5da7c12ca55fa2358255`（counter `task-9eb5728f40689148a7228280bf43badc018dc57c1e9f8328fc6746556f5a0849`）。随后 7538 `clarification_response_ready`，7551 `clarification_answer` 父 segment 2，7561 子 `continuation_ready` segment 2，7576 父 `continuation_ready` segment 3。clarification 行状态 answered。同一 Run 还有第二条链：7874/7879/7900/7904，child summer `task-392c6deb02ba6a9301eade18a1e07140634d3a4ef5cfe9357b6f695231330ab0`，parent counter `task-e8ed6f840fabf187ed36ded1065ee876bddc9ff0585c18f4969d3a11666997a6`。原始分页在 `evidence/codex-real-clarification-events.json`，是真实 Pi，不是 synthetic。这只证明 clarify/response-only 子项发生过，不把 P4-A13 整项标 PASS。

`codex-transaction-windows-http.json` 只覆盖 P4-A18/19/20 的 HTTP 事务窗口，不升全项 PASS。


## !date 中断

活动 counter 任务中执行 `!date`，pane 显示 `$ date` 和 `Sun Sep 27 06:48:01 CST 2026`。随后 seq 7914 `attempt_interrupted` reason=`manual_interference`。没有单独的 user_bash 事件名。manual compact 仍未做。


## manual compact

活动 counter `task-f06049003568ae2d358acff8498d67732534dc0c15ed06ac9fc6e07c58222640` 上执行 `/compact`。pane 显示 `Compaction cancelled` 和 `Operation aborted`。seq 8386 `attempt_interrupted` reason=`manual_compaction`。该 Attempt 状态 interrupted、cleanup released，没有被当成成功结果。


## r15 回归截止，历史保留

`run-e7ed1e8ee4cfa9aca13a2c9243fe0b976b919c1b446b953ed19c36ffa45d93ce` 的两个 execute 已 accepted，review completed。LeaderStep `task-cac3570dfbf537e4fc2e6267820a170b62e3acc729482bcfddd8c438f82cb2c9` / `attempt-cb0173c34dc691feb7b61edd5158911e55563e5b371c581cef0bfb04306af67f` 是 interrupted/released。seq 9381 reason=`deadline`。pane 的 Auto-compaction cancelled 与这次截止对应，不把自动压缩事件本身当成原因。Leader 上下文当时已很高，处理超过 120 秒。这条 Run 在收到 retry 指示前已被取消，cleanup=released，失败历史还在。没有改 deadline，也没有删除历史。取消后的 Run 不再做 retry/resume。

## capacity=1 无关任务未排入

`run-6fdbbcca1ed8e24d8ccf8267de857e0b8f058fcd670e521d1517de1024586c69` 上 counter 曾 waiting_dependency、attempt suspended，summer 仍 queued。向同 counter 发 standalone operator task 得到 `ROLE_BUSY`。改在同一 Run 内排队时，Run 已是 needs_review，返回 `RUN_UNAVAILABLE`。seq 9693/9694 都是 `deadline`。无关 Task 没有创建，P4-A13 不能 PASS。


## r15 /new 后正常回归

没有 retry/resume 已取消的 `run-e7ed1e8ee4cfa9aca13a2c9243fe0b976b919c1b446b953ed19c36ffa45d93ce`。seq 9381 reason=`deadline` 保留。没有改 deadline，没有删历史。

`stats-lead` reload 后 `/new`。runtime 仍是 `86996389-5a81-4f74-8131-44141855f11b`。session 从 `01a0df9f-5c74-72b7-ae87-05a8ac9e4bad` 变为 `01a0dff7-a975-72b7-ae87-05b4d72245fa`。`snapshot.views.agents[stats-lead].available_tools` 在 /new 前后都含 `squad_run_get` 和 `squad_decide`。不用空闲 whoami 的 `active_tools` 判断注册能力。

新 Run `run-230e92b9a547926b82706e62dc73f253a47d0f4b1c9a6d36437de40cee3882b3` phase=completed，cleanup=released。counter count=3 accepted，summer sum=60 accepted，review decision=accepted。r15 epoch=11，runtime API 可用。


## P4-A13 capacity=1 无关任务

Run `run-24eaef9443407bee2df601ee569d413ed4c1080a9167d995ed31e09fbae8a1ce`，r15，project `--max-parallel-tasks 1`，team `max_parallel_tasks=1`。

父 counter `task-f082e91ec19d82a797fdba7c807add5ef84f4fb808d34bef1e0bd233f0ac38bd`，子 summer `task-0b65d6dfab56f7cd0f2169f1eeec45c6cf860a442216a935b3d4fcee8b3ea6de`。无关任务 `task-53fc51a39fc0ce1d554a39d20379bcf6fe6351e05b65f1f189d788e426daac03`，request_id=`unrelated-cap1-r15c`。

父 segment 1 在 seq 10437 settled。10513 无关任务被 `agent_affinity` 挡住，资源是父 Attempt `attempt-38dd61da9425`。10514 `clarification_requested`，10524 `clarification_response_ready`，10538 父 segment 2 `clarification_answer`，10546 父 segment 2 settled，10548 子 segment 2 `continuation_ready`，10564 父 segment 3 `continuation_ready`，10588 父 segment 3 settled。无关任务第一次 `dispatch_intent` 在 seq 10686，晚于父续接完成。当时无关任务没有更早的 Attempt。之后该无关任务才执行并完成。


## 按原判据收口

P4-A01 原判据是 F/E/D，不要求真实 Pi。`evidence/codex-discovery-clients-r15.json` 的 Go 与 TS 客户端覆盖 canonical、别名、嵌套根、另一 Project 拒绝。标 PASS。夹具首次因 shutdown 删 discovery 没启动的记录不计入。

P4-A02 原判据是 F/E。同一证据覆盖错 project/protocol/controller/epoch、过期 endpoint 不回落固定端口、停服后无关服务占同一端口只在 health 被拒绝。加上 `codex-exclusive-controller.json` 的第二进程锁。标 PASS。

P4-A04/A06 仍有未齐的配置或混协议子项，保持 PARTIAL。


## P4-A03 真实 Pi

未选身份的 `noop-pi` 启动没有 Squad 告警，也没有注册到 Controller。`/squad whoami` 不是命令，落成普通模型输入。这是 no-op。

显式身份加 `PI_SQUAD_CONTROLLER_URL=http://127.0.0.1:1`：leader 进程只出现一次“leader 模式未启用”和 `TypeError: fetch failed`。whoami 的 mode=ordinary，active_tools 含 read/bash/edit/write/grep/find。`/squad run` 返回 `LEADER_MODE_DISABLED`。普通输入回复 ordinary，没有第二次启动告警。原 stats-lead runtime 未变，unreachable-lead 没有注册。

role 进程同样一次“role 模式未启用”。`/squad run` 返回 `SQUAD_MODE_DISABLED`。旧 duplicate 的 `LEADER_MODE_DISABLED` 证据保留。


## 三层普通输入传播

Run `run-b894489d2f1986f32874be5c801a7f3d2532c776b3fa1594b280d53869d3a7e0`。depth 2 reviewer `task-74ed0166ef6b6c2d7576e2e81688e18b2c0f00fe08033ec5bd8d1a5d56efd634` 被普通输入打断。seq 11629 `attempt_interrupted` reason=`manual_interference`。depth 1 summer `task-47077adae38a1` 与 depth 0 counter `task-acaefac1dd480` 都是 needs_review，blocker 为 `dependency_interrupted`，owner=`manual_interference`。这不是 /new，也不是 fork/tree/resume 切换。父 Attempt 仍 suspended/cleanup pending，没有证明不能跨历史续接。P4-A15 仍 PARTIAL。

## A20 按 F/E 收口

`evidence/codex-result-replay-amend-r16.json` 五组 matched：同键重放一致、同键改内容 409 `REQUEST_ID_CONFLICT`、settled 重复不重复写、当前结果只有一份、两版历史不可变。加上此前事务窗口。原判据不要求真实 Pi。P4-A20 标 PASS。P4-A17 仍缺并发 complete/amend 竞争的单一顺序证据，保持 PARTIAL。


## P4-A04 按 F/D 收口

对照原判据，不再把“真实 Pi 未测”当缺口。合并 `codex-config-cli-fixtures.json`、`codex-path-config-cli.json`、`codex-strict-json-field-case.json`、`codex-config-capacity-integer.json`、`codex-extra-config-cli-r16.json`。

已覆盖：缺文件；重复 Role/Team 声明和成员；非法 JSON/YAML；role/team 目录 ID 不符；`agents.md` 大小写被当成缺失；workflow `CALL_CYCLE`；acceptance mode/child_policy/reviewer_ref/checker_ref；direct caller/target 非法和重复，以及 write/bash 工具拒绝；0 与非整数 Project capacity 拒绝，合法整数通过。r15 接受 1.5 的失败保留。旁路文件 hash 不变、doctor 不产生 `.runtime`。负例 exit 1，没有部分激活。

P4-A04 标 PASS。这不要求 U。


## P4-A06 按 F/E/D 收口

`evidence/codex-migrated-protocol-offline-r16.json`：迁移产物里 legacy-counter 保留 role=counter、squad=old-squad、session=old-session，last_seen 从 `2026-09-27T20:00:00Z` 重置为 `1970-01-01T00:00:00Z`。v2 agents 前后都是空，`no_fabricated_online=true`。23 个旧写路由和错误握手全部 409 `PROTOCOL_MISMATCH`，revision 前后都是 0，旧行不变。加上原迁移证据的 dry-run 不写、失败不发布、WAL/授权保留、迁移产物可 serve。不要求真实 Pi。P4-A06 标 PASS。


## /new 中断未开始

第二条三层 Run `run-14c1193e6e824c61536888d86f3e20b7ab133213e5c75e062c0fd3a643c4dab5` 的 counter attempt `attempt-6553d1abe5d2f233d48b8d7ccf0e6c7675359a1ae7e862c45a1e66886578e721` 停在 receipt=`dispatch_intent`，error=`lease_expired`，seq 12422。没有 adapter_received，所以没有执行中的叶子可以 `/new`。TR-A29 仍是 NOT_RUN。

## 清门旧 current 对照，未改失败事件

reload 前 counter transport：frozen=false，generation=10，current=`attempt-1e699a86215b783341deb202b7eedf64288832ec2f312aece3b5d4b7389e393f`，segment=1，本地 cleanup=pending。远端该 Attempt 在 seq 12349（23:27:56.451Z）已 operator_reconcile 为 interrupted/released。本地仍留着 current。对应关系在 `evidence/codex-gate-stale-current-r15.json`。

`attempt-6553` 的 seq 12364 `dispatch_intent` 和 seq 12422 `lease_expired` 未改。收尾只追加 seq 12605 reconcile，Run `run-14c1193e6e824c61536888d86f3e20b7ab133213e5c75e062c0fd3a643c4dab5` 现为 cancelled/released。counter 已 `/reload`。reload 后 counter gate generation=11，无 current。Controller 未重启。summer 已发送 `/reload`，最近 12 行没有 Reloaded 字样，不把 summer 写成已确认加载。

## suspended 对账后不 reload 再派发

`attempt-871caf4ed0e7c404de4d746b20125b0830f394efb826bdc4a93b305cdca1592e` yield 后 suspended/pending。对账前本地门仍是该 current，frozen=false，generation=11。seq 13217 reconcile 后为 interrupted/released。未再 reload，门清空且 generation 仍是 11。

新任务 `task-2b9e62eb8fcc7615f656540ee8f659109f62ea3bea9c181e0ed85e647b3090d6` / `attempt-50202f4f439c315862d238b82c46a9c00c3d6fd5992c516d4bd10777d3c2ea4b`，同一 runtime `8cbf0577-4999-4377-bf5c-72e3c74612a6`。seq 13266 `dispatch_intent`，seq 13270 `adapter_received`，seq 13299 settled/released。证据 `evidence/codex-gate-reconcile-redispatch-r15.json`。

## /new 祖先，未通过

summer 先前只发过 `/reload`。本批读到 wakeups=13523、generation=1，没有 Reloaded。随后空闲时 `/reload` 出现 Reloaded 横幅，wakeups 降到 2048。这才算加载成功。

`run-d29a9df80b58` 的 counter/summer 是 deadline，没有叶子，已取消，事件保留。`run-bba9d8483b73` 的 `/new` 落在 `RESULT_MISSING` settled 之后，不算。三层夹具已改成明确的 L1 invoke+yield、L2 invoke+yield、L3 读文件交 count=3。`config_version` 11→12，Controller 未重启。

`run-97fee8c18fd753d98e7bfcbd3f0c068b3acfa9c2b9b39d99edb2d4054c82bce7` 的 reviewer `attempt-d03b8348cd119ed5134508e9dd0a7ae7e6827feff9011f5565866e816bcd077f` 在 `result_after_commit_before_settled` 暂停时提交了 `/new`，随后删除 pause 文件。seq 14402 settled，seq 14404 才 registered。没有 `attempt_interrupted`，两层祖先没有 `dependency_interrupted`。旧 session `01a0e019-847e-77b1-b5d8-95ab45a319ce`。这不是 `/new` 通过。TR-A29 仍 NOT_RUN。证据 `evidence/codex-new-ancestor-r15.json`。

P4-A17 按 `evidence/codex-concurrent-amend-settled-r16.json` 补上并发缺口后标 PASS。不把本批 `/new` 算进去。

## /new 复测通过，旧失败保留

reviewer 空闲时 `/reload` 出现 Reloaded。`run-fa422e1dcceddfc57d283c1583d47d7efa9130ac802e1286d3f729244968fb6b` 的叶子 `attempt-4637f81b30ba0ec0624e32465404398436e33725b9e4e141f79fc1f9d29526f5` 在 result pause 中提交 `/new`，然后才删除 pause。seq 15790 `attempt_interrupted` reason=`session_changed`，seq 15792 才 registered。没有 settled。旧 session `01a0e01b-da34-77b1-b5d8-95ad508437d3`，新 session `01a0e027-1d7e-77b1-b5d8-95af94d8da95`，runtime 不变，binding_epoch 6→7。whoami 没有 current_task，上下文 0.0%。

summer `task-0dfa4de2adb25ef80805f670a4006d482debacec26cc881053d606258d7bab4d` 与 counter `task-a08ddfd32319197cde46ab4867d20469abb85333ec1bfc290aac6a99770a0bd4` 都是 needs_review，blocker=`dependency_interrupted`，owner=`session_changed`。证据 `evidence/codex-new-ancestor-r15b.json`。`codex-new-ancestor-r15.json` 的失败未改。TR-A29 标 PASS。P4-A15 仍 PARTIAL，fork/tree/resume 未做。

## fork 未通过，已停止再开 Run

summer 空闲时有 Reloaded。随后四次都没有干净的 fork 通过，没有再新建同类 Run。120 秒预算未改。Controller 仍是 r15。

- `run-e9ff9e4752be`：选择器 esc 没有中断。enter 后 seq 16329 `session_changed`，但 reviewer 在 seq 16327 已 `lease_expired`。summer 的 blocker owner 仍是 `lease_expired`。
- `run-ae8548d42182`：`attempt-3c1febc5` error=`manual_interference`，seq 16606。不是 `session_changed`。
- `run-a509a4742d56`：`/fork` 变成 `Operation aborted`，`attempt-7623f45a` error=`manual_interference`。选择器没打开。reviewer 当时仍 running。
- `run-e37a9e4d84ce5ebe8ccb69963e8dcbc1a1cdebe92cbd7d35d9e0b4659beb0a91` 留在现场，未取消。leader `attempt-c785834c` 是 result_proposed / input_observed，仍在 renew。summer `task-1b1547d1` queued，blocker 为 project_capacity 和 team_capacity。counter `attempt-3a9e9c54` suspended / input_observed，error 空。reviewer 没开始。summer pane done，gate frozen=false，generation=9，无 current。

证据 `evidence/codex-fork-stopped-r15.json`。P4-A15 仍 PARTIAL。TR-A28 的 r16/r17/r18 HTTP 证据未在本批裁决。

## 一轮 fork 复测，子任务已完成，未再开 Run

`run-e37a9e4d84ce` 的 leader `attempt-c785834c` seq 17166 `deadline`。pane 是 Auto-compaction cancelled / operation aborted，上下文 88.4%。不是 summer gate。counter `attempt-3a9e9c54` 在 pane done 后对账为 interrupted/released。该 Run 已 cancelled/released。

stats-lead `/new` 后 session `01a0e034-617e-72b7-ae87-05bc37a84101`，runtime 不变，上下文 0.0%。whoami 的 active_tools 只有 `squad_run_create`、`agent_task_get`。snapshot available_tools 含 read/write/edit/grep/find，以及 `squad_run_get`、`squad_decide`。没有 bash。

只开了 `run-253b36cb11ddca51cd5c34ff0b4dc69025fca2b8d845e58b256e92e23ca9dbe2`。summer `attempt-a78be8d0` 选择器打开后 esc，session 仍是 `01a0e02d-70d2-7193-8947-10fecad8834c`，没有 `attempt_interrupted`。实际选择没做：reviewer `attempt-769f02f` 已经 settled/released。这条 Run 后来已 cancelled/released。P4-A15 仍 PARTIAL。证据 `evidence/codex-fork-one-retest-r15.json`。

## fork 在子任务暂停中通过，晚结果没有推进祖先

reviewer 空闲时出现 Reloaded。`run-72ede11f552385150a3ab630e716a5ef90d5c5b66022d2f196be3fef53648309` 的 reviewer `attempt-f349fe78` 在 result pause 中，seq 18172 `result_proposed` 之后仍有 renew 18179/18197/18215/18239。没有 `lease_expired`。

summer `attempt-71b6fed7` 当时 suspended/idle。实际选择 fork 后 seq 18228 `attempt_interrupted` reason=`session_changed`，seq 18231 才 registered。旧 session `01a0e02d-70d2-7193-8947-10fecad8834c`，新 session `01a0e039-7391-7193-8947-11007fdeced7`。counter `task-45670a72` seq 18227 `dependency_interrupted`，owner=`session_changed`。

解除 pause 后 reviewer seq 18276 settled，子任务变成 completed。summer 仍 interrupted，counter 仍 needs_review，Run 仍 needs_review/reconciling。晚结果没有把祖先往前推。这条 Run 留着。证据 `evidence/codex-fork-paused-child-r15.json`。tree/resume 未做，P4-A15 仍 PARTIAL。

## Codex r20 统一验收：数字正常主流程

开发收口后新建wM（squad-p4-r20），p1 Controller、p2 Dashboard、p3 counter、p4 summer、p5 Leader、p6 reviewer，cwd均当前项目。没有遗留故障开关，没有委托Claude，没有运行单元测试。版本Pi0.87.1、Node24.16.0、Go1.27.0，二进制与development-build清单hash一致。

TR-A21本轮PASS：两Worker真实运行区间重叠，count=3、sum=60；reviewer独立读取原文件并提交精确refs，settled101之后acceptance102/103。Leader complete113、settled119、roles_released120，Run completed/released。r2旧失败证据保留，未覆盖。原文件独立hash/数值核对、所有pane和事件快照见 [r20证据](evidence/r20/TR-A21.json)。counter真实probe由doctor确认有序核心hook链，场景验收仍NOT_EVALUATED，不能据此判P4-A39全部通过。

整体仍PARTIAL；返工、capacity=1、多Team、故障/原生会话等其余用例仍需逐项检查。wM保留供本轮后续验收，不新开或重启现场。

## Codex r20 错真值、返工与复审

同一wM现场运行wrong-sum：sum50保留、reviewer settled297后rejected298，返工新Task给出count3/sum60，复审settled353后accepted354。旧Task以superseded_by关联返工，失败结果未覆盖。全程同Run持有roster；8个独立Attempt/fence（含4轮Leader）均settled/released。最终complete381→Leader settled382→roles_released383，capacity为空。

TR-A18、TR-A22 PASS，证据见 [r20返工记录](evidence/r20/TR-A18-TR-A22.json)。P4-A33只补拒绝/返工子项，不将产物变更或策略分支视为通过。后续仍在wM继续capacity=1及其它场景；不重启已完成流程冒充新证据。

## Codex r20 Project capacity=1的父子续接

确认前两Run均released后，仅重启测试Controller到epoch2、max-parallel-tasks=1；Pi自动恢复online，Dashboard改连63370。真实yield-child流程父counter调用summer后yield，child完成后父原Attempt以segment2续接，独立review接受父结果，child以parent policy覆盖，最终Run completed/released且capacity空。

证据见 [单额度续接](evidence/r20/capacity1-yield.json)。TR-A27/CMD-A11/P4-A13仍PARTIAL：standalone、直接reviewer child、Team自身capacity1及无关任务、澄清response-only仍需各自验收。本轮Project=1、Team=4，不能混称Team配置已为1。wM继续保留，服务实际端口63370。

## Codex r20 澄清第一轮失败保留

Team config_version14、Team/Project capacity均1，父counter调用summer后yield。另投无关counter任务，snapshot明确agent_affinity阻挡，无额外Attempt。Leader长上下文进入真实auto-compaction（约111788 tokens）；父child冻结120秒截止时间到达，Run needs_review。未完成澄清链，不能标P4-A13通过。随后显式cancel，cleanup证据见 [失败记录](evidence/r20/clarify-failed.json)。不修改deadline、不删除失败记录；下一轮新Run复测。自动压缩仅属P4-A31部分真实观察，不代表全部子项通过。

### r20 澄清与竞争复测

P4-A13 新复测 PASS：Team/Project capacity均1，child settled1189后父response-only1190/1195/1203，再child续接1204/1214、父原Attempt segment3于1231 settled。无关counter被affinity挡住，1268才派发。完整事件区间计算最大并发1；真实payload仅含agent_task_get、agent_clarification_answer。证据见 `evidence/r20/P4-A13-clarify2.json`。

整条Run未通过：既有reviewer夹具要求文件sum60，拒绝澄清任务sum30，证据保留。显式cancel后released且capacity空。另记录测试提交的无关任务路径遗漏fixtures/，Pi真实ENOENT后经find定位正确文件。修正审查夹具按Task区分数据来源，Team config_version15；后续新Run仍需验证完整review与Gate。

版本15第一次复测仍被reviewer拒绝（`evidence/r20/clarify3-failure.json`）。核对Attempt context确认Team指令与agents.md已刷新，但role.md旧正文仍限定文件核对；已修正role.md并在idle时/reload。旧Run cancelled/released。再次新Run request=`codex-r20-clarify-4`，尚待结果。

clarify4父子结果30完成，但Leader持续重复等待文本未settled，占用唯一额度，review未派发。已保存`evidence/r20/clarify4-failure.json`并取消释放；本轮未证明完整Gate。下次先在无活动任务时为Leader建立新会话并核对binding，禁止未观察终止就重启。

### r20多Team准入与r21查询修复

Project capacity4，stats/share/audit额度4/2/2。A整体占有counter/summer/reviewer；B共享reviewer整体queued，researcher未部分占用，C不相交先完成。A reviewer settled2619后仍持有，释放2675及outbox落库，B只准入一次2677并唤醒Leader。Secondary普通对话working2697，无Attempt。TR-A07/A09/A10/A11/A20复测PASS；取消queued Run未被再次准入，P4-A34其它清理子项待验。完整记录 `evidence/r20/multiteam-round1.json`。

B并未自动完成：Worker已accepted，Leader仅刷新Run revision却沿用旧briefing提交wait，最终停留planning。发现`squad_run_get`实现未返回其描述承诺的任务图；r21扩展改为一次snapshot返回最新任务状态/结果/acceptance及Run revision，复用briefing的有界预览。类型检查通过；share Leader idle /reload后经显式guidance查询新版工具并完成，不能算原轮自动推进成功。新Run `codex-r21-fresh-run-status` 正在验证不追加guidance的行为。Controller二进制未变；r20旧manifest另存，r21源码清单单独保存。

clarify5父子30完成，但reviewer查找原始澄清答复达到deadline，Run取消释放。证据 `evidence/r20/clarify5-failure.json`；不把P4-A13执行链PASS扩大成完整审查Gate PASS。

r21新Run `run-063dd4adb82742f1438322c1dc1c08e957b5cea439eddab79c223260635bb8af` 已完成释放，无追加guidance，只有一项count业务Task与一项LeaderStep；真实`squad_run_get`后complete。证据 `evidence/r21/fresh-run-status.json`。此结果验证查询修复，不将原r20停滞改为成功。全部Run释放且9个Pi空闲后向其余8实例发/reload，后续验收须确认加载完成。

### r22 standalone / reviewer child 与r23真实Pi界面

TR-A27补齐standalone root→child→原Attempt segment2：scope均standalone、Team/Run均null，不创建Run；独立核对文件sum60/hash后显式human验收父结果，精确覆盖child。首轮Codex夹具误用CLI的agent:前缀，EMPTY_HANDOFF_TASK原输入与失败保留；工具target说明已明确裸ID。CMD-A11真实counter→reviewer child后yield/原Attempt续接，后续review与Run释放完成。证据见r22/TR-A27-standalone.json、CMD-A11.json；OpenSpec任务5.5的全部指定行为已验证，现勾选。

r23修复Picker无歧义时仍填@role:的差异，改为填@Role，同名文件存在时才显式@role:。真实界面验证CMD-A01/A02/A03/A04/A05/A13/A14/A15/A16及P4-A21；证据r23/ui-cases.json。原生README/src文件补全保留；Picker不自动提交；成功handoff只给Primary且当前会话不跑模型；ROLE_BUSY与多目标拒绝不派发；旧Run终结且新Run占角色后旧草稿拒绝；文件/Role同名可显式消歧；新空会话无Run时不自动建Run或回落模型。Picker空草稿取消已测，已有草稿及慢响应仍属P4-A23未完成子项。

临时reviewer、src/foo.ts文件已删除，两UI Run取消后released，capacity为空；测试pane zoom退出，恢复Codex tab。没有运行单元测试。当前89项为35 PASS、24 PARTIAL、30 NOT_RUN，整体仍未通过。

### r23 写入并行与独立阻塞证据收口

write-check 两个正式 Task 分别以 edit/write 修改 a/b，事件区间6772—6850与6775—6830重叠。write-locks 的6个 execute Task均checker accepted，Run completed/released；完整事件、最终pane及独立文件hash已保存在 `integration/evidence/r23/write-cases.json` 及其相邻证据。TR-A24通过：counter在7376—7437推进；nested任务解除agent占用后仍受write_conflict阻塞（7519），目录任务settled7613后才于7627执行。相同Agent串行、别名和目录互斥已有真实证据，但TR-A31仍缺运行中reservation表直接观察，CMD-A09工具/session探针与P4-A37边界证据整理仍未收口，不扩大为通过。三处越界sentinel独立核对未变后清理，成功写入产物保留。当前36 PASS、27 PARTIAL、26 NOT_RUN；无单元测试，整体验收未完成。

### r23 写入验收补齐

CMD-A09、TR-A31、P4-A37补齐后PASS。CMD-A09-write.json记录前后相同runtime/session/binding及真实provider工具集合，backend实际edit、frontend实际write，均无bash。reservation-live.json直接记录frontend执行lease与目录write reservation相同Attempt/fencing=101，backend子文件任务仅write_conflict且无Attempt。解除暂停后两任务accepted；Leader经历真实auto-compaction后仍completed/released，最终两表为空（reservation-released-tables.json）。原write-locks事件证明同Agent串行/别名及目录互斥，write-check证明不同文件并行；三处越界请求HTTP400、未建Task，sentinel未变。OpenSpec 4.6勾选，当前9/71；89项为39 PASS、24 PARTIAL、26 NOT_RUN。没有运行单元测试，整体仍待其余验收。

### r24 命令帮助与旧别名一致性

实际Pi发现help只有命令名和少数参数，旧alias忽略多余参数。已补齐所有现有入口用法、管理预览及operator轮换说明；alias转交参数给同一handler。tsc通过，wM:pC真实验证help、root/Role/Run补全、三个旧alias；alias和canonical多余参数均INVALID_ARGUMENTS，快照无新增Task/Run、无模型轮。P4-A24 PASS，证据integration/evidence/r24/P4-A24.json。其余10个空闲Pi已/reload并逐pane确认，Controller仍r20/epoch3。当前40 PASS、24 PARTIAL、25 NOT_RUN；OpenSpec仍9/71（6.1其它子项尚未通过），整体未完成，无单元测试。

### r24 Dashboard同revision与观察退出

Pi原生Dashboard和Go TUI在epoch3/revision9929展示相同reviewer Primary/Secondary/owner字段，在revision10028展示同一Task的checker accepted及result_hash；均实际使用筛选、列表选择和详情。当前加载项仅adapter-entry.ts与pi-probe.ts，前者只为生产installTeamExtension添加时钟/故障点，无Herdr adapter；Herdr仅充当终端宿主与外部查看工具。Pi退出回空编辑器（0.0%上下文），Go TUI退出到zsh，Controller pid50968/epoch3及11个Pi保持，随后重新打开同Controller的Go TUI。CLI缺revision及非法run:retry均拒绝，agents list成功返回revision10264；无新增Task或人工中断事件。证据r24/dashboard-cases.json。P4-A25/P4-A38 PASS；9.1勾选，OpenSpec10/71，当前42 PASS、22 PARTIAL、25 NOT_RUN。TR-A17尚需完整Team/Agent/owner/blocker视图，未因两项详情通过扩大结论。

### r24 Primary等待队列上限与串行

真实counter-main standalone root在result后/settled前暂停。通过可见operator pane逐个CLI提交32个root Task，均queued且无Attempt；第33请求HTTP409 QUEUE_FULL，最终快照无该Task。取消其中31个，只保留第一个queued任务，其agent_affinity wait保留，未取消无关root。解除暂停后root输入/settled区间10478—10786，后继10799—10839，同Pi无重入；两个执行结果均来自实际read，独立核对count3/sum60。最终capacity/waits均空。证据r24/TR-A14-queue.json及原始CLI/pane/events；两Task仅执行completed，无acceptance，不冒称业务验收。TR-A14 PASS，P4-A10/P4-A16分别补充仅清自身wait与queued取消子项，其余仍PARTIAL。当前43 PASS、22 PARTIAL、24 NOT_RUN，OpenSpec仍10/71，无单元测试。

### r24 FIFO、queued handoff及r25按键修复

stats-team占共享reviewer期间，share-team的两个Run整体queued_run，queue_seq21/22；相同request重复提交返回同一Run。用户从reviewer-secondary Pi选中第一queued Run提交@reviewer，正式Task queued但无Attempt，无绕过ownership。事件顺序：owner释放11361→first准入11364→first释放11456→second准入11458→second释放11555，三Run全部completed/released，handoff checker accepted。TR-A33/CMD-A07 PASS；P4-A08仅重复request/FIFO子项通过，Leader离线/重绑等仍PARTIAL。夹具初次断言误用queued而非queued_run，未重复提交变更，已记录。证据r24/fifo-cases.json。

继续观察时发现r24 Pi Dashboard原始ANSI比较不识别方向键（j/k可滚动）；改为Pi matchesKey解析up/down/tab/enter/escape/backspace。r25真实方向键选择/详情上下滚动、Tab、Enter、筛选Backspace和Escape退出复测通过；保留P4-A25旧失败子项并附修复结果。tsc通过，USAGE同步，11个idle Pi已加载当前扩展，Controller仍r20/epoch3。当前45 PASS、23 PARTIAL、21 NOT_RUN，OpenSpec仍10/71；未运行单元测试，整体未完成。

### r25 Primary离线路由

确认无活动Run/lease后，仅SIGSTOP测试reviewer-main Pi pid42407，等待权威presence=offline；reviewer-secondary仍online且未提升。share-team Run可持有逻辑roster，但即时@reviewer接受须目标online，真实Pi返回ROLE_PRIMARY_OFFLINE并保留草稿，没有业务Task/目标Attempt，唯一新增Task为LeaderStep。显式取消测试Run并确认released后SIGCONT同一pid；恢复online，runtime/session/binding/primary epoch全部保持，capacity空。CMD-A06 PASS，证据r25/CMD-A06.json。

夹具第一次误断言“成员离线必须queued_run”，核对需求TR-06/TR-10后确认：Run创建检查Leader在线，Role ownership是逻辑归属；planned→accepted/即时handoff时检查成员在线，二者不可混同。此断言失败未重复提交Run、未修改产品实现，已保留记录。当前46 PASS、23 PARTIAL、20 NOT_RUN，OpenSpec仍10/71，无单元测试。

### r25 working_here、Leader正式调用及无Skill路由

share Leader先输出文字“@reviewer 这只是文字示例”并wait，权威snapshot只有完成的LeaderStep，无业务Task。用户后续普通guidance触发新的LeaderStep，原生JSONL确认唯一squad_decide dispatch创建leader-count正式Task。该Task result_proposed暂停期间，reviewer-secondary的@reviewer同Run handoff接受为queued、无Attempt，ownership仍同Run；解除暂停后两执行区间12723—12878、12894—12950不重叠。两项checker accepted，Run completed/released。调用方无模型轮/native session文件，目标完整原生会话无SKILL.md读取，正式Router不依赖预先加载Squad Skill。CMD-A08/A10/A12 PASS，证据r25/working-here-cases.json及native/probe/pane/events。

OpenSpec6.4所有关联CMD-A01/A02/A05/A06/A08现已通过，勾选后11/71。当前49 PASS、23 PARTIAL、17 NOT_RUN；未运行单元测试，剩余恢复/故障/身份/上下文子项继续验收。

### r25 准入与首次派发事务回滚窗口

在真实r20集成构建、真实Pi空闲环境，经operator故障接口分别注入ownership_acquire_each及ownership_after_acquire_each失败。两个创建Run请求HTTP400 INTEGRATION_FAULT，SQLite已提交Run/Task/Attempt/ownership/lease/write reservation及queue_seq/fencing均前后相同；无部分角色占用，无返回已接受。另将首次LeaderStep派发停在dispatch_before_intent，注入transaction_before_commit失败，并在下一次dispatch重试前再次暂停；确认已有Run的两Role ownership不变，而LeaderStep/Attempt/lease/fencing增量全部回滚。所有故障reset后只创建一个正常LeaderStep/Attempt，真实share Pi完成wait；显式cancel Run后released、capacity空。

证据r25/ownership-rollback.json、dispatch-rollback.json和transaction-cleanup.json（含可见pane与驱动源码）。这些是故障点诱发的事务回滚，不冒称真实磁盘满；P4-A11/P4-A19仍PARTIAL，容量/写冲突组合及其它窗口未扩大为PASS。当前49 PASS、24 PARTIAL、16 NOT_RUN，OpenSpec11/71，无单元测试。

### r25 两Run并发整体准入

两个HTTP CreateRun请求实际重叠17.874792ms。share-team获queue_seq26并完整持有researcher/reviewer；stats-team获27且整体queued，SQLite无其任何部分ownership。share释放14025之后stats仅准入一次14028；每个Run各一次run_admitted/roles_released，两个真实Leader均只执行wait。最后显式取消两Run并确认released、capacity空。TR-A12 PASS，证据r25/TR-A12.json；此轮没有重复迟到role_available/gap注入，不计TR-A25通过。

为隔离准入与业务工作，stats-team测试config21临时无default_workflow；收尾后恢复原default_workflow=stats并升级config22，旧Run保留各自不可变快照。当前50 PASS、24 PARTIAL、15 NOT_RUN，OpenSpec11/71，整体尚未完成；未运行单元测试。

### r25 实际provider动态块隔离与reviewer显式恢复

增强只读pi-probe：从实际provider payload的system/developer文本解析pi_squad动态块，仅保存Role/Team/Run/Task/Attempt/segment、内容hash与工具集合，不保存原始prompt/凭据。恢复后的同一reviewer历史session先执行share-team count，再执行stats-team sum；六次真实请求各仅一个当前task系统块，全部身份/role_hash/working_hash/config_hash与Controller Attempt.context一致，role/working/team正文hash逐项独立一致。TR-A30 PASS，证据r25/TR-A30-payload-checks.json，作用域仅上下文隔离。

第一次启动检查发现wM:p6已是shell（退出原因unknown），/reload及此前/squad-probe-save未执行为Pi命令；首个context Run的业务Task保持planned无Attempt，已取消释放。确认无执行占用后显式release旧runtime，再用--session恢复同一历史会话；新pid68043、runtime31c44abe-f226-4b0c-b336-65db12d34378、binding_epoch2、primary_epoch1。TR-A16仅此子项PARTIAL，旧凭据写入及Leader重绑未验。发现working-here-reviewer-probe.json为旧副本（01:22:57Z），已在working-here-cases注明不可用于该Run；CMD-A08/A10/A12仍以原native记录、事件、快照和pane为证，不用这份旧探针。

count重试Runcompleted/released。sum返回正确sum60及文件artifact，但夹具只要求sum，checker因缺count拒绝，失败快照保留并显式cancel/released；不声称业务验收成功。已修正context-sum未来夹具要求count+sum，stats config24，尚未宣称修正夹具复测。所有测试Run均released、capacity空。当前51 PASS、25 PARTIAL、13 NOT_RUN；OpenSpec11/71，tsc通过，无单元测试。

### r25 进程/Attempt/Run快照边界

真实counter父任务调用reviewer并yield，child result后/settled前暂停；另一个counter Task已接受queued但无Attempt。此时给counter role.md、agents.md和stats Team instructions分别加入不同无行为标记，并升级Team config25。解除暂停后父原Attempt segment2继续使用原context及hash；排队Task的新Attempt采用新working规则，但仍用旧Run instructions；随后新Run采用新Team指令/config，新旧Run的counter Role body/hash均保持进程启动版本。11次实际provider请求的唯一当前系统动态块与这些边界一致。父/排队/新Run业务Task均accepted，两Run completed/released。

证据r25/P4-A05.json，含修改前后hash、实际probe、控制面、完整事件和pane。已恢复原role/working/Team指令，Team config26；snapshot-count工作流作为可复用夹具保留。P4-A05 PASS，OpenSpec3.5关联TR-A30/CMD-A12/P4-A05均通过，现12/71；当前52 PASS、25 PARTIAL、12 NOT_RUN。无单元测试，整体仍未完成。

### r25 同版本异内容冲突拒绝

在现有wM现场确认Controller存活、三个Role Pi与Dashboard可见、所有Run已released且capacity为空后，临时以不同内容复用已冻结的stats-team config_version25。真实HTTP创建Run返回409 CONFIG_VERSION_CONFLICT。SQLite前后Run/Task/Attempt/ownership/lease/write reservation/queue_seq/fencing及完整config_snapshots均不变；没有接受请求或模型派发，配置26已逐字节恢复。证据为integration/evidence/r25/config-version-conflict.json及可见operator pane记录。结合已核对的P4-A01/A04/A05证据，OpenSpec2.1完成，现13/71；主场景计数仍52 PASS、25 PARTIAL、12 NOT_RUN。未运行单元测试，整体仍未完成。

### r25 standalone委派环与任务预算子项

真实counter父任务在result后/settled前暂停。operator提交self和依赖parent的child分别得到CALL_CYCLE，驱动数据库与parent依赖/revision不变断言通过；20个合法child均queued且无Attempt，第21个TASK_BUDGET_EXHAUSTED。收尾逐个取消child使用旧snapshot revision时遭409 REVISION_CONFLICT，导致内存原始响应报告未落盘；保留原驱动和终端错误，不声称完整原始响应证据。解除暂停后按最新parent revision显式cancel，21个Task最终全部cancelled，capacity/waits为空，真实counter显示Operation aborted。

TR-A28仅PARTIAL，详见integration/evidence/r25/TR-A28-progress.json；Team、ancestor、depth、retry预算及原始响应补证仍待完成。当前52 PASS、26 PARTIAL、11 NOT_RUN，OpenSpec13/71；无单元测试，整体未完成。

### r25 父写资源冲突与Team预算

write-reservation真实frontend父任务完成write/read、在result后/settled前暂停，SQLite中保留目录write reservation与segment lease。对backend提出同目录、目录内文件两个child请求，均409 RESOURCE_DEPENDENCY_CONFLICT；self及依赖parent的child均409 CALL_CYCLE。每次原始请求/响应、数据库实体/资源、parent依赖/revision即时落盘，拒绝后均不变。随后18个child接受为queued、无Attempt，加工作流原有2个业务Task达到20预算；再提交明确TASK_BUDGET_EXHAUSTED。

先显式cancel Run，确认cancelled/reconciling后解除测试暂停；真实frontend报abort，随后Run released，ownership/lease/write reservation/affinity及waits均空。P4-A14 PASS；TR-A28补Team环/任务预算子项，ancestor/depth/retry及standalone原始响应补证仍待完成。证据integration/evidence/r25/P4-A14.json、team-cycle-write.json及pane/driver。当前53 PASS、26 PARTIAL、10 NOT_RUN，OpenSpec13/71；没有单元测试，整体未完成。

### r25 Team祖先/深度与standalone重试预算

新增可复用depth-boundary工作流，stats config27。真实counter→summer→reviewer→backend形成depth0/1/2/3链；末端result后/settled前暂停时，summer调用counter被409 CALL_CYCLE拒绝，backend再委派frontend被409 DEPTH_LIMIT拒绝。原始响应和数据库/父依赖/revision前后均保存且不变。解除暂停后原链逐层续接，四任务全部accepted，Run completed/released，证明拒绝未损坏原链。证据r25/team-depth-boundary.json及真实pane。

另由reviewer-secondary执行standalone数字读取，显式retry形成三个Attempt，retry_of逐项链接且runtime/session/binding相同；第三Attempt result暂停时第四次retry返回ATTEMPT_BUDGET_EXHAUSTED，Task与实体/资源不变。显式cancel成功后解除暂停，真实Pi abort，三个Attempt均released，capacity为空。证据r25/standalone-attempt-budget.json及原始CLI输出。前两次仅execution completed，不冒称human业务验收；此次专验预算。

TR-A28仍PARTIAL，待standalone祖先/深度、先前standalone原始拒绝响应补证及Team重试预算。主计数53 PASS、26 PARTIAL、10 NOT_RUN，OpenSpec13/71不变。无单元测试，整体未完成。

### r25 TR-A28委派环与预算收口

standalone首次四层夹具根Pi持续重复文字、未建child；保存原始pane/snapshot，显式cancel释放，原因unknown。空闲时/new并改用更短中文描述，以新request重试，reviewer-secondary→counter→summer→reviewer形成真实depth0—3链。self/ancestor/dependency分别CALL_CYCLE，depth4请求DEPTH_LIMIT；随后17个queued child加原链3个后代达到20预算，额外请求TASK_BUDGET_EXHAUSTED。逐条保存原始请求/响应、父版本和数据库对照，拒绝无变化；始终仅4个原链Attempt。显式取消后21个Task全cancelled、四Attemptreleased。此前standalone缺原始响应的限制由本次新证据补齐，旧失败仍保留。

Team以config28冻结max_attempts_per_task=1，真实counter首Attempt result暂停时第二次retry被ATTEMPT_BUDGET_EXHAUSTED拒绝，Task/资源不变；显式cancel Run后解除暂停，最终cancelled/released。未来配置已恢复原3次预算并升config29。结合前轮Team self/dependency/ancestor/depth/20任务及standalone三Attempt拒绝，TR-A28完整矩阵通过，证据integration/evidence/r25/TR-A28.json。

最终所有Run released，ownership、execution lease、write reservation、agent affinity及waits为空，无pause控制文件。当前54 PASS、25 PARTIAL、10 NOT_RUN；OpenSpec仍13/71（相关复合任务其它用例未齐）。无单元测试，整体未完成。

### r25 planned、显式rebind与旧Run草稿验收

新增rebind-boundary工作流/config30：frontend持目录写资源、counter作为前置，backend依赖counter，reviewer依赖frontend。两前置result暂停时，backend/reviewer均planned、target=null；空闲backend/new到binding2不冻结planned目标。counter完成后backend才accepted并冻结binding2，因写冲突无Attempt。再次/new到binding3，旧任务needs_review且Run hold，不自动跟随。planned rebind、已有Attempt rebind、旧CAS分别INVALID_REBIND_STATE/RETRY_REQUIRED/REVISION_CONFLICT且无变化；合法rebind记录epoch2→3完整审计、不建Attempt、不解除hold。

frontend完成后，依赖已就绪的reviewer仍planned/null target，无Attempt。显式resume后backend/reviewer才执行；四步均accepted，Run completed/released。真实Secondary选Run后/new提交旧草稿显示NO_ACTIVE_TEAM_CONTEXT；再次选活跃Run保留草稿至Run结束再提交显示RUN_TERMINAL，0%模型上下文、没有新增Task/Run。测试草稿随后清理。

P4-A09 PASS，证据integration/evidence/r25/P4-A09.json；结合TR-A28，OpenSpec4.9完成，现14/71。当前55 PASS、25 PARTIAL、9 NOT_RUN，最终角色/执行/写/affinity资源为空。无单元测试，整体未完成。

### r25 queued Leader离线/绑定变化与FIFO收口

owner stats Run queue37持有角色时，share first queue38与stats later queue39整体排队。share Leader空闲/new使实际binding1→2，queued Run仍固定旧绑定；随后仅暂停该测试Pi pid50231。owner完成释放后first因leader_offline仍queued且全Project ownership为空，later因earlier_run未越过。SIGCONT同一进程后first明确binding_changed仍不准入；不确认的resume返回LEADER_REBIND_REQUIRED且无状态变化，显式expected-runtime/rebind-current恢复后审计保留old/new binding，原queue38不变。

完整事件验证owner释放→first唯一准入→first释放→later唯一准入；三个Run均completed/released，执行、角色、写与affinity资源/等待为空，share Leader已恢复运行。证据integration/evidence/r25/P4-A08.json，结合r24命令创建、重复request、同队FIFO证据，P4-A08 PASS。P4-A08/A09/A24齐全，OpenSpec6.1完成，现15/71；当前56 PASS、24 PARTIAL、9 NOT_RUN。没有单元测试，整体仍未完成。

### r26 共享状态投影补齐与TR-A17

检查发现Team视图只有config/hash/instructions/workflows，缺少当前运行总览。新增只读projection/overview.go，在同一snapshot读事务的已有行上汇总Team Leader/current binding、active/queued Run、成员状态；Run提供明确命名current_roster及非授权next_step，Agent Secondary增加standalone_only。Go TUI列表显示身份与队列数量，Pi Dashboard直接复用投影。生产Go与正确tag集成构建通过，无单元测试。

确认全部Runreleased后，在wM:p1更换r26 Controller，同一DB升级到epoch4，endpoint63136、pid79454，11个Pi恢复online；p2重新打开对应r26 TUI。实际share Run占用reviewer、stats Run排队，Go Team/Role/Agent与Pi Team详情和API一致；Leader/session/epoch、owner、阻塞、Attempt/affinity/lease、Secondary standalone且不计Team容量均有可见证据。UI检查暂停过久触发deadline及随后lease_expired，故障状态/owner保持可见；不宣称这两个业务Run通过，已显式取消、解除暂停并确认全资源释放。Herdr逻辑Enter本轮未可靠展开Go详情，标准CR可用，未扩大为键盘兼容性通过。

TR-A17 PASS，证据integration/evidence/r26/TR-A17.json；OpenSpec2.8/7.1完成，现17/71。当前57 PASS、24 PARTIAL、8 NOT_RUN。USAGE、构建清单和旧版本/失败证据同步保留，整体仍未完成。
