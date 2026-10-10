package projection

// enrichOverview joins only rows from the same read transaction. These fields
// explain current state; they never grant permission to execute an operation.
func enrichOverview(s *Snapshot) {
	roles := map[string]map[string]any{}
	for _, role := range s.Views["roles"] {
		id, _ := role["role_id"].(string)
		roles[id] = role
	}
	agents := map[string]map[string]any{}
	for _, agent := range s.Views["agents"] {
		binding, _ := agent["binding"].(map[string]any)
		id, _ := binding["agent_id"].(string)
		agents[id] = agent
		agent["standalone_only"] = agent["qualification"] == "secondary"
	}
	leaders := map[string]map[string]any{}
	for _, leader := range s.Views["leaders"] {
		id, _ := leader["team_id"].(string)
		leaders[id] = leader
		if agent := agents[stringField(leader, "agent_id")]; agent != nil {
			leader["current_binding"] = agent["binding"]
			leader["presence"] = agent["presence"]
			leader["activity"] = agent["activity"]
		}
	}
	roster := func(config map[string]any) []map[string]any {
		out := []map[string]any{}
		members, _ := config["members"].([]any)
		for _, member := range members {
			m, _ := member.(map[string]any)
			if role := roles[stringField(m, "role_ref")]; role != nil {
				out = append(out, role)
			}
		}
		return out
	}
	for _, run := range s.Views["runs"] {
		snapshot, _ := run["config_snapshot"].(map[string]any)
		config, _ := snapshot["config"].(map[string]any)
		run["current_roster"] = roster(config)
		run["next_step"] = runNextStep(run)
	}
	for _, team := range s.Views["teams"] {
		config, _ := team["config"].(map[string]any)
		id := stringField(config, "team_id")
		team["team_id"] = id
		team["leader_status"] = leaders[id]
		team["members_status"] = roster(config)
		active, queued := []map[string]any{}, []map[string]any{}
		for _, run := range s.Views["runs"] {
			if run["team_id"] != id || run["cleanup_state"] == "released" {
				continue
			}
			// Keep the live overview small; full immutable configuration and
			// history remain in the dedicated Run view.
			row := map[string]any{}
			for _, key := range []string{"run_id", "queue_seq", "phase", "cleanup_state", "revision", "leader", "waiting_roles", "blockers", "recovery_hold", "next_step"} {
				row[key] = run[key]
			}
			if run["admitted"] == true {
				active = append(active, row)
			} else {
				queued = append(queued, row)
			}
		}
		team["active_runs"], team["queued_runs"] = active, queued
		team["active_run_count"], team["queued_run_count"] = len(active), len(queued)
	}
}

func stringField(row map[string]any, key string) string {
	value, _ := row[key].(string)
	return value
}

func runNextStep(run map[string]any) string {
	if run["cleanup_state"] == "released" {
		return "查看结果、验收与历史记录"
	}
	if run["recovery_hold"] == true {
		return "核实未释放 Attempt 与阻塞原因，再显式恢复或取消；操作仍需重新校验"
	}
	if run["admitted"] != true {
		return "查看 Leader 绑定、前序 Run 和角色等待；条件满足后准入，或显式取消"
	}
	return "查看 Task 依赖、执行与验收；等待安全收尾，或显式取消"
}
