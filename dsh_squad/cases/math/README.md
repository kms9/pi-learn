# 案例：数学知识点课件（D11）

`dsh_squad/deploy/dsh-squad up <目录>` 前，把本目录的 `.agents/` 复制到项目目录：

```bash
cp -R dsh_squad/cases/math/.agents ~/math-project/
dsh_squad/deploy/dsh-squad up ~/math-project --mock
```

Team `math`，Leader `chief`，四个角色：教研员 `researcher`、课件制作 `builder`、检查员 `checker`、教学审核 `reviewer`。默认 Workflow `lesson`：梳理 → 制作 HTML 课件 → 检查；每个结果都由 `reviewer` 独立审核，退回时 Leader 安排返工并复审，全部通过后 Leader 完成 Run。

Run 的目标写具体的知识点，例如「认识分数：分数的意义与读写（五年级）」。
