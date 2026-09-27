package scheduler

import (
	"database/sql"
	"github.com/kms9/pi-learn/pi_squad/controller/project"
	"github.com/kms9/pi-learn/pi_squad/controller/task"
)

func (s *Service) resolveTaskRefs(tx *sql.Tx, c *task.Contract) error {
	refs := append([]project.ResultRef{}, c.Refs...)
	known := map[string]bool{}
	for index, ref := range refs {
		if known[ref.TaskID] {
			return task.Reject("DUPLICATE_REF", ref.TaskID)
		}
		known[ref.TaskID] = true
		source, err := task.LoadTask(tx, ref.TaskID)
		if err != nil {
			return err
		}
		if !sameScope(*c, source) || source.State != "completed" || source.Result == nil {
			return task.Reject("RESULT_REF_UNAVAILABLE", ref.TaskID)
		}
		if ref.Hash == "" && ref.ResultRevision == 0 {
			refs[index] = project.ResultRef{TaskID: source.ID, ResultRevision: source.Result.Revision, Hash: source.Result.Hash, Length: int64(len(source.Result.Value))}
		}
	}
	for _, dep := range c.Dependencies {
		if known[dep.TaskID] {
			continue
		}
		source, err := task.LoadTask(tx, dep.TaskID)
		if err != nil {
			return err
		}
		if source.Result != nil {
			refs = append(refs, project.ResultRef{TaskID: source.ID, ResultRevision: source.Result.Revision, Hash: source.Result.Hash, Length: int64(len(source.Result.Value))})
		}
	}
	if err := s.validateResultRefs(tx, *c, task.Result{Refs: refs}); err != nil {
		return err
	}
	c.Refs = refs
	return nil
}

// The Controller records all pinned inputs even when the model omits refs from
// its output. A result cannot discard provenance or substitute another revision.
func pinResultInputs(c task.Contract, result *task.Result) error {
	refs := append([]project.ResultRef{}, result.Refs...)
	indexes := map[string]int{}
	for index, ref := range refs {
		if _, exists := indexes[ref.TaskID]; exists {
			return task.Reject("DUPLICATE_REF", ref.TaskID)
		}
		indexes[ref.TaskID] = index
	}
	for _, ref := range c.Refs {
		if index, exists := indexes[ref.TaskID]; exists {
			supplied := refs[index]
			if supplied.Hash != ref.Hash || supplied.ResultRevision != ref.ResultRevision || (supplied.Length != 0 && ref.Length != 0 && supplied.Length != ref.Length) {
				return task.Reject("RESULT_VERSION_CONFLICT", ref.TaskID)
			}
		} else {
			indexes[ref.TaskID] = len(refs)
			refs = append(refs, ref)
		}
	}
	result.Refs = refs
	return nil
}
