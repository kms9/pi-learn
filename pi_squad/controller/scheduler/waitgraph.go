package scheduler

import (
	"database/sql"
	"github.com/kms9/pi-learn/pi_squad/controller/fault"
	"strings"
	"time"

	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

type waitEdge struct {
	from, to, resource, reason string
	revision                   int64
}

func graphCycle(edges []waitEdge) []string {
	adj := map[string][]string{}
	for _, e := range edges {
		adj[e.from] = append(adj[e.from], e.to)
	}
	seen := map[string]int{}
	stack := []string{}
	var found []string
	var visit func(string) bool
	visit = func(id string) bool {
		if seen[id] == 1 {
			start := 0
			for i, x := range stack {
				if x == id {
					start = i
					break
				}
			}
			found = append(append([]string{}, stack[start:]...), id)
			return true
		}
		if seen[id] == 2 {
			return false
		}
		seen[id] = 1
		stack = append(stack, id)
		for _, next := range adj[id] {
			if visit(next) {
				return true
			}
		}
		stack = stack[:len(stack)-1]
		seen[id] = 2
		return false
	}
	for id := range adj {
		if visit(id) {
			return found
		}
	}
	return nil
}
func dependencyEdges(all []task.Contract) []waitEdge {
	out := []waitEdge{}
	for _, c := range all {
		if task.Terminal(c.State) {
			continue
		}
		for _, d := range c.Dependencies {
			out = append(out, waitEdge{c.ID, d.TaskID, d.TaskID, "dependency", c.Revision})
		}
	}
	return out
}
func validateDependencyGraph(tx *sql.Tx) error {
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	if cycle := graphCycle(dependencyEdges(all)); len(cycle) > 0 {
		return task.Reject("CALL_CYCLE", strings.Join(cycle, " -> "))
	}
	return nil
}
func (s *Service) validateChildWrites(tx *sql.Tx, c task.Contract) error {
	paths, err := s.writePaths(tx, c)
	if err != nil {
		return err
	}
	parentID := c.ParentID
	for parentID != "" {
		parent, err := task.LoadTask(tx, parentID)
		if err != nil {
			return err
		}
		parentPaths, err := s.writePaths(tx, parent)
		if err != nil {
			return err
		}
		for _, a := range paths {
			for _, b := range parentPaths {
				if project.ContainsPath(a, b) || project.ContainsPath(b, a) {
					return task.Reject("RESOURCE_DEPENDENCY_CONFLICT", a)
				}
			}
		}
		parentID = parent.ParentID
	}
	return nil
}
func (s *Service) reconcileWaitGraph(tx *sql.Tx) error {
	all, err := readTasks(tx)
	if err != nil {
		return err
	}
	edges := dependencyEdges(all)
	byAttempt := map[string]string{}
	for _, c := range all {
		for _, a := range c.AttemptIDs {
			byAttempt[a] = c.ID
		}
	}
	for _, c := range all {
		if task.Terminal(c.State) {
			continue
		}
		for _, b := range c.Blockers {
			if b.Kind == "agent_affinity" || b.Kind == "write_conflict" {
				owner := byAttempt[b.Resource]
				if owner != "" && owner != c.ID {
					edges = append(edges, waitEdge{c.ID, owner, b.Resource, b.Kind, c.Revision})
				}
			}
		}
	}
	sinceByKey := map[string]string{}
	rows, err := tx.Query(`SELECT waiter,resource,owner,since FROM wait_edges`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var waiter, resource, owner, since string
		if err := rows.Scan(&waiter, &resource, &owner, &since); err != nil {
			rows.Close()
			return err
		}
		sinceByKey[waiter+"\x00"+resource+"\x00"+owner] = since
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM wait_edges`); err != nil {
		return err
	}
	for _, e := range edges {
		since := sinceByKey[e.from+"\x00"+e.resource+"\x00"+e.to]
		if since == "" {
			since = fault.Now().Format(time.RFC3339Nano)
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO wait_edges VALUES(?,?,?,?,?,?)`, e.from, e.resource, e.to, e.revision, e.reason, since); err != nil {
			return err
		}
	}
	if cycle := graphCycle(edges); len(cycle) > 0 {
		var newest *task.Contract
		for i := range all {
			if contains(cycle, all[i].ID) && (newest == nil || all[i].CreatedAt.After(newest.CreatedAt)) {
				newest = &all[i]
			}
		}
		if newest != nil && newest.State != "needs_review" {
			newest.State = "needs_review"
			newest.Revision++
			blocker(newest, "wait_cycle", strings.Join(cycle, " -> "))
			if err := task.SaveTask(tx, *newest); err != nil {
				return err
			}
			if err := s.failAncestors(tx, *newest, "wait_cycle"); err != nil {
				return err
			}
			return task.EventTx(tx, "wait_cycle", newest.ID, newest.Revision, cycle)
		}
	}
	return nil
}
