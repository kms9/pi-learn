# HTTP 运行实例与纯文本通信切片

2026-09-24；implementation_status: implemented；acceptance_status: partial。可见证据见 `RESULT.md`。不是旧 UDS 02 阶段通过。

本切片沿用当前 Gin HTTP Controller，不实现旧 UDS 文档中的整套 CLI/任务合同。配置与工具唯一说明见 [USAGE](../../pi_squad/USAGE.md)。本目录负责验收，不复制第二份使用说明。

## 已实现契约

- 逻辑 agent_id 独占，进程 UUID + 私有凭据哈希校验；会话切换按 previous_session_id 比较更新；心跳不再更新 session。
- 显式 operator release 比较 expected_runtime_id，永久撤销旧 UUID；离线不释放，旧数据库身份不被隐式接管。
- 消息冻结双方 agent_id/runtime_id/runtime_session_id，同队路由；Controller 落库与 request_id 幂等；收件/确认需要当前目标凭据。
- notice 只显示；ask 异步，在目标空闲且无 pending 输入时触发受限模型轮，只能读原消息及回复原消息；reply 不自动触发模型。
- 每目标绑定最多 32 条待处理项，文本 64 KiB，有效期 10 分钟。离线留失败记录不自动补投；队列过期/会话变化不自动投递。
- injection_requested 不等于回答成功，故障后不自动重放该状态；不承诺 exactly-once 模型执行。

## 交给 Claude 的检查

必须读根和 `pi_squad/AGENTS.md`；新 Herdr workspace，独立端口/DB，Controller、Dashboard 与三个 Pi 分 pane；不触碰其它服务。开发者只运行编译/类型/语法检查。

| 项 | 必须观察的结果 | 当前 |
|---|---|---|
| ID-01 | 不同 UUID 注册同 ID 被拒，offline 后仍拒；凭据不能从发现结果取得 | PASS |
| ID-02 | 缺失/错误 token、旧 UUID 心跳/收件/确认拒绝，不能改 last_seen/session | PASS |
| ID-03 | expected UUID 错误 release 拒绝；正确 release 后旧 UUID 重新注册也拒绝，新进程可注册 | PASS |
| ID-04 | /new 保留 UUID，更新 session；旧 session 心跳不能改回；/reload 不释放 | PASS |
| MSG-01 | A 按角色找到 B，以 agent_id + UUID/session 发 notice；B 可见一次，C 不收到，B 不自动调用模型 | PASS |
| MSG-02 | B reply 原 message_id，A inbox 见 reply_to，原消息变 replied；冒名/串消息拒绝 | PASS |
| MSG-03 | A ask 后立即返回 ID；B 空闲自动调用 reply_message，工具限制生效；不循环回复 | PASS |
| MSG-04 | B 正忙时 ask 不抢占，空闲后处理；用户输入竞态不抢用户执行槽 | PASS |
| MSG-05 | 同 request_id 同内容返回同一 ID，不同内容 409；重复 poll/ack 不重复显示或触发 | PASS |
| MSG-06 | 离线明确失败且不补投；超时/满队列明确结果；更换绑定旧消息不串入 | PASS |
| MSG-07 | /new、resume、/reload、Controller 重启、注入结果不明窗口，无假成功/自动重复模型轮 | PARTIAL |
| MSG-08 | 入站正文包含 /new、shell 文本不执行；入站 ask 不能调用 bash/edit/write/其它工具 | PASS |
| REG-01 | 三角色加载/注册、whoami、Dashboard、list_agents/get_agent 无回归 | PASS |

旧 `agent/registry_test.go`、HTTP tests 和 P0 smoke 有旧契约（无 token/UUID、任意覆盖、heartbeat 改 session）断言，需迁移 fixture 并把原覆盖行为改为拒绝断言，不可直接删除失败用例。可增加协议层测试，但不能替代可见真实 Pi 证据。测试/报告由 Claude 负责；实现问题回报开发者修复。

## SSE 增量验收（2026-09-24，全部 NOT_RUN）

实现追加 SSE 唤醒通道；旧 PASS 只对应旧轮询版本，不能直接作为新版通过证据。开发侧补了 `controller/agent/events_test.go` 与 `extension/inbox-stream.test.ts`，仅静态检查，执行与扩展由 Claude 负责。

| 项 | 检查与通过依据 | Intercom 对照 | 当前 |
|---|---|---|---|
| SSE-01 | 三个不同角色均 mode=sse；空闲 notice 到目标不再等待 1 秒轮询，记录多次 commit→received 时间 | 精确路由、收据 | PARTIAL |
| SSE-02 | 连接建立前/期间落库、断线期间落库，重连初始补查不漏待处理消息 | reconnect + delivery ID | PASS |
| SSE-03 | 多个 wake 合并、重复 wake、读取进行中又来 wake，均不漏拉且不重复注入 | duplicate IDs / no reinjection | PASS |
| SSE-04 | /new、/reload、release 后旧 stream/回调停止；错误 token/旧 session 无法订阅；同 ID 新连接替换旧连接，旧 cleanup 不关闭新连接 | stale overlay / shutdown / endpoint epoch | PARTIAL |
| SSE-05 | 停止 Controller 后回退轮询，原 DB 恢复后重连；慢读、无 keepalive、协议分片有界处理，不阻塞 send；SSE 不续 last_seen | half-open liveness | PARTIAL |
| SSE-06 | 404 兼容轮询、401/409 停止该代 SSE 重连；URL、事件与诊断不含 token | protocol validation | PASS |
| FLOW-01 | 两个发送者同时 ask 同一 B，均立即返回 ID，B 按队列处理、回复准确关联 | ReplyTracker | PASS |
| FLOW-02 | B busy 不注入；用户输入竞态 deferred；ask 工具上限生效 | 队列断言，不是 steering | PASS |
| FLOW-03 | 同 request_id 同内容返回原结果，不同内容拒绝；offline 不补投 | fingerprints | PASS |

必须同时完成前面的 ID-01—04、MSG-01—08、REG-01 和旧测试 fixture 迁移；不要仅验收 SSE 后宣布第二阶段完成。先按最新 `pi_squad/AGENTS.md` 关闭确认属于上轮测试的 space，再新开测试 space，正常 Pi 必须从当前项目 cwd 启动。报告区分开发单测、协议集成与真实 Pi pane 证据。
