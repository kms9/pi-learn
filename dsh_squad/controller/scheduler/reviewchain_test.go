package scheduler

import (
	"encoding/json"
	"testing"

	"github.com/kms9/pi-learn/dsh_squad/controller/task"
)

// review builds a review of candidate "c" with the given state and verdict ("" for none).
func review(state, decision string) task.Contract {
	c := task.Contract{Kind: "review", State: state, Dependencies: []task.Dependency{{TaskID: "c", Condition: "execution_completed"}}}
	if decision != "" {
		value, _ := json.Marshal(map[string]string{"decision": decision})
		c.Result = &task.Result{Value: value}
	}
	return c
}

// The next reviewer of a chain is due only when every review so far accepted and the chain is
// not complete: none yet is reviewer 0, one accepted is reviewer 1, and a running or rejected
// review, or a finished chain, gives -1.
func TestNextReviewerFollowsTheChainInOrder(t *testing.T) {
	candidate := task.Contract{ID: "c"}
	chain := []string{"reviewer", "checker"}
	cases := []struct {
		name string
		all  []task.Contract
		want int
	}{
		{"no review yet", nil, 0},
		{"first accepted", []task.Contract{review("completed", "accepted")}, 1},
		{"first still running", []task.Contract{review("running", "")}, -1},
		{"first rejected", []task.Contract{review("completed", "rejected")}, -1},
		{"chain complete", []task.Contract{review("completed", "accepted"), review("completed", "accepted")}, -1},
	}
	for _, tc := range cases {
		if got := nextReviewer(tc.all, candidate, chain); got != tc.want {
			t.Errorf("%s: nextReviewer = %d, want %d", tc.name, got, tc.want)
		}
	}
}

// A review of another task does not count, and a cancelled one is ignored by nextReviewer.
func TestReviewsOfOtherTasksDoNotCount(t *testing.T) {
	candidate := task.Contract{ID: "c"}
	other := review("completed", "accepted")
	other.Dependencies = []task.Dependency{{TaskID: "elsewhere"}}
	if got := nextReviewer([]task.Contract{other}, candidate, []string{"reviewer", "checker"}); got != 0 {
		t.Fatalf("a review of another task counted: %d", got)
	}
	cancelled := review("cancelled", "rejected")
	if got := nextReviewer([]task.Contract{cancelled}, candidate, []string{"reviewer"}); got != 0 {
		t.Fatalf("a cancelled review counted: %d", got)
	}
}

// acceptedReviews leaves out the review whose verdict is being applied.
func TestAcceptedReviewsLeavesOutTheCurrentReview(t *testing.T) {
	candidate := task.Contract{ID: "c"}
	first := review("completed", "accepted")
	first.ID = "r1"
	current := review("completed", "accepted")
	current.ID = "r2"
	all := []task.Contract{first, current}
	if got := acceptedReviews(all, candidate, "r2"); got != 1 {
		t.Fatalf("acceptedReviews without the current review = %d, want 1", got)
	}
}
