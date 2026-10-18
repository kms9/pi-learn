# S9-fallback: the Reviewer's model leaves the catalog; which model does its next turn use?

- 结果: **PASS**
- 时间窗: 2026-10-18T10:17:52.391Z → 2026-10-18T10:18:08.461Z
- 事件数: 34（原始序列 [S9-fallback.jsonl](S9-fallback.jsonl)）
- 计数: `session/event` 14 · `session/created` 2 · `agent/created` 2 · `agent/status` 2 · `llm/stream` 2 · `agent/assistant-stream` 2 · `probe/stop` 1 · `probe/start` 1 · `agent/inbox/inserted` 1 · `agent/inbox/claimed` 1 · `agent/pre-step:in` 1 · `agent/pre-step:out` 1 · `agent/request:in` 1 · `agent/request:out` 1 · `agent/turn-stopping` 1 · `probe/when-idle` 1

## 操作

- 10:17:52.391 restart web host with deepseek-v4-pro removed from the catalog (deepseek-official/deepseek-v4-pro)
- 10:17:59.652 ask Reviewer for one sentence
- 10:18:08.461 after

## 时间线（过滤后；⚠ = 该行写入时探针无法从 DS Bot 公开状态归属 Session）

| seq | 时间 | Session | 事件 | 摘要 |
|---|---|---|---|---|
| | | **host pid 84774** | | |
| 366 | 10:17:52.497 | - | `probe/stop` |  |
| | | **host pid 85448** | | |
| 1 | 10:17:53.767 | - | `probe/start` |  |
| 2 | 10:17:59.715 | Reviewer | `session/created` | new Session |
| 3 | 10:17:59.718 | Reviewer | `agent/created` | source="resume" |
| 4 | 10:17:59.729 | Reviewer | `session/event` | agent/inbox/spliced next-turn +1 -0 |
| 5 | 10:17:59.730 | Reviewer | `agent/inbox/inserted` | user "回复「在线」两个字。" |
| 6 | 10:17:59.731 | Reviewer | `agent/status` | running |
| 7 | 10:17:59.732 | Reviewer | `session/event` | turn/start turn 3 |
| 8 | 10:17:59.734 | Reviewer | `session/event` | agent/inbox/spliced next-turn +0 -1 |
| 9 | 10:17:59.734 | Reviewer | `agent/inbox/claimed` | user "回复「在线」两个字。" |
| 10 | 10:17:59.749 | Reviewer | `agent/pre-step:in` | turn 3 step 1 msgs=[user] |
| 11 | 10:17:59.812 | Reviewer | `agent/pre-step:out` | decision=enter entered=1 |
| 12 | 10:17:59.813 | Reviewer | `session/event` | step/start turn 3 step 1 |
| 13 | 10:17:59.814 | Reviewer | `agent/request:in` |  |
| 14 | 10:17:59.815 | Reviewer | `agent/request:out` | deepseek-official/deepseek-v4-pro effort=high |
| 15 | 10:17:59.816 | Reviewer | `session/event` | user/message user "回复「在线」两个字。" |
| 18 | 10:17:59.822 | Reviewer | `llm/stream` | msgs=10 tools=51 |
| 19 | 10:17:59.822 | Reviewer | `agent/assistant-stream` |  |
| 20 | 10:18:00.261 | Reviewer | `session/event` | model/selection {"provider":"deepseek-official","model":"deepseek-flash","reasoningEffort":"high"} |
| 21 | 10:18:00.450 | Reviewer@研发群 | `session/created` | new Session |
| 22 | 10:18:00.451 | Reviewer@研发群 | `agent/created` | source="resume" |
| 23 | 10:18:00.458 | Reviewer@研发群 | `session/event` | model/selection {"provider":"deepseek-official","model":"deepseek-flash","reasoningEffort":"high"} |
| 25 | 10:18:01.619 | Reviewer | `session/event` | assistant/message in=102 cache=16896 out=2 |
| 26 | 10:18:01.621 | Reviewer | `agent/assistant-stream` |  |
| 27 | 10:18:01.621 | Reviewer | `session/event` | step/end turn 3 step 1 |
| 28 | 10:18:01.622 | Reviewer | `agent/turn-stopping` | inbox nextStep=0 nextTurn=0 |
| 29 | 10:18:01.623 | Reviewer | `session/event` | turn/end {"kind":"completed"} |
| 30 | 10:18:01.625 | Reviewer | `agent/status` | idle |
| 31 | 10:18:01.627 | Reviewer | `probe/when-idle` | after 1896 ms |
| 32 | 10:18:03.631 | Reviewer | `llm/stream` | msgs=1 tools=0 |
