package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/kms9/pi-learn/pi_squad/controller/client"
	"github.com/kms9/pi-learn/pi_squad/controller/projection"
)

type projectSnapshotMsg struct {
	snapshot   projection.Snapshot
	err        error
	generation int64
	client     *client.ProjectClient
}
type projectTickMsg struct{ generation int64 }
type projectTUI struct {
	client                     *client.ProjectClient
	snapshot                   projection.Snapshot
	err                        error
	views                      []string
	view, index, width, height int
	filter                     string
	filtering, detail          bool
	generation                 int64
	detailOffset               int
}

func newProjectTUI(c *client.ProjectClient) projectTUI {
	f := ""
	return projectTUI{client: c, views: []string{"runs", "roles", "agents", "tasks", "attempts", "teams", "leaders", "events", "waits", "capacity", "evidence"}, filter: f, width: 100, height: 28, generation: 1}
}
func projectFetch(c *client.ProjectClient, generation int64, reconnect bool) tea.Cmd {
	return func() tea.Msg {
		if reconnect {
			next, err := c.Rediscover(context.Background())
			if err != nil {
				return projectSnapshotMsg{err: err, generation: generation}
			}
			c = next
		}
		snap, err := c.Snapshot(context.Background())
		return projectSnapshotMsg{snapshot: snap, err: err, generation: generation, client: c}
	}
}
func (m projectTUI) Init() tea.Cmd { return projectFetch(m.client, m.generation, false) }
func (m projectTUI) rows() []map[string]any {
	rows := []map[string]any{}
	needle := strings.ToLower(m.filter)
	for _, v := range m.snapshot.Views[m.views[m.view]] {
		b, _ := json.Marshal(v)
		if needle == "" || strings.Contains(strings.ToLower(string(b)), needle) {
			rows = append(rows, v)
		}
	}
	return rows
}
func (m projectTUI) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := message.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	case projectSnapshotMsg:
		if msg.generation != m.generation {
			return m, nil
		}
		if msg.client != nil {
			m.client = msg.client
		}
		m.err = msg.err
		if msg.err == nil && (m.snapshot.Epoch != msg.snapshot.Epoch || msg.snapshot.Revision >= m.snapshot.Revision) {
			if m.snapshot.Epoch != msg.snapshot.Epoch {
				m.index, m.detailOffset = 0, 0
				m.detail = false
			}
			m.snapshot = msg.snapshot
			if m.index >= len(m.rows()) {
				m.index, m.detailOffset = 0, 0
			}
		}
		return m, tea.Tick(2*time.Second, func(time.Time) tea.Msg { return projectTickMsg{generation: m.generation} })
	case projectTickMsg:
		if msg.generation != m.generation {
			return m, nil
		}
		m.generation++
		return m, projectFetch(m.client, m.generation, m.err != nil)
	case tea.KeyMsg:
		if m.filtering {
			if msg.String() == "enter" || msg.String() == "esc" {
				m.filtering = false

				m.index = 0
				return m, nil
			}
			if msg.Type == tea.KeyBackspace {
				r := []rune(m.filter)
				if len(r) > 0 {
					m.filter = string(r[:len(r)-1])
				}
			} else if msg.Type == tea.KeyRunes {
				m.filter += string(msg.Runes)
			}
			return m, nil
		}
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "tab", "right":
			m.view = (m.view + 1) % len(m.views)
			m.index = 0
			m.detail = false
		case "shift+tab", "left":
			m.view = (m.view + len(m.views) - 1) % len(m.views)
			m.index = 0
			m.detail = false
		case "down", "j":
			if m.detail {
				m.detailOffset++
				return m, nil
			}
			if m.index+1 < len(m.rows()) {
				m.index++
			}
		case "up", "k":
			if m.detail {
				if m.detailOffset > 0 {
					m.detailOffset--
				}
				return m, nil
			}
			if m.index > 0 {
				m.index--
			}
		case "enter":
			m.detail = !m.detail
			m.detailOffset = 0
		case "/":
			m.filtering = true

			return m, nil
		case "r":
			m.generation++
			return m, projectFetch(m.client, m.generation, true)
		case "esc":
			m.detail = false
		}
	}
	return m, nil
}
func (m projectTUI) View() string {
	title := lipgloss.NewStyle().Bold(true).Render("Pi Squad Project")
	status := "current"
	if m.err != nil {
		status = "STALE: " + m.err.Error()
	}
	age := "unknown"
	if !m.snapshot.ObservedAt.IsZero() {
		age = time.Since(m.snapshot.ObservedAt).Round(time.Second).String()
	}
	out := fmt.Sprintf("%s  epoch=%d revision=%d age=%s %s\n", title, m.snapshot.Epoch, m.snapshot.Revision, age, status)
	tabs := []string{}
	for i, v := range m.views {
		if i == m.view {
			v = "[" + v + "]"
		}
		tabs = append(tabs, v)
	}
	out += strings.Join(tabs, "  ") + "\n" + "filter: " + m.filter + "\n"
	rows := m.rows()
	if m.index >= len(rows) {
		m.index = 0
	}
	if len(rows) == 0 {
		out += "(no records)\n"
	} else if m.detail {
		b, _ := json.MarshalIndent(rows[m.index], "", "  ")
		lines := strings.Split(string(b), "\n")
		limit := m.height - 7
		if limit < 1 {
			limit = 1
		}
		start := m.detailOffset
		if start >= len(lines) {
			start = len(lines) - 1
		}
		end := start + limit
		if end > len(lines) {
			end = len(lines)
		}
		for _, line := range lines[start:end] {
			out += lipgloss.NewStyle().MaxWidth(m.width).Render(line) + "\n"
		}
	} else {
		limit := m.height - 7
		if limit < 1 {
			limit = 1
		}
		start := 0
		if m.index >= limit {
			start = m.index - limit + 1
		}
		for i := start; i < len(rows) && i < start+limit; i++ {
			v := rows[i]
			keys := []string{}
			for _, key := range []string{"run_id", "task_id", "attempt_id", "role_id", "team_id", "phase", "state", "activity", "presence", "qualification", "standalone_only", "active_run_count", "queued_run_count", "primary_agent_id", "owner_run_id", "cleanup_state", "revision"} {
				if val, ok := v[key]; ok {
					keys = append(keys, fmt.Sprintf("%s=%v", key, val))
				}
			}
			if binding, ok := v["binding"].(map[string]any); ok {
				keys = append(keys, fmt.Sprintf("agent=%v", binding["agent_id"]))
			}
			if config, ok := v["config"].(map[string]any); ok {
				keys = append(keys, fmt.Sprintf("team_id=%v config_version=%v", config["team_id"], config["config_version"]))
			}
			sort.Strings(keys)
			prefix := "  "
			if i == m.index {
				prefix = "> "
			}
			line := strings.Join(keys, "  ")
			out += prefix + lipgloss.NewStyle().MaxWidth(m.width-2).Render(line) + "\n"
		}
	}
	out += "tab view • / filter • ↑↓ select • enter detail • r refresh • q exit observer\n"
	return out
}
