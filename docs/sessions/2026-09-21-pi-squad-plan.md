---
title: Pi Squad 本地实验的需求确认与六阶段规划
type: session
status: draft
created: 2026-09-21
updated: 2026-09-21
tags:
  - project-wiki
  - pi-squad
  - multi-agent
---

# Pi Squad 本地实验规划

本次用户确认：macOS 优先、单机同用户、已注册 Pi 可发现；只调用在线 Agent，不自动启动、重启或接管进程；任务进入目标既有会话，用户手动 `/new`；记录恢复、故障识别、显式续跑；固定小队预设权限内自动协作，无逐次审批。Go 实现控制面，TS 仅适配 Pi extension。Herdr 不是前置依赖，位置不作 agent_id。

按用户要求，从 main `2ee5bd7995d1504f73aa5955181f3b9fa5289b8e` 新建 `pi_squad_dev`；实验内容位于 [pi_squad_case](../../pi_squad_case/README.md)。本次提交需求、技术方案和验收文档，没有实现功能代码，没有执行 Pi 运行验收。

六份文档依次验证：单 Pi 身份闭环、三 Pi 相互发现、定向消息/问答、正式任务委派与结果、小队分工/审查/返工、可选 Herdr 位置与观察。共75个计划用例，均 NOT_RUN；每份包含最终目标、本阶段验证点、拟建文件、用户操作、通过/失败标准、恢复与回退。

关键设计：agent_id/runtime_id/session_id 分离；连接及会话代次防旧回包；ask/invoke 异步返回关联ID；既有会话只允许一项正式活动任务；result_proposed、运行 settled、业务验收分开；未知执行不自动重投；小队复用同一 Task Router。

源码依据固定到 Pi、Intercom、Subagents 的现有 gitlink，以及 Agent Teams、Multica、Herdr 的明确外部 commit。详细文件、函数、阅读范围与不照搬部分见 [SOURCES](../../pi_squad_case/SOURCES.md)。未修改上游 submodule，未新增远程或多 runtime 的运行依赖。

后续从阶段00“创建身份→手动运行Pi→whoami→/new→重开”开始，以真实用户闭环逐项验收；不要把文中的拟实现 squad 命令误认为已经可用。
