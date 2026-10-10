package scheduler

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

func (s *Service) Tick(ctx context.Context) error {
	return s.Store.Transaction(ctx, func(tx *sql.Tx) error {
		if err := consumeOutbox(tx); err != nil {
			return err
		}
		if err := s.invalidateChangedResults(tx); err != nil {
			return err
		}
		if err := s.expireMessages(tx); err != nil {
			return err
		}
		if err := s.expire(tx); err != nil {
			return err
		}
		if err := s.admitRuns(tx); err != nil {
			return err
		}
		if err := s.ensureReviews(tx); err != nil {
			return err
		}
		if err := s.startResponses(tx); err != nil {
			return err
		}
		if err := s.resumeReady(tx); err != nil {
			return err
		}
		if err := s.ensureLeaderSteps(tx); err != nil {
			return err
		}
		tasks, err := readTasks(tx)
		if err != nil {
			return err
		}
		for _, queued := range tasks {
			// Earlier rows can invalidate this Task through ancestor/coverage
			// propagation within the same transaction. Never write the old row.
			c, err := task.LoadTask(tx, queued.ID)
			if err != nil {
				return err
			}
			if c.State != "planned" && c.State != "queued" && c.State != "waiting_dependency" {
				continue
			}
			c.Blockers = []task.Blocker{}
			if c.Accepted && fault.Now().After(c.DeadlineAt) {
				c.State = "needs_review"
				c.Revision++
				blocker(&c, "deadline", c.ID)
				if err := saveScheduledTask(tx, &c); err != nil {
					return err
				}
				if err := s.failAncestors(tx, c, "deadline"); err != nil {
					return err
				}
				continue
			}
			if c.RunID != nil {
				r, err := task.LoadRun(tx, *c.RunID)
				if err != nil {
					return err
				}
				if !r.Admitted || r.RecoveryHold || task.Terminal(r.Phase) {
					blocker(&c, "run_unavailable", r.ID)
				}
			}
			ready, err := dependencyReady(tx, c)
			if err != nil {
				return err
			}
			if !ready {
				blocker(&c, "dependencies", c.ID)
			}
			if c.ParentID != "" {
				parent, err := task.LoadTask(tx, c.ParentID)
				if err != nil {
					return err
				}
				if len(parent.AttemptIDs) == 0 {
					blocker(&c, "parent_yield", parent.ID)
				} else {
					a, err := task.LoadAttempt(tx, parent.AttemptIDs[len(parent.AttemptIDs)-1])
					if err != nil {
						return err
					}
					if a.State != "suspended" {
						blocker(&c, "parent_yield", parent.ID)
					}
				}
			}
			if len(c.Blockers) > 0 {
				if err := saveScheduledTask(tx, &c); err != nil {
					return err
				}
				continue
			}
			if !c.Accepted {
				var queued int
				candidate, lookupErr := s.primary(tx, c.RoleID)
				if lookupErr == nil {
					if err := tx.QueryRow(`SELECT COUNT(*) FROM tasks WHERE state IN ('queued','waiting_dependency') AND json_extract(body,'$.expected_target.agent_id')=?`, candidate.Binding.AgentID).Scan(&queued); err != nil {
						return err
					}
				}
				if queued >= 32 {
					blocker(&c, "queue_full", candidate.Binding.AgentID)
					if err := saveScheduledTask(tx, &c); err != nil {
						return err
					}
					continue
				}
				target, err := s.primary(tx, c.RoleID)
				if err != nil {
					blocker(&c, "primary_offline", c.RoleID)
					if err := saveScheduledTask(tx, &c); err != nil {
						return err
					}
					continue
				}
				c.Target = &target.Binding
				c.Accepted = true
				// Planned DAG nodes have not entered an Agent queue. Freeze the
				// model waiting deadline only when they are actually accepted.
				c.DeadlineAt = fault.Now().Add(120 * time.Second)
				c.State = "queued"
				c.Revision++
			}
			i, err := loadInstance(tx, c.Target.AgentID)
			if err != nil {
				return err
			}
			if c.Scope == "team" && c.Kind != "leader_step" {
				primary, err := s.primary(tx, c.RoleID)
				if err != nil {
					blocker(&c, "primary_offline", c.RoleID)
				} else if !task.SameBinding(primary.Binding, *c.Target) {
					c.State = "needs_review"
					blocker(&c, "binding_changed", c.RoleID)
				}
				var owner string
				err = tx.QueryRow(`SELECT run_id FROM role_ownership WHERE role_id=?`, c.RoleID).Scan(&owner)
				if err != nil || c.RunID == nil || owner != *c.RunID {
					blocker(&c, "ownership_mismatch", c.RoleID)
				}
			} else if c.Scope == "standalone" {
				var owner, primary string
				err := tx.QueryRow(`SELECT o.run_id,COALESCE(p.agent_id,'') FROM role_ownership o JOIN primary_bindings p ON p.role_id=o.role_id WHERE o.role_id=?`, c.RoleID).Scan(&owner, &primary)
				if err == nil && primary == i.Binding.AgentID {
					blocker(&c, "role_busy", owner)
				} else if err != nil && err != sql.ErrNoRows {
					return err
				}
			}
			if !s.Online(i) {
				blocker(&c, "agent_offline", i.Binding.AgentID)
			} else if !task.SameBinding(i.Binding, *c.Target) {
				c.State = "needs_review"
				blocker(&c, "binding_changed", i.Binding.AgentID)
			} else if i.Activity != "idle" {
				blocker(&c, "agent_busy", i.Binding.AgentID)
			}
			for _, cap := range []string{"sections", "agent_settled", "before_provider_request", "native_input"} {
				if !i.Capabilities[cap] {
					blocker(&c, "capability_unavailable", cap)
				}
			}
			var active int
			if err := tx.QueryRow(`SELECT count(*) FROM execution_leases`).Scan(&active); err != nil {
				return err
			}
			if active >= s.Config.MaxParallel {
				blocker(&c, "project_capacity", s.Project.Root)
			}
			if c.TeamID != nil {
				if err := tx.QueryRow(`SELECT count(*) FROM execution_leases WHERE team_id=?`, *c.TeamID).Scan(&active); err != nil {
					return err
				}
				if active >= c.Policy.MaxParallelTasks {
					blocker(&c, "team_capacity", *c.TeamID)
				}
			}
			var current string
			err = tx.QueryRow(`SELECT attempt_id FROM agent_reservations WHERE agent_id=?`, i.Binding.AgentID).Scan(&current)
			if err == nil {
				blocker(&c, "agent_affinity", current)
			} else if err != sql.ErrNoRows {
				return err
			}
			if len(c.WriteSet) > 0 && !contains(intersection(c.AllowedTools, i.AvailableTools), "write") && !contains(intersection(c.AllowedTools, i.AvailableTools), "edit") {
				blocker(&c, "capability_unavailable", "write/edit")
			}
			paths, err := s.writePaths(tx, c)
			if err != nil {
				c.State = "needs_review"
				blocker(&c, "write_authorization_invalid", err.Error())
				if saveErr := saveScheduledTask(tx, &c); saveErr != nil {
					return saveErr
				}
				if holdErr := s.failAncestors(tx, c, "write_authorization_invalid"); holdErr != nil {
					return holdErr
				}
				continue
			}
			for _, p := range paths {
				rows, err := tx.Query(`SELECT path,attempt_id FROM write_reservations`)
				if err != nil {
					return err
				}
				for rows.Next() {
					var path, owner string
					if err := rows.Scan(&path, &owner); err != nil {
						rows.Close()
						return err
					}
					if project.ContainsPath(path, p) || project.ContainsPath(p, path) {
						blocker(&c, "write_conflict", owner)
					}
				}
				err = rows.Err()
				rows.Close()
				if err != nil {
					return err
				}
			}
			if len(c.Blockers) > 0 {
				if err := saveScheduledTask(tx, &c); err != nil {
					return err
				}
				if c.State == "needs_review" {
					if err := s.failAncestors(tx, c, "binding_changed"); err != nil {
						return err
					}
				}
				continue
			}
			if err := s.resolveTaskRefs(tx, &c); err != nil {
				c.State = "needs_review"
				blocker(&c, "result_ref_invalid", err.Error())
				if saveErr := saveScheduledTask(tx, &c); saveErr != nil {
					return saveErr
				}
				if holdErr := s.failAncestors(tx, c, "result_ref_invalid"); holdErr != nil {
					return holdErr
				}
				continue
			}
			if err := s.startAttempt(tx, &c, paths); err != nil {
				return err
			}
		}
		return s.reconcileWaitGraph(tx)
	})
}
func (s *Service) writePaths(tx *sql.Tx, c task.Contract) ([]string, error) {
	paths := []string{}
	if len(c.WriteSet) > 0 && !contains(c.AllowedTools, "write") && !contains(c.AllowedTools, "edit") {
		return nil, task.Reject("WRITE_NOT_AUTHORIZED", "write_set requires write/edit permission")
	}
	for _, raw := range c.WriteSet {
		p, err := project.CanonicalResource(s.Project.Root, raw)
		if err != nil {
			return nil, err
		}
		allowed := false
		for _, root := range c.Policy.WritableRoots {
			r, err := project.CanonicalResource(s.Project.Root, root)
			if err != nil {
				return nil, err
			}
			if project.ContainsPath(r, p) {
				allowed = true
			}
		}
		if !allowed {
			return nil, task.Reject("WRITE_NOT_AUTHORIZED", raw)
		}
		paths = append(paths, p)
	}
	return paths, nil
}
func (s *Service) startAttempt(tx *sql.Tx, c *task.Contract, paths []string) error {
	instance, err := loadInstance(tx, c.Target.AgentID)
	if err != nil {
		return err
	}
	role := instance.RoleSnapshot
	if c.Kind != "leader_step" {
		b, err := project.ReadDocument(s.Project.Root, ".agents/pisquad/roles/"+c.RoleID+"/agents.md")
		if err != nil {
			c.State = "needs_review"
			blocker(c, "context_unavailable", fmt.Sprint(err))
			if err := saveScheduledTask(tx, c); err != nil {
				return err
			}
			return s.failAncestors(tx, *c, "context_unavailable")
		}
		role.WorkingRules = string(b)
		role.WorkingHash = project.Hash(b)
	}
	if err := fault.Point("dispatch_before_intent"); err != nil {
		return err
	}
	if len(c.AttemptIDs) >= c.Policy.MaxAttemptsPerTask {
		c.State = "needs_review"
		blocker(c, "attempt_budget", c.ID)
		if err := saveScheduledTask(tx, c); err != nil {
			return err
		}
		return s.failAncestors(tx, *c, "attempt_budget")
	}
	id, err := project.RandomID("attempt-")
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE controller_state SET fencing=fencing+1`); err != nil {
		return err
	}
	var fence int64
	if err := tx.QueryRow(`SELECT fencing FROM controller_state`).Scan(&fence); err != nil {
		return err
	}
	if len(paths) > 0 && !contains(c.AllowedTools, "write") && !contains(c.AllowedTools, "edit") {
		return task.Reject("WRITE_NOT_AUTHORIZED", "write_set requires write/edit permission")
	}
	c.AllowedTools = intersection(c.AllowedTools, instance.AvailableTools)
	if c.Kind != "leader_step" && len(paths) == 0 {
		c.AllowedTools = intersection(c.AllowedTools, []string{"read", "grep", "find", "ls"})
	}

	context := task.Context{Role: role, AllowedTools: c.AllowedTools, WriteSet: paths}
	if c.RunID != nil {
		r, err := task.LoadRun(tx, *c.RunID)
		if err != nil {
			return err
		}
		context.TeamInstructions = r.Config.Instructions
		context.ConfigHash = r.Config.Hash
	}
	a := task.Attempt{ID: id, TaskID: c.ID, Number: len(c.AttemptIDs) + 1, State: "admitted", Cleanup: "pending", Target: *c.Target, Context: context, Segment: 1, ControllerEpoch: s.Epoch, FencingToken: fence, LeaseExpiresAt: fault.Now().Add(s.Config.LeaseTTL), Receipt: "dispatch_intent", Revision: 1}
	if len(c.AttemptIDs) > 0 {
		a.RetryOf = c.AttemptIDs[len(c.AttemptIDs)-1]
	}
	c.AttemptIDs = append(c.AttemptIDs, id)
	c.State = "dispatching"
	c.Revision++
	if err := task.SaveAttempt(tx, a); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO agent_reservations VALUES(?,?)`, a.Target.AgentID, a.ID); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO execution_leases VALUES(?,?,?,?,?,?)`, a.ID, a.Target.AgentID, c.TeamID, a.Segment, fence, a.LeaseExpiresAt.Format(time.RFC3339Nano)); err != nil {
		return err
	}
	for _, p := range paths {
		if _, err := tx.Exec(`INSERT INTO write_reservations VALUES(?,?,?)`, p, a.ID, fence); err != nil {
			return err
		}
	}
	if err := task.SaveTask(tx, *c); err != nil {
		return err
	}
	return task.EventTx(tx, "dispatch_intent", a.ID, a.Revision, map[string]any{"task_id": c.ID, "binding": a.Target, "segment": a.Segment})
}
func (s *Service) expire(tx *sql.Tx) error {
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	for _, c := range all {
		if task.Terminal(c.State) || c.State == "needs_review" || !fault.Now().After(c.DeadlineAt) || c.Target == nil || len(c.AttemptIDs) == 0 {
			continue
		}
		if err := s.interruptAgent(tx, c.Target.AgentID, "deadline"); err != nil {
			return err
		}
	}

	rows, err := tx.Query(`SELECT attempt_id FROM execution_leases WHERE expires_at<?`, fault.Now().Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		a, err := task.LoadAttempt(tx, id)
		if err != nil {
			return err
		}
		if a.Error == "lease_expired" {
			continue
		}
		if !task.Terminal(a.State) {
			a.State = "needs_review"
		}
		a.Error = "lease_expired"
		a.Revision++
		if err := task.SaveAttempt(tx, a); err != nil {
			return err
		}
		c, err := task.LoadTask(tx, a.TaskID)
		if err != nil {
			return err
		}
		if !task.Terminal(c.State) {
			c.State = "needs_review"
		}
		c.Revision++
		if err := task.SaveTask(tx, c); err != nil {
			return err
		}
		if err := s.failAncestors(tx, c, "lease_expired"); err != nil {
			return err
		}
		if err := task.EventTx(tx, "lease_expired", id, a.Revision, nil); err != nil {
			return err
		}
	}
	return nil
}
