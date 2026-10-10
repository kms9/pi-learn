// Package projection reads all views in one transaction and never mutates state.
package projection

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"time"
)

type Snapshot struct {
	Revision   int64                       `json:"revision"`
	Epoch      int64                       `json:"controller_epoch"`
	ObservedAt time.Time                   `json:"observed_at"`
	State      string                      `json:"state"`
	Timing     map[string]int64            `json:"timing"`
	Views      map[string][]map[string]any `json:"views"`
}

func Read(ctx context.Context, db *sql.DB, heartbeatTimeout ...time.Duration) (Snapshot, error) {
	timeout := 15 * time.Second
	if len(heartbeatTimeout) > 0 {
		timeout = heartbeatTimeout[0]
	}
	leaseTTL := 30 * time.Second
	if len(heartbeatTimeout) > 1 {
		leaseTTL = heartbeatTimeout[1]
	}
	s := Snapshot{ObservedAt: fault.Now(), State: "current", Views: map[string][]map[string]any{}}
	s.Timing = project.Timing(timeout, leaseTTL)
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return s, err
	}
	defer tx.Rollback()
	if err := tx.QueryRow(`SELECT epoch FROM controller_state`).Scan(&s.Epoch); err != nil {
		return s, err
	}
	if err := tx.QueryRow(`SELECT COALESCE(MAX(seq),0) FROM events`).Scan(&s.Revision); err != nil {
		return s, err
	}
	for _, entry := range []struct{ name, query string }{
		{"agents", `SELECT body,last_seen,activity,revoked FROM instances ORDER BY agent_id`},
		{"runs", `SELECT body FROM runs ORDER BY queue_seq`},
		{"teams", `SELECT content FROM config_snapshots c WHERE kind='team' AND version=(SELECT MAX(version) FROM config_snapshots v WHERE v.kind=c.kind AND v.id=c.id) ORDER BY id`},
		{"tasks", `SELECT body FROM tasks ORDER BY rowid`},
		{"attempts", `SELECT body FROM attempts ORDER BY rowid`},
		{"events", `SELECT json_object('seq',seq,'type',type,'entity_id',entity_id,'revision',revision,'server_time',server_time,'details',json(details)) FROM events ORDER BY seq DESC LIMIT 200`},
		{"waits", `SELECT json_object('waiter',waiter,'resource',resource,'owner',owner,'revision',revision,'reason',reason,'since',since) FROM wait_edges ORDER BY since`},
		{"capacity", `SELECT json_object('attempt_id',attempt_id,'agent_id',agent_id,'team_id',team_id,'segment_id',segment_id,'fencing_token',fencing,'expires_at',expires_at) FROM execution_leases ORDER BY attempt_id`},
		{"evidence", `SELECT json_object('seq',seq,'attempt_id',attempt_id,'source',source,'disposition',disposition,'at',at) FROM attempt_evidence ORDER BY seq DESC LIMIT 100`},
	} {
		rows, err := tx.Query(entry.query)
		if err != nil {
			return s, err
		}
		view := []map[string]any{}
		for rows.Next() {
			var body string
			var last, activity string
			var revoked bool
			if entry.name == "agents" {
				err = rows.Scan(&body, &last, &activity, &revoked)
			} else {
				err = rows.Scan(&body)
			}
			if err != nil {
				rows.Close()
				return s, err
			}
			var v map[string]any
			if err := json.Unmarshal([]byte(body), &v); err != nil {
				rows.Close()
				return s, err
			}
			if entry.name == "agents" {
				v["last_seen"] = last
				v["activity"] = activity
				v["revoked"] = revoked
				seen, _ := time.Parse(time.RFC3339Nano, last)
				v["presence"] = project.PresenceAt(seen, s.ObservedAt, timeout, revoked)
				if !seen.IsZero() {
					v["suspect_at"] = seen.Add(timeout)
					v["offline_at"] = seen.Add(2 * timeout)
				}
				delete(v, "role_snapshot")
			}
			view = append(view, v)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return s, err
		}
		s.Views[entry.name] = view
	}
	rows, err := tx.Query(`WITH role_ids AS (
		SELECT id AS role_id FROM config_snapshots WHERE kind='role'
		UNION SELECT role_id FROM primary_bindings
		UNION SELECT role_id FROM role_ownership
		UNION SELECT json_extract(m.value,'$.role_ref') FROM config_snapshots c,
		json_each(c.content,'$.config.members') m WHERE c.kind='team'
	)
	SELECT r.role_id,p.agent_id,COALESCE(p.epoch,0),COALESCE(p.revision,0),o.team_id,o.run_id,o.revision
	FROM role_ids r LEFT JOIN primary_bindings p ON p.role_id=r.role_id
	LEFT JOIN role_ownership o ON o.role_id=r.role_id ORDER BY r.role_id`)
	if err != nil {
		return s, err
	}
	roles := []map[string]any{}
	for rows.Next() {
		var role string
		var primary, team, run sql.NullString
		var epoch, revision int64
		var ownerRevision sql.NullInt64
		if err := rows.Scan(&role, &primary, &epoch, &revision, &team, &run, &ownerRevision); err != nil {
			rows.Close()
			return s, err
		}
		roles = append(roles, map[string]any{"role_id": role, "primary_agent_id": primary.String, "binding_epoch": epoch, "revision": revision, "owner_team_id": team.String, "owner_run_id": run.String, "ownership_revision": ownerRevision.Int64})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return s, err
	}
	s.Views["roles"] = roles
	leaders := []map[string]any{}
	rows, err = tx.Query(`SELECT team_id,agent_id,runtime_id,epoch,revision FROM leader_bindings ORDER BY team_id`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var team string
		var agent, runtime sql.NullString
		var epoch, revision int64
		if err := rows.Scan(&team, &agent, &runtime, &epoch, &revision); err != nil {
			rows.Close()
			return s, err
		}
		leaders = append(leaders, map[string]any{"team_id": team, "agent_id": agent.String, "runtime_id": runtime.String, "binding_epoch": epoch, "revision": revision})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return s, err
	}
	s.Views["leaders"] = leaders

	agentsByID := map[string]map[string]any{}
	for _, agent := range s.Views["agents"] {
		binding, _ := agent["binding"].(map[string]any)
		id, _ := binding["agent_id"].(string)
		agentsByID[id] = agent
		agent["team_schedulable"] = false
		agent["qualification"] = "secondary"
		if agent["mode"] == "leader" {
			agent["qualification"] = "leader"
		}
		agent["quarantined"] = false
		for _, attempt := range s.Views["attempts"] {
			target, _ := attempt["target"].(map[string]any)
			if target["agent_id"] != id || attempt["cleanup_state"] == "released" {
				continue
			}
			agent["current_task_id"] = attempt["task_id"]
			agent["current_attempt_id"] = attempt["attempt_id"]
			agent["segment_id"] = attempt["segment_id"]
			agent["affinity"] = attempt["attempt_id"]
			agent["execution_state"] = attempt["state"]
			if attempt["state"] == "needs_review" || attempt["state"] == "interrupted" || attempt["state"] == "cancelled" {
				agent["quarantined"] = true
				agent["quarantine_reason"] = attempt["error"]
			}
			for _, lease := range s.Views["capacity"] {
				if lease["attempt_id"] == attempt["attempt_id"] {
					agent["execution_lease"] = lease
					break
				}
			}
		}
	}
	for _, role := range roles {
		secondary := []string{}
		primaryID, _ := role["primary_agent_id"].(string)
		role["availability"] = "unassigned"
		role["team_schedulable"] = false
		for _, agent := range s.Views["agents"] {
			if agent["role_id"] != role["role_id"] || agent["mode"] != "role" {
				continue
			}
			binding, _ := agent["binding"].(map[string]any)
			id, _ := binding["agent_id"].(string)
			if id == primaryID {
				agent["qualification"] = "primary"
				agent["team_schedulable"] = agent["presence"] == "online" && agent["quarantined"] != true
			} else {
				secondary = append(secondary, id)
			}
		}
		if primary := agentsByID[primaryID]; primary != nil {
			for _, key := range []string{"presence", "activity", "underlying_activity", "current_task_id", "current_attempt_id", "segment_id", "team_schedulable", "quarantined", "quarantine_reason"} {
				if value, ok := primary[key]; ok {
					role[key] = value
				}
			}
			switch {
			case primary["quarantined"] == true:
				role["availability"] = "quarantined"
			case primary["presence"] != "online":
				role["availability"] = "offline"
			case primary["affinity"] != nil:
				role["availability"] = "busy"
			default:
				role["availability"] = primary["activity"]
			}
		}
		role["secondary_agent_ids"] = secondary
	}

	enrichOverview(&s)
	return s, tx.Commit()
}
