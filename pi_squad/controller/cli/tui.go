package cli

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"

	"github.com/kms9/pi-learn/pi_squad/controller/agent"
	"github.com/kms9/pi-learn/pi_squad/controller/client"
	"github.com/kms9/pi-learn/pi_squad/controller/config"
)

const tuiRefresh = 2 * time.Second

func newTUICommand() *cobra.Command {
	return &cobra.Command{
		Use:   "tui",
		Short: "Read-only agent table; quitting does not stop the controller",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := config.Load(cmd)
			if err != nil {
				return fail(err)
			}
			model := newTUIModel(client.New(cfg.URL), cfg.URL)
			program := tea.NewProgram(model, tea.WithAltScreen())
			if _, err := program.Run(); err != nil {
				return fail(err)
			}
			return nil
		},
	}
}

type agentsMsg struct {
	agents []agent.Agent
	err    error
}

type refreshMsg struct{}

type tuiModel struct {
	client *client.Client
	url    string
	table  table.Model
	err    error
	width  int
	height int
}

func newTUIModel(c *client.Client, url string) tuiModel {
	t := table.New(
		table.WithColumns(agentColumns(80)),
		table.WithFocused(true),
		table.WithHeight(12),
	)
	styles := table.DefaultStyles()
	styles.Header = styles.Header.BorderStyle(lipgloss.NormalBorder()).BorderBottom(true).Bold(true)
	styles.Selected = styles.Selected.Foreground(lipgloss.Color("229")).Background(lipgloss.Color("57"))
	t.SetStyles(styles)
	return tuiModel{client: c, url: url, table: t}
}

func (m tuiModel) Init() tea.Cmd {
	return fetchAgents(m.client)
}

func (m tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.resize()
		return m, nil
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc", "ctrl+c":
			return m, tea.Quit
		case "r":
			return m, fetchAgents(m.client)
		}
		var cmd tea.Cmd
		m.table, cmd = m.table.Update(msg)
		return m, cmd
	case agentsMsg:
		m.err = msg.err
		if msg.err == nil {
			m.table.SetRows(agentRows(msg.agents))
		}
		return m, tea.Tick(tuiRefresh, func(time.Time) tea.Msg {
			return refreshMsg{}
		})
	case refreshMsg:
		return m, fetchAgents(m.client)
	}
	return m, nil
}

func (m tuiModel) View() string {
	title := lipgloss.NewStyle().Bold(true).Render("PI SQUAD · AGENTS")
	var status string
	if m.err != nil {
		status = lipgloss.NewStyle().Foreground(lipgloss.Color("203")).Render(m.err.Error())
	} else {
		status = fmt.Sprintf("%s    q quit    r refresh", m.url)
	}
	return strings.Join([]string{title, "", m.table.View(), "", status}, "\n")
}

func (m *tuiModel) resize() {
	width := m.width
	if width < 40 {
		width = 80
	}
	height := m.height - 6
	if height < 3 {
		height = 3
	}
	m.table.SetColumns(agentColumns(width))
	m.table.SetHeight(height)
}

func fetchAgents(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agents, err := c.List(ctx, agent.ListFilter{})
		return agentsMsg{agents: agents, err: err}
	}
}

func agentColumns(width int) []table.Column {
	rest := width - 16 - 12 - 10 - 20 - 8
	if rest < 12 {
		rest = 12
	}
	return []table.Column{
		{Title: "Agent", Width: rest},
		{Title: "Role", Width: 16},
		{Title: "Squad", Width: 12},
		{Title: "Status", Width: 10},
		{Title: "Last seen", Width: 20},
	}
}

func agentRows(agents []agent.Agent) []table.Row {
	rows := make([]table.Row, 0, len(agents))
	for _, item := range agents {
		rows = append(rows, table.Row{
			item.AgentID,
			item.Role,
			item.SquadID,
			item.Status,
			item.LastSeen.UTC().Format(time.RFC3339),
		})
	}
	return rows
}
