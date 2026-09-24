---
title: 2026-09-24 运行实例校验与 HTTP 消息开发
type: session
status: active
created: 2026-09-24
updated: 2026-09-24
tags:
  - project-wiki
  - session
  - pi-squad
---

# 2026-09-24 运行实例校验与 HTTP 消息开发

## 用户要做什么

先补 UUID 运行实例校验，再按建议开发相互通信，交 Claude 检查。

## 达成了什么

- Controller 拒绝不同 UUID 覆盖 agent_id；增加私有进程凭据哈希、会话比较更新、显式 operator release 与持久撤销 UUID。离线不释放身份，衔接 [[decisions/2026-09-21-squad-ownership-and-suspect]]；未实现该旧合同全部 binding_epoch/租约状态机。
- HTTP send/inbox/get/receipt 与 SQLite 消息记录；固定双方进程和会话、request_id 幂等、同队限制、有限队列、收件确认和离线失败记录。普通消息只展示，回复必须关联原消息。
- Extension 每秒收件；send_message、read_inbox、get_message、reply_message 和 /squad-inbox。ask 在空闲时触发受限模型轮，仅允许原消息读取与回复；用户介入或没有回复工具事件不标成功；reply 不自动触发新模型轮。
- /new 更新会话并隔离旧队列，/reload 清理轮询与心跳；已申请注入但结果未知的 ask 不自动重放。进程凭据不进入模型工具参数、whoami 或发现结果。
- 当前是开发完成待验收，非旧 02 阶段全部通过。自动问答限制只服务本阶段入站消息，不引入 tools/model/skills 配置或智能体历史管理。

## 写回了哪些 wiki 页

本页、主索引、日志；已同步 `pi_squad/USAGE.md` 和 Controller README。验收清单：`pi_squad_case/phase_02_http_messaging/README.md`。

## 未决

- 真实 Pi 运行、身份/会话竞态、失败窗口及回归由 Claude 在独立 Herdr workspace 执行；旧无凭据/覆盖式测试需要迁移到新契约。
- UUID 是实例标识，私有 token 才是持有者凭据；HTTP operator release 是本机协作接口，不是多用户鉴权系统。未承诺 exactly-once 模型执行。

## 相关页面

- [[sessions/2026-09-24-squad-messaging-readiness]]
- [[concepts/pi-squad]]
- [使用说明](../../pi_squad/USAGE.md)
- [验收清单](../../pi_squad_case/phase_02_http_messaging/README.md)

## Claude 首轮验收后的阶段判断

依据 `pi_squad_case/phase_02_http_messaging/RESULT.md` 与 Claude wB:p1 最新回答：当前为 partial，第二阶段不能标为完成。wE / 18791 已证明 notice 精确投递、显式关联回复、发现注册回归；在线同 ID 冲突、release 与纯文本不执行只有部分边界证据。

未测关键项：真实模型 ask/reply、busy/用户输入竞态、错误凭据与撤销 UUID 重放、/new/resume/reload 隔离、幂等去重、offline 不补投、超时/满队列及 Controller 重启窗口；旧测试 fixture 也未迁移。MSG-02 的 PASS 记录只给出了正常回复证据，没有给出清单中冒名/串消息拒绝的证据，不能据此认为其全部子项已覆盖。

结论：基础消息往返已打通，第二阶段完整验收尚未完成；未发现缺陷不等于未测项通过。下一步先完成真实 ask 和 busy，再补身份/会话/失败窗口及回归，按现有清单收口后才推进任务委派阶段。本次仅复核报告，未启动新测试或改验收状态。
