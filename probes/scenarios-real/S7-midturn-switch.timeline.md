# S7-midturn-switch: the working folder changes mid-turn; ds-bot rejects the next step and switches part

- 结果: **PASS**
- 时间窗: 2026-10-18T10:15:26.740Z → 2026-10-18T10:15:48.272Z
- 事件数: 140（原始序列 [S7-midturn-switch.jsonl](S7-midturn-switch.jsonl)）
- 计数: `session/event` 58 · `agent/assistant-stream` 12 · `llm/stream` 8 · `agent/pre-step:in` 6 · `agent/pre-step:out` 6 · `agent/request:in` 6 · `agent/request:out` 6 · `tools/pre-execute:in` 5 · `tools/pre-execute:out` 5 · `tools/execute:in` 5 · `tools/execute:out` 5 · `tools/result` 5 · `agent/status` 4 · `agent/inbox/inserted` 2 · `agent/inbox/claimed` 2 · `probe/when-idle` 2 · `session/created` 1 · `agent/created` 1 · `agent/turn-stopping` 1

## 操作

- 10:15:26.741 ask Builder for a three-read task, one tool call at a time
- 10:15:27.895 first tool done; move Builder to another working folder mid-turn
- 10:15:48.272 after (parts=1)

## 时间线（过滤后；⚠ = 该行写入时探针无法从 DS Bot 公开状态归属 Session）

