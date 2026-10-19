package agent

import "context"

// InboxWatch is a coalesced wake-up hint, not a message log or delivery receipt.
// SQLite remains authoritative; every new connection reconciles its inbox.
type InboxWatch struct {
	binding Binding
	changed chan struct{}
	closed  chan struct{}
}

func (w *InboxWatch) Changed() <-chan struct{} { return w.changed }
func (w *InboxWatch) Closed() <-chan struct{}  { return w.closed }

func (s *Service) WatchInbox(ctx context.Context, b Binding) (*InboxWatch, func(), error) {
	r := s.reg
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, err := r.checkBinding(ctx, b, false); err != nil {
		return nil, nil, err
	}
	if r.watchers == nil {
		r.watchers = make(map[string]*InboxWatch)
	}
	// At most one stream per registered agent. A reload replaces its old stream.
	r.closeWatchLocked(b.AgentID)
	w := &InboxWatch{binding: b, changed: make(chan struct{}, 1), closed: make(chan struct{})}
	r.watchers[b.AgentID] = w
	cancel := func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.watchers[b.AgentID] == w {
			r.closeWatchLocked(b.AgentID)
		}
	}
	return w, cancel, nil
}

func (s *Service) ValidateWatch(ctx context.Context, w *InboxWatch) error {
	r := s.reg
	r.mu.Lock()
	defer r.mu.Unlock()
	_, err := r.checkBinding(ctx, w.binding, false)
	return err
}

// Call only while holding Registry.mu, after committing the message transaction.
func (r *Registry) notifyInboxLocked(b Binding) {
	w := r.watchers[b.AgentID]
	if w == nil || !sameBinding(w.binding, b) {
		return
	}
	select {
	case w.changed <- struct{}{}:
	default:
	}
}
func (r *Registry) closeWatchLocked(agentID string) {
	if w := r.watchers[agentID]; w != nil {
		delete(r.watchers, agentID)
		close(w.closed)
	}
}
