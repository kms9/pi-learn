---
title: 阶段 04 冲突审查、实施顺序与文档统一
type: session
status: active
created: 2026-09-27
updated: 2026-09-27
tags: [pi-squad, phase-04, requirements-review, implementation]
---

# 阶段 04 冲突审查与文档统一

## 用户请求与核查基线

用户要求全面检查 `pi_squad_dev` 的阶段04需求冲突，补充实施顺序和关键检查点，将五份文件合并为统一需求及技术设计并推送当前分支。

读取基线为 `cdae80379685ff5c79621117712ce9f53ddefe1c`；核查原五文件、阶段03的任务/续接/人工介入规则、当前消息输入和工具限制、仓库目录/Controller技术栈/验收规范，以及固定Pi关键API。

## 产出

- [统一需求与89项验收](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_REQUIREMENTS.md)：18个需求域，保留TR-A01—33与CMD-A01—16，增加P4-A01—40。
- [统一技术设计](../../pi_squad_case/04-team-orchestration/TEAM_RUNTIME_DESIGN.md)：C01—C20冲突和歧义处理、schema/API/状态/事务/输入契约、M0—M8实施顺序、逐功能来源与不采用边界。
- [README](../../pi_squad_case/04-team-orchestration/README.md)只保留导航；旧TUI稿并入，superseded PLAN从当前目录移除。历史内容保留在固定基线和Git历史，不恢复其中旧目录或旧调度规则。
- 总验收索引同步为160项，其中P4为89项。计划清单不等于测试结果，已有阶段结果不被重置。

## 关键收口

原有多Team、单Leader、单Primary、单Action Run、单Agent正式Attempt的约束不变。本轮在用户授权补全下给出实施默认：同Team单active Run加FIFO；Task级blocker集合；父任务逻辑affinity与实际模型执行segment/lease分离；显式Run创建和选择；@role与同名文件显式消歧；共享InputClassifier；Dashboard只读投影与显式Controller操作分开。

offline不等于旧Pi已停止，不再允许只凭offline抢占身份。yield只释放已settled的实际执行额度，不能把父会话给无关任务；父子相同写资源请求在V1明确拒绝。普通用户输入与关联handoff/amend分别处理，故障或介入向等待祖先传播明确失败。

Review消费已正常完成但尚未accepted的候选结果；业务后继默认要求accepted，避免审查等待自身通过。review和最终Gate绑定当前任务/结果/产物版本。cancel、failed和TTL不能替代安全清理证明。

## 参考来源及状态

Pi固定gitlink为 `890f920884f6d21fc7617d236ef9e1cc5d7a0ef8`；复读了autocomplete wrapper示例和UI/生命周期/上下文关键类型。Multica、Pi Agent Teams、Intercom、Subagents及Herdr按仓库已有固定源码研究关联到具体功能，不声称本轮重新审计全部上游。SQLite官方事务/WAL只支持底层事务选型，不自动提供应用层正确性。

PR #3 的context assembly提案在核对时仍未合并，本轮没有自动合并/关闭它，也没有把其CTX-01—14计为当前分支独立用例。必要上下文原则依据当前Pi API和本项目规则在统一设计中明确，来源状态单列。

## 验证边界

本轮是文档/源码静态审查和文档整合，不实现P4功能、不移动真实配置、不升级submodule、不启动或重启用户Pi/Controller，也不派发Herdr运行验收。需求和技术设计继续标记not_implemented/not_run。实际功能与89项运行验收必须由后续M0—M8逐项提供证据。

技术文档包含可运行的文档一致性检查示例和具体故障检查点；该示例的存在本身不等于已经执行。最终提交需核对文件清单、目标分支和远端内容，不用“文档合并”冒充“阶段通过”。
