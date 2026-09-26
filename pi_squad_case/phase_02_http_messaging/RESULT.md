# HTTP 消息与 SSE 验收记录

日期：2026-09-24
handoff：`squad-sse-review-20260924-02` followup
当前可见环境：`squad-sse2` / `wG`，`127.0.0.1:18811`，库 `/tmp/pi_squad_r2_18811.sqlite`
阶段结论：**PARTIAL**。不是旧 UDS 02 通过。实现未改。

这是合并后的当前状态。下面每一行覆盖同名旧记录，旧的 NOT_RUN 不再有效。

## 现场

| pane | 内容 |
|---|---|
| `wG:p1` | Controller |
| `wG:p2` | Dashboard |
| `wG:p5` | reviewer-r2，cwd `/Users/logo/self_repo/pi_case` |
| `wG:p3` | backend-r2 |
| `wG:p4` | scribe-r2 |

## 当前逐项状态

| 项 | 状态 | 已覆盖的子项 | 未覆盖 |
|---|---|---|---|
| REG-01 | PASS | 三角色从项目目录注册，whoami 路径正确，Dashboard 在线 | 无 |
| ID-01 | PASS | 协议：不同 UUID 不能覆盖；在线第二进程 409 | 无 |
| ID-02 | PASS | 协议 fixture：错误 token 的 heartbeat/send 被拒。未打印真实 Pi token | 无 |
| ID-03 | PASS | 错误 release 409；撤销后旧 UUID 拒绝；新 UUID 可注册 | 无 |
| ID-04 | PASS | 真实 `/new`：runtime_id 保持 `16e4574a-c4ac-4d58-ae87-2eac03614661`，session 从 `01a0d2ee-5731-749e-98de-072fbddf9a16` 变为 `01a0d2f9-3c35-749e-98de-0731661eb9f7`，仍注册。协议：旧 session 心跳不能改回。`/reload` 后仍 online，没有释放 | 无 |
| MSG-01 | PASS | notice 只到目标；本轮三条 notice 都在 backend inbox，status=recorded，没有开模型轮 | C 不误收是上一轮 scribe pane，本轮未再拍 |
| MSG-02 | PASS | reply_to 与 replied；协议拒绝非收件人 reply | 无 |
| MSG-03 | PASS | ask 立即有 ID；B 用 reply_message 回答且不串答 | 无 |
| MSG-04 / FLOW-02 | PASS | harness：busy 不注入，空闲后只注入一次；claim 与注入之间的用户输入走 deferred 且不调用 sendMessage；主动 bash/edit/write/其它工具 block=true | 没有再做一次真实 Pi 忙碌画面 |
| MSG-05 | PASS | 协议：同 request_id 同内容同一 ID，不同内容 409。harness：重复 wake 不第二次通知同一 notice | 无 |
| MSG-06 | PASS | 三个子项都有协议证据：offline 记录不补投；满 32 条拒绝；时钟拨过 10 分钟后待处理项不再可投递 | 无 |
| MSG-07 | PARTIAL | smoke 重启自己的 Controller 后身份还在。`wG` 同库重启后 mode=sse、reconnects=4。这只证明连接恢复 | 没有证明断线期间落下的消息在重连后被 Pi 补查到 |
| MSG-08 | PASS | harness 主动违规 tool_call 被 block。真实 ask 正文含 `/new` 未被执行 | 无 |
| SSE-01 | PARTIAL | mode=sse。协议 5 次 send 开始到 received receipt 观察上界：1.045ms、0.916ms、0.862ms、1.066ms、1.109ms。含 HTTP 和测试调度，不是 commit 时间戳 | 没有 Pi 侧 received 时间字段，不能报 SSE 端到端精确值 |
| SSE-02 | PASS | 协议：流关掉之后落库的消息仍是 stored；新连接有初始 inbox 事件，随后 inbox 仍能读到该条。这是补查可用性，不是只看 mode=sse | 无 |
| SSE-03 | PASS | harness：读取中的 wake 会再补查；重复 wake 不重复通知 | 无 |
| SSE-04 | PARTIAL | httptest：错误 token 409 不能订阅。harness：shutdown/reload 代际后迟到 inbox 不注入。替换连接会关闭旧 watch | 没有单独断言“旧 cleanup 回调不会关掉新流之后新流仍能收到下一条 wake” |
| SSE-05 | PARTIAL | 写期限夹具：Write 阻塞到 SetWriteDeadline 后返回，耗时落在 4–8 秒。这不是把 TCP 缓冲写满。同库重启后连接恢复 | 慢消费者塞满真实 TCP 缓冲未做成。静默 35 秒是客户端读期限，见下行 |
| SSE-06 | PASS | 401 停止该代重连。404 停止 SSE 重连，同时 HTTP inbox 仍补查到消息。binding_closed/409 停止该代重连。缺 Bearer 的真实 HTTP 是 401 | 无 |
| FLOW-01 | PASS | 两个发送者问同一 B，回复 41 和 73 各自关联 | 无 |
| FLOW-03 | PASS | 幂等与 offline 不补投，见 MSG-05/06 | 无 |
| P0 smoke | PASS | 迁移凭据后执行通过，不同 UUID 为 409 | 无 |

## 这轮新增、不能和旧句混用的测量

- 35 秒静默：本地服务只写一次 inbox 帧后不再写字节。`streamInbox` 在 35040ms 因 `timed out` 失败。层次是真实 fetch 读期限，不是伪造时钟。
- 等待静默时 abort：200ms 后取消，209ms 内结束，没有干等 35 秒。
- `915.125µs` 只是早先一次 send 返回后到读到 SSE 帧的观察，不再当作延迟结论。

没有发现要退回实现的确定性缺陷。慢读没有用“小事件没堵住”冒充通过。