| seq | 时间 | Session | 事件 | 摘要 |
|---|---|---|---|---|
| | | **host pid 79440** | | |
| 779 | 10:15:26.749 | Builder | `session/event` | agent/inbox/spliced next-turn +1 -0 |
| 780 | 10:15:26.749 | Builder | `agent/inbox/inserted` | user "请严格一次只调用一个工具：先用 read 读 a.txt，再用 read 读 b.txt，再用 read 读 c.txt" |
| 781 | 10:15:26.749 | Builder | `agent/status` | running |
| 782 | 10:15:26.750 | Builder | `session/event` | turn/start turn 4 |
| 783 | 10:15:26.751 | Builder | `session/event` | agent/inbox/spliced next-turn +0 -1 |
| 784 | 10:15:26.751 | Builder | `agent/inbox/claimed` | user "请严格一次只调用一个工具：先用 read 读 a.txt，再用 read 读 b.txt，再用 read 读 c.txt" |
| 785 | 10:15:26.758 | Builder | `agent/pre-step:in` | turn 4 step 1 msgs=[user] |
| 786 | 10:15:26.778 | Builder | `agent/pre-step:out` | decision=enter entered=1 |
| 787 | 10:15:26.778 | Builder | `session/event` | step/start turn 4 step 1 |
| 788 | 10:15:26.780 | Builder | `agent/request:in` |  |
| 789 | 10:15:26.780 | Builder | `agent/request:out` | deepseek-official/deepseek-flash effort=high |
| 790 | 10:15:26.781 | Builder | `session/event` | user/message user "请严格一次只调用一个工具：先用 read 读 a.txt，再用 read 读 b.txt，再用 re" |
| 791 | 10:15:26.783 | Builder | `llm/stream` | msgs=23 tools=51 |
| 792 | 10:15:26.783 | Builder | `agent/assistant-stream` |  |
| 794 | 10:15:27.860 | Builder | `session/event` | assistant/message in=185 cache=18304 out=87 |
| 795 | 10:15:27.860 | Builder | `agent/assistant-stream` |  |
| 796 | 10:15:27.861 | Builder | `session/event` | tool/call turn 4 step 1 |
| 797 | 10:15:27.861 | Builder | `tools/pre-execute:in` | read |
| 798 | 10:15:27.861 | Builder | `tools/pre-execute:out` | decision=allow |
| 799 | 10:15:27.862 | Builder | `tools/execute:in` | read |
| 800 | 10:15:27.868 | Builder | `tools/execute:out` | 7 ms |
| 801 | 10:15:27.869 | Builder | `tools/result` | read |
| 802 | 10:15:27.869 | Builder | `session/event` | tool/result turn 4 step 1 |
| 803 | 10:15:27.869 | Builder | `session/event` | step/end turn 4 step 1 |
| 804 | 10:15:27.877 | Builder | `agent/pre-step:in` | turn 4 step 2 msgs=[] |
| 805 | 10:15:27.886 | Builder | `agent/pre-step:out` | decision=enter entered=0 |
| 806 | 10:15:27.886 | Builder | `session/event` | step/start turn 4 step 2 |
| 807 | 10:15:27.887 | Builder | `agent/request:in` |  |
| 808 | 10:15:27.887 | Builder | `agent/request:out` | deepseek-official/deepseek-flash effort=high |
| 809 | 10:15:27.888 | Builder | `llm/stream` | msgs=25 tools=51 |
| 810 | 10:15:27.888 | Builder | `agent/assistant-stream` |  |
| 812 | 10:15:29.923 | Builder | `session/event` | assistant/message in=218 cache=18432 out=55 |
| 813 | 10:15:29.924 | Builder | `agent/assistant-stream` |  |
| 814 | 10:15:29.924 | Builder | `session/event` | tool/call turn 4 step 2 |
| 815 | 10:15:29.925 | Builder | `tools/pre-execute:in` | read |
| 816 | 10:15:29.925 | Builder | `tools/pre-execute:out` | decision=allow |
| 817 | 10:15:29.925 | Builder | `tools/execute:in` | read |
| 818 | 10:15:29.931 | Builder | `tools/execute:out` | 6 ms |
| 819 | 10:15:29.931 | Builder | `tools/result` | read |
| 820 | 10:15:29.932 | Builder | `session/event` | tool/result turn 4 step 2 |
| 821 | 10:15:29.932 | Builder | `session/event` | step/end turn 4 step 2 |
| 822 | 10:15:29.941 | Builder | `session/event` | turn/end {"kind":"blocked"} |
| 823 | 10:15:29.942 | Builder | `agent/status` | idle |
| 824 | 10:15:29.944 | Builder | `probe/when-idle` | after 3194 ms |
| 825 | 10:15:29.945 | Builder | `llm/stream` | purpose=compaction msgs=28 tools=51 |
| 827 | 10:15:31.944 | Builder | `llm/stream` | msgs=1 tools=0 |
| 829 | 10:15:34.571 | Builder[56efa1b6] ⚠ | `session/created` | new Session |
| 833 | 10:15:34.573 | Builder[56efa1b6] ⚠ | `agent/created` | source="startup" |
| 835 | 10:15:34.578 | Builder[56efa1b6] ⚠ | `session/event` | model/selection {"provider":"deepseek-official","model":"deepseek-flash","reasoningEffort":"high"} |
| 836 | 10:15:34.715 | Builder[56efa1b6] ⚠ | `session/event` | agent/inbox/spliced next-turn +1 -0 |
| 837 | 10:15:34.716 | Builder[56efa1b6] ⚠ | `agent/inbox/inserted` | bot:handoff "[Handoff · part 2] DS Bot moved your own chat with the user " |
| 838 | 10:15:34.716 | Builder[56efa1b6] ⚠ | `agent/status` | running |
| 839 | 10:15:34.716 | Builder[56efa1b6] ⚠ | `session/event` | turn/start turn 1 |
| 840 | 10:15:34.717 | Builder[56efa1b6] ⚠ | `session/event` | agent/inbox/spliced next-turn +0 -1 |
| 841 | 10:15:34.717 | Builder[56efa1b6] ⚠ | `agent/inbox/claimed` | bot:handoff "[Handoff · part 2] DS Bot moved your own chat with the user " |
| 842 | 10:15:34.723 | Builder[56efa1b6] ⚠ | `agent/pre-step:in` | turn 1 step 1 msgs=[bot:handoff] |
| 843 | 10:15:34.798 | Builder[56efa1b6] ⚠ | `agent/pre-step:out` | decision=enter entered=4 |
| 844 | 10:15:34.799 | Builder[56efa1b6] ⚠ | `session/event` | step/start turn 1 step 1 |
| 845 | 10:15:34.799 | Builder[56efa1b6] ⚠ | `agent/request:in` |  |
| 846 | 10:15:34.799 | Builder[56efa1b6] ⚠ | `agent/request:out` | deepseek-official/deepseek-flash effort=high |
| 848 | 10:15:34.801 | Builder[56efa1b6] ⚠ | `session/event` | user/message bot:handoff "[Handoff · part 2] DS Bot moved your own chat with" |
| 849 | 10:15:34.801 | Builder[56efa1b6] ⚠ | `session/event` | user/message agent-instructions "<system-reminder> The following workspace instruct" |
| 850 | 10:15:34.801 | Builder[56efa1b6] ⚠ | `session/event` | user/message runtime-context "Current runtime context. This snapshot supersedes " |
| 851 | 10:15:34.802 | Builder[56efa1b6] ⚠ | `session/event` | user/message skill-catalog "<system-reminder> A skill is a reusable set of tas" |
| 852 | 10:15:34.802 | Builder[56efa1b6] ⚠ | `session/event` | user/message time-context "Time sampled while preparing turn 1, step 1: 2026-" |
| 855 | 10:15:34.805 | Builder[56efa1b6] ⚠ | `llm/stream` | msgs=6 tools=51 |
| 856 | 10:15:34.805 | Builder[56efa1b6] ⚠ | `agent/assistant-stream` |  |
| 858 | 10:15:37.817 | Builder | `session/event` | assistant/message in=16203 cache=1920 out=336 |
| 859 | 10:15:37.818 | Builder | `agent/assistant-stream` |  |
| 860 | 10:15:37.819 | Builder | `session/event` | tool/call turn 1 step 1 |
| 861 | 10:15:37.819 | Builder | `tools/pre-execute:in` | read |
| 862 | 10:15:37.819 | Builder | `tools/pre-execute:out` | decision=allow |
| 863 | 10:15:37.820 | Builder | `tools/execute:in` | read |
| 864 | 10:15:37.828 | Builder | `tools/execute:out` | 9 ms |
| 865 | 10:15:37.829 | Builder | `tools/result` | read |
| 866 | 10:15:37.829 | Builder | `session/event` | tool/result turn 1 step 1 |
| 867 | 10:15:37.830 | Builder | `session/event` | step/end turn 1 step 1 |
| 868 | 10:15:37.838 | Builder | `agent/pre-step:in` | turn 1 step 2 msgs=[] |
| 869 | 10:15:37.852 | Builder | `agent/pre-step:out` | decision=enter entered=0 |
| 870 | 10:15:37.852 | Builder | `session/event` | step/start turn 1 step 2 |
| 871 | 10:15:37.853 | Builder | `agent/request:in` |  |
| 872 | 10:15:37.853 | Builder | `agent/request:out` | deepseek-official/deepseek-flash effort=high |
| 873 | 10:15:37.855 | Builder | `llm/stream` | msgs=8 tools=51 |
| 874 | 10:15:37.855 | Builder | `agent/assistant-stream` |  |
| 876 | 10:15:41.068 | Builder | `session/event` | assistant/message in=227 cache=18304 out=482 |
| 877 | 10:15:41.069 | Builder | `agent/assistant-stream` |  |
| 878 | 10:15:41.070 | Builder | `session/event` | tool/call turn 1 step 2 |
| 879 | 10:15:41.070 | Builder | `tools/pre-execute:in` | read |
| 880 | 10:15:41.070 | Builder | `tools/pre-execute:out` | decision=allow |
| 881 | 10:15:41.070 | Builder | `tools/execute:in` | read |
| 882 | 10:15:41.078 | Builder | `tools/execute:out` | 8 ms |
| 883 | 10:15:41.078 | Builder | `tools/result` | read |
| 884 | 10:15:41.079 | Builder | `session/event` | tool/result turn 1 step 2 |
| 885 | 10:15:41.079 | Builder | `session/event` | step/end turn 1 step 2 |
| 886 | 10:15:41.088 | Builder | `agent/pre-step:in` | turn 1 step 3 msgs=[] |
| 887 | 10:15:41.097 | Builder | `agent/pre-step:out` | decision=enter entered=0 |
| 888 | 10:15:41.098 | Builder | `session/event` | step/start turn 1 step 3 |
| 889 | 10:15:41.098 | Builder | `agent/request:in` |  |
| 890 | 10:15:41.098 | Builder | `agent/request:out` | deepseek-official/deepseek-flash effort=high |
| 891 | 10:15:41.100 | Builder | `llm/stream` | msgs=10 tools=51 |
| 892 | 10:15:41.100 | Builder | `agent/assistant-stream` |  |
| 894 | 10:15:42.447 | Builder | `session/event` | assistant/message in=141 cache=18944 out=72 |
| 895 | 10:15:42.449 | Builder | `agent/assistant-stream` |  |
| 896 | 10:15:42.449 | Builder | `session/event` | tool/call turn 1 step 3 |
| 897 | 10:15:42.450 | Builder | `tools/pre-execute:in` | read |
| 898 | 10:15:42.450 | Builder | `tools/pre-execute:out` | decision=allow |
| 899 | 10:15:42.450 | Builder | `tools/execute:in` | read |
| 900 | 10:15:42.457 | Builder | `tools/execute:out` | 7 ms |
| 901 | 10:15:42.458 | Builder | `tools/result` | read |
| 902 | 10:15:42.458 | Builder | `session/event` | tool/result turn 1 step 3 |
| 903 | 10:15:42.459 | Builder | `session/event` | step/end turn 1 step 3 |
| 904 | 10:15:42.468 | Builder | `agent/pre-step:in` | turn 1 step 4 msgs=[] |
| 905 | 10:15:42.477 | Builder | `agent/pre-step:out` | decision=enter entered=0 |
| 906 | 10:15:42.478 | Builder | `session/event` | step/start turn 1 step 4 |
| 907 | 10:15:42.479 | Builder | `agent/request:in` |  |
| 908 | 10:15:42.479 | Builder | `agent/request:out` | deepseek-official/deepseek-flash effort=high |
| 909 | 10:15:42.480 | Builder | `llm/stream` | msgs=12 tools=51 |
| 910 | 10:15:42.481 | Builder | `agent/assistant-stream` |  |
| 912 | 10:15:44.080 | Builder | `session/event` | assistant/message in=159 cache=19072 out=40 |
| 913 | 10:15:44.082 | Builder | `agent/assistant-stream` |  |
| 914 | 10:15:44.082 | Builder | `session/event` | step/end turn 1 step 4 |
| 915 | 10:15:44.083 | Builder | `agent/turn-stopping` | inbox nextStep=0 nextTurn=0 |
| 916 | 10:15:44.127 | Builder | `session/event` | turn/end {"kind":"completed"} |
| 917 | 10:15:44.129 | Builder | `agent/status` | idle |
| 918 | 10:15:44.131 | Builder | `probe/when-idle` | after 9415 ms |
