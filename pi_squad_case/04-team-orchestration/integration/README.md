# 整体集成验收记录

按 2026-09-27 用户要求，全部需求开发完成后统一运行，不新增或运行单元测试。

`cases.json` 保留 89 个主 ID（4a 71 / 4b 18）。每轮在 `runs` 追加输入、版本、事件 seq、实体 ID、产物 hash、失败与复测证据，不能覆盖旧轮次。子断言逐条附证据，主 ID 旧 PASS 不能覆盖新增子项。当前整体集成进行中，逐项状态见 `cases.json`，现场与失败/复测记录见 [RESULT.md](RESULT.md)；未覆盖项保持 NOT_RUN。

独立 CLI/HTTP/SQLite 子断言与尚缺边界见 [Controller 边界证据索引](CODEX-BOUNDARIES.md)，合成 adapter 的结果不替代真实 Pi 验收。

INV-01—15 映射使用 [需求 2.6](../TEAM_RUNTIME_REQUIREMENTS.md) 与 [OpenSpec 追踪表](../../../openspec/changes/pi-squad-team-orchestration/tasks.md)。真实 Pi 场景按插件 AGENTS：新测试 workspace、当前项目 cwd、至少三个 Role、独立 Controller/Dashboard；多 Team 场景 Project capacity≥4。

单轮记录字段：`run_id`、`started_at`、`versions`、`handoff_id`、`callback_pane_id`、`callback_terminal_id`、`workspace_id`、`inputs`、`entity_ids`、`event_range`、`artifact_hashes`、`subcriteria`、`status`、`failure`、`retest_of`。不得保存 token。

## 整体集成的运行探针和故障入口

- Controller 使用 `go build -tags pisquad_integration` 的独立二进制；仅此构建注册 operator-only `/v2/__integration/fault`。`pause`/`fail` 配置命名窗口，`release` 释放，`reset` 清理；`now` 设置 fake clock。
- Pi 使用本目录 `adapter-entry.ts` **替换**生产扩展入口，不可同时加载两份；生产入口不导入故障实现。控制文件位于 `.runtime/integration-adapter/<agent_id>/<point>.json`，内容 `{"action":"pause"}` 或 `{"action":"fail"}`；删除文件释放暂停。观察文件只含窗口名、时间、动作。`result_after_commit_before_settled` 在结果请求已完成且传输串行队列已释放后暂停工具返回，续约继续；不能用阻塞续约造成的 lease_expired 冒充会话切换中断。
- TS 窗口：`before_final_gate`、`input_after_injection_before_ack`、`result_after_commit_before_settled`。Go 窗口包含事务前后、Task 持久化前后、逐个 ownership 获取前后（`ownership_after_acquire_each` 可在事务已写入一项后失败，验证整组回滚）和 dispatch intent 前。
- 本目录 `pi-probe.ts` 最后加载，以 `/squad-probe-save` 显式保存脱敏事件序列、payload hash/大小/Task ID/工具名；报告位于 `.runtime/integration-probes`。不记录完整 prompt、headers、环境或凭据。事件“出现”不等于场景通过，必须对照顺序、故障窗口和期望副作用核对。
- selector 取消、实际 /new /fork /tree /resume、manual/auto compaction、`!bash`、重试和后置扩展改写仍需在真实 Pi 中逐场景观察。未观察的能力保持 NOT_RUN。

## 可复现的事务窗口集成

[`transaction-windows.py`](transaction-windows.py) 连接**已在可见 pane 启动的隔离 integration Controller**，使用该 Project 中已有 Role 的合成 busy adapter，实际调用 HTTP 并核对 SQLite 投影。它不启动 Pi，不算真实模型验收。故障点会影响该 Controller 的事务，因此使用独立 fixture Project，不能指向正在承载其它测试的 Controller。

```bash
python3 pi_squad_case/04-team-orchestration/integration/transaction-windows.py \
  --project-root <isolated-fixture-project> --role counter \
  --output <new-evidence-file.json>
```

覆盖提交前回滚与提交后响应失败、同键重试只有一份 Task；最后显式取消其任务并撤销合成 runtime。输出文件必须不存在，避免覆盖失败历史；报告不保存凭据。已执行记录见 `evidence/codex-transaction-driver-r15.json`。

探针现记录任务 section 的 Task/Attempt/segment 及 provider payload 是否包含这组身份；doctor 只接受有序的完整生命周期作为核心 hook 观察证据，跨输入/会话/实际树切换/user_bash 不拼接证据。`ordered_core_lifecycles` 可用于定位原始 seq；依旧不替代 U/E/R/F 场景证据。旧报告保留，不回填或伪造缺失字段。

多Team夹具：stats-team与share-team共享reviewer，share-team另有researcher；audit-team只含auditor。需要Projectcapacity≥4，各Team额度显式记录；reviewer-secondary只用于验证非Primary普通工作。`controller-direct.yaml`仅用于隔离验收Controller的只读standalone白名单，不是产品默认授权。
