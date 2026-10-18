---
title: DSH Squad：迁移验收与协作策略对照实验
type: process
status: draft
created: 2026-10-18
updated: 2026-10-18
tags: [dsh-bot, acceptance, evaluation]
---

# DSH Squad：迁移验收规范

> 全部为**计划测试 / NOT_RUN**，尚无 DSH Adapter 联调记录。原 Pi Stage04 的 Pi 1.0.1/TUI 89/89 PASS 只可作为测试判据参考，**不能继承为 DSH 通过结果**。

## 证据与状态

实际测试必须记录 `case_id、run_id、task_id、attempt_id、segment_id、bot_id、role_id、group_id、dsh_version、dsbot_sha、controller_sha、adapter_sha、provider/model/effort、config_hash、tool_set、artifact_hash、event_timeline、token_usage、human_actions、result、evidence_ref`。敏感凭据和原始私人会话不直接提交。

状态只有 `NOT_RUN / PASS / FAIL / PARTIAL / BLOCKED`。PASS 必须附真实运行证据；FAIL 保留原记录，复测新增 Run ID，不能覆盖。PARTIAL、BLOCKED、NOT_RUN 不计通过。

## M0：非开发用户自由协作体验

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M0-01 | 用户只打开 Web 使用四 Bot 群聊 | 不需要 Pi/Herdr/Go 命令行 |
| DSH-M0-02 | Chief/Reviewer 配置不同 Provider 模型 | 实际模型路由各自正确 |
| DSH-M0-03 | `@Bot` / 普通 Handoff / 长期记忆 | 交互和回传正常，无正式 Squad Task |
| DSH-M0-04 | 页面刷新、宿主重启、不同试用者 | Session 历史正常且不存在跨用户数据暴露 |

## M1：受控输入与执行证据

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M1-01 | 正式 Task 受理→输入→工具→结果 | 有精确 Session/Attempt/Fence 与真实收尾证据 |
| DSH-M1-02 | 同 request_id 重复、HTTP 重连、重复 Event | 不产生重复 Task/Attempt 或模型执行 |
| DSH-M1-03 | `@Bot` / `message_bot` / `post_to_group` 绕行 | 未经 Controller 许可不能执行模型工作 |
| DSH-M1-04 | 定时、原生 Session Prompt、恢复重投 | 不绕过受控 Gate |
| DSH-M1-05 | 入队前后网络断开、Host 重启 | 不确定执行保持隔离，不自动重放 |
| DSH-M1-06 | result_proposed 但工具未收尾 | 不显示完成/已验收、不释放资源 |
| DSH-M1-07 | Session 切段、旧 Epoch / 迟到事件 | 不可污染新 Binding 或 Attempt |
| DSH-M1-08 | nested run_code、任意 shell、未授权 MCP/路径 | 实际工具被代码拒绝并有证据 |
| DSH-M1-09 | 模型不可用或 Effort 改变 | 严格实验不静默 fallback |
| DSH-M1-10 | 用户取消、再次恢复 | 取消不是停止证明；对账后按权限明确恢复 |

## M2：真实 DAG 与验收

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M2-01 | 并行无依赖步骤与有依赖步骤 | 按容量执行，未就绪不派发 |
| DSH-M2-02 | Builder Artifact → Reviewer | 审查具体 result/artifact 版本，作者与审查 Bot 不同 |
| DSH-M2-03 | Reject → Rework → Re-review | 新节点与新版本，保留拒绝历史 |
| DSH-M2-04 | 用旧卡通过新 Artifact | 版本冲突被拒绝 |
| DSH-M2-05 | 模型说“已完成”而缺结果/settled | Acceptance Gate 拒绝 |
| DSH-M2-06 | 必要 child 未结束，父尝试完成 | 不允许产生提前成功 |
| DSH-M2-07 | 生成 HTML/JS 课件预览 | 隔离主站 Session、Cookie 和控制接口 |

## M3：Web 与策略收益

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M3-01 | Web/SSE 断线与旧 Snapshot | 再取权威投影，不错误显示 PASS |
| DSH-M3-02 | 回答问题 / 批准工具 / 验收成果 | 分别操作、有授权与精确 expected_revision |
| DSH-M3-03 | Free 与 Managed 同任务对照 | 模型、工具、记忆、输入和结果可追溯 |
| DSH-M3-04 | 包含 compaction/memory/vision 辅助调用 | 用量计入总成本，价格估算标注口径 |

## M4：跨 Team 与恢复

| ID | 场景 | 通过要求 |
|---|---|---|
| DSH-M4-01 | Team A/B 共享 Reviewer，C 独立 | B 原子 FIFO 等待，C 并行，A 释放后 B 准入 |
| DSH-M4-02 | capacity=1 Child/yield | 原 Attempt 安全暂停与续接 |
| DSH-M4-03 | Host/Controller 崩溃、迟到结果、角色换人 | 旧绑定隔离、未知工作人工对账 |

## 对照方法

建议五组：S 强单 Agent；A DS Bot Free；B Managed Task DAG；C B+Independent Review/Acceptance；D C+高级资源调度（M4）。

固定每组任务、模型/effort、数据、工具权限、独立工作目录及初始个人/团队 Memory。不要使后一组继承前一组的学习成果。长记忆的真实用户体验另做产品可用性评估。

主要记录端到端成功率、错误完成率、Reviewer 缺陷检出及误报、返工、总 Token/辅助模型成本、等待和耗时、人类干预及故障安全恢复。**演示成功不能替代实验统计，故障注入通过不能推导自然任务质量提升。**
