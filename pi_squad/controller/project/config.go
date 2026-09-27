// Package project owns canonical project boundaries and immutable configuration.
package project

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"unicode/utf8"

	"go.yaml.in/yaml/v3"
)

const Protocol = "pi-squad/2"
const MaxDocumentBytes = 64 * 1024

var runtimeUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

func ValidRuntimeID(s string) bool { return runtimeUUID.MatchString(s) }

var identifier = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)

func ValidID(s string) bool { return identifier.MatchString(s) }
func Hash(b []byte) string  { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

type AcceptancePolicy struct {
	Mode        string `json:"mode"`
	CheckerRef  string `json:"checker_ref,omitempty"`
	ReviewerRef string `json:"reviewer_ref,omitempty"`
	ChildPolicy string `json:"child_policy"`
}
type Policy struct {
	RunAdmission       string           `json:"run_admission"`
	MaxParallelTasks   int              `json:"max_parallel_tasks"`
	MaxDelegateDepth   int              `json:"max_delegate_depth"`
	MaxTotalTasks      int              `json:"max_total_tasks"`
	MaxAttemptsPerTask int              `json:"max_attempts_per_task"`
	AllowedTools       []string         `json:"allowed_tools"`
	WritableRoots      []string         `json:"writable_roots"`
	Acceptance         AcceptancePolicy `json:"acceptance_policy"`
}
type Member struct {
	RoleRef        string `json:"role_ref"`
	Responsibility string `json:"responsibility"`
}
type Leader struct {
	AgentRef string `json:"agent_ref"`
}
type Team struct {
	SchemaVersion    int      `json:"schema_version"`
	TeamID           string   `json:"team_id"`
	ConfigVersion    int      `json:"config_version"`
	Leader           Leader   `json:"leader"`
	Members          []Member `json:"members"`
	InstructionsFile string   `json:"instructions_file"`
	DefaultWorkflow  string   `json:"default_workflow,omitempty"`
	Policy           Policy   `json:"policy"`
}
type Dependency struct {
	Step      string `json:"step"`
	Condition string `json:"condition"`
}
type ResultRef struct {
	Length         int64  `json:"length"`
	TaskID         string `json:"task_id"`
	ResultRevision int64  `json:"result_revision"`
	Hash           string `json:"hash"`
}
type Step struct {
	ReworkOf       string          `json:"rework_of,omitempty"`
	ID             string          `json:"id"`
	RoleRef        string          `json:"role_ref"`
	Kind           string          `json:"kind"`
	Goal           string          `json:"goal"`
	DependsOn      []Dependency    `json:"depends_on"`
	Refs           []ResultRef     `json:"refs,omitempty"`
	ExpectedOutput json.RawMessage `json:"expected_output,omitempty"`
	Acceptance     json.RawMessage `json:"acceptance,omitempty"`
	WriteSet       []string        `json:"write_set,omitempty"`
}
type Workflow struct {
	SchemaVersion int    `json:"schema_version"`
	WorkflowID    string `json:"workflow_id"`
	Steps         []Step `json:"steps"`
}
type Role struct {
	Name         string `json:"name" yaml:"name"`
	Description  string `json:"description" yaml:"description"`
	Body         string `json:"body" yaml:"-"`
	WorkingRules string `json:"working_rules" yaml:"-"`
	Hash         string `json:"hash" yaml:"-"`
	WorkingHash  string `json:"working_hash" yaml:"-"`
}
type TeamSnapshot struct {
	Config       Team                `json:"config"`
	Instructions string              `json:"instructions"`
	Workflows    map[string]Workflow `json:"workflows"`
	Hash         string              `json:"hash"`
}
type Snapshot struct {
	Root  string                  `json:"root"`
	Roles map[string]Role         `json:"roles"`
	Teams map[string]TeamSnapshot `json:"teams"`
	Hash  string                  `json:"hash"`
}

// ExactPath also checks directory entry spelling on case-insensitive filesystems.
func ExactPath(root, relative string) (string, error) {
	if filepath.IsAbs(relative) || relative == "" {
		return "", fmt.Errorf("invalid relative path %q", relative)
	}
	p := root
	for _, part := range strings.Split(filepath.ToSlash(relative), "/") {
		if part == "" || part == "." || part == ".." {
			return "", fmt.Errorf("invalid path component %q", part)
		}
		entries, err := os.ReadDir(p)
		if err != nil {
			return "", err
		}
		found := false
		for _, e := range entries {
			if e.Name() == part {
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("missing exact path %s", filepath.Join(p, part))
		}
		p = filepath.Join(p, part)
	}
	real, err := filepath.EvalSymlinks(p)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, real)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("path escapes project: %s", p)
	}
	return real, nil
}
func Discover(cwd string) (string, error) {
	p, err := filepath.Abs(cwd)
	if err != nil {
		return "", err
	}
	p, err = filepath.EvalSymlinks(p)
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Lstat(filepath.Join(p, ".agents", "pisquad")); err == nil {
			q, err := ExactPath(p, ".agents/pisquad")
			if err != nil {
				return "", err
			}
			st, err := os.Stat(q)
			if err != nil || !st.IsDir() {
				return "", fmt.Errorf("pisquad must be a directory")
			}
			return p, nil
		} else if !os.IsNotExist(err) {
			return "", err
		}
		next := filepath.Dir(p)
		if next == p {
			break
		}
		p = next
	}
	return "", fmt.Errorf("PROJECT_NOT_FOUND: no .agents/pisquad above %s; use explicit migration", cwd)
}
func ReadDocument(root, relative string) ([]byte, error) {
	p, err := ExactPath(root, relative)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !st.Mode().IsRegular() {
		return nil, fmt.Errorf("not a regular file: %s", p)
	}
	b, err := io.ReadAll(io.LimitReader(f, MaxDocumentBytes+1))
	if err != nil {
		return nil, err
	}
	if len(b) > MaxDocumentBytes || !utf8.Valid(b) {
		return nil, fmt.Errorf("invalid UTF-8 or oversized document: %s", p)
	}
	return b, nil
}

// DecodeStrict rejects duplicate keys, trailing JSON and unknown schema fields.
func DecodeStrict(b []byte, out any) error {
	if !utf8.Valid(b) {
		return fmt.Errorf("invalid JSON UTF-8")
	}
	d := json.NewDecoder(bytes.NewReader(b))
	if err := checkJSON(d); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON")
	}
	var value any
	if err := json.Unmarshal(b, &value); err != nil {
		return err
	}
	if err := exactJSONFields(value, reflect.TypeOf(out)); err != nil {
		return err
	}
	d = json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	return d.Decode(out)
}

// encoding/json accepts case-insensitive field aliases; the wire schema does
// not. Walk exact tagged field names before the typed decoder applies defaults.
func exactJSONFields(value any, t reflect.Type) error {
	if t == nil || t == reflect.TypeOf(json.RawMessage{}) {
		return nil
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == reflect.TypeOf(json.RawMessage{}) {
		return nil
	}
	switch t.Kind() {
	case reflect.Struct:
		object, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		fields := map[string]reflect.Type{}
		for i := 0; i < t.NumField(); i++ {
			field := t.Field(i)
			key := strings.Split(field.Tag.Get("json"), ",")[0]
			if field.PkgPath != "" || key == "-" {
				continue
			}
			if key == "" {
				key = field.Name
			}
			fields[key] = field.Type
		}
		for key, v := range object {
			field, ok := fields[key]
			if !ok {
				return fmt.Errorf("unknown JSON field %q", key)
			}
			if err := exactJSONFields(v, field); err != nil {
				return fmt.Errorf("%s: %w", key, err)
			}
		}
	case reflect.Slice, reflect.Array:
		if list, ok := value.([]any); ok {
			for _, v := range list {
				if err := exactJSONFields(v, t.Elem()); err != nil {
					return err
				}
			}
		}
	case reflect.Map:
		if object, ok := value.(map[string]any); ok {
			for _, v := range object {
				if err := exactJSONFields(v, t.Elem()); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func checkJSON(d *json.Decoder) error {
	t, err := d.Token()
	if err != nil {
		return err
	}
	delim, ok := t.(json.Delim)
	if !ok {
		return nil
	}
	if delim == '{' {
		keys := map[string]bool{}
		for d.More() {
			k, err := d.Token()
			if err != nil {
				return err
			}
			s, ok := k.(string)
			if !ok || keys[s] {
				return fmt.Errorf("duplicate/invalid JSON key %v", k)
			}
			keys[s] = true
			if err := checkJSON(d); err != nil {
				return err
			}
		}
	} else if delim == '[' {
		for d.More() {
			if err := checkJSON(d); err != nil {
				return err
			}
		}
	} else {
		return fmt.Errorf("unexpected JSON delimiter")
	}
	_, err = d.Token()
	return err
}
func ParseRole(b []byte, id string) (Role, error) {
	r := Role{}
	s := strings.TrimPrefix(strings.ReplaceAll(string(b), "\r\n", "\n"), "\ufeff")
	lines := strings.Split(s, "\n")
	if len(b) > MaxDocumentBytes || !utf8.Valid(b) || len(lines) < 3 || lines[0] != "---" {
		return r, fmt.Errorf("invalid role frontmatter")
	}
	end := 0
	for i := 1; i < len(lines); i++ {
		if lines[i] == "---" {
			end = i
			break
		}
	}
	if end == 0 {
		return r, fmt.Errorf("unterminated frontmatter")
	}
	var header struct {
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
	}
	var syntax yaml.Node
	if err := yaml.Unmarshal([]byte(strings.Join(lines[1:end], "\n")), &syntax); err != nil {
		return r, err
	}
	var rejectAlias func(*yaml.Node) error
	rejectAlias = func(node *yaml.Node) error {
		if node.Kind == yaml.AliasNode || node.Anchor != "" {
			return fmt.Errorf("YAML aliases/anchors are unsupported")
		}
		for _, child := range node.Content {
			if err := rejectAlias(child); err != nil {
				return err
			}
		}
		return nil
	}
	if err := rejectAlias(&syntax); err != nil {
		return r, err
	}
	d := yaml.NewDecoder(strings.NewReader(strings.Join(lines[1:end], "\n")))
	d.KnownFields(true)
	if err := d.Decode(&header); err != nil {
		return r, err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return r, fmt.Errorf("multiple YAML documents")
	}
	r.Name = header.Name
	r.Description = strings.TrimSpace(header.Description)
	r.Body = strings.TrimSpace(strings.Join(lines[end+1:], "\n"))
	r.Hash = Hash(b)
	if !ValidID(r.Name) || r.Name != id || r.Description == "" || r.Body == "" {
		return r, fmt.Errorf("invalid role name/description/body: %s", id)
	}
	return r, nil
}
func Load(root string) (Snapshot, error) {
	s := Snapshot{Root: root, Roles: map[string]Role{}, Teams: map[string]TeamSnapshot{}}
	rolesPath, err := ExactPath(root, ".agents/pisquad/roles")
	if err != nil {
		return s, err
	}
	entries, err := os.ReadDir(rolesPath)
	if err != nil {
		return s, err
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if !e.IsDir() || !ValidID(e.Name()) {
			return s, fmt.Errorf("invalid role directory %s", e.Name())
		}
		base := ".agents/pisquad/roles/" + e.Name()
		b, err := ReadDocument(root, base+"/role.md")
		if err != nil {
			return s, err
		}
		r, err := ParseRole(b, e.Name())
		if err != nil {
			return s, err
		}
		w, err := ReadDocument(root, base+"/agents.md")
		if err != nil {
			return s, err
		}
		r.WorkingRules = string(w)
		r.WorkingHash = Hash(w)
		s.Roles[r.Name] = r
	}
	teamsPath, err := ExactPath(root, ".agents/pisquad/teams")
	if err != nil {
		return s, err
	}
	entries, err = os.ReadDir(teamsPath)
	if err != nil {
		return s, err
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if !e.IsDir() || !ValidID(e.Name()) {
			return s, fmt.Errorf("invalid team directory %s", e.Name())
		}
		base := ".agents/pisquad/teams/" + e.Name()
		b, err := ReadDocument(root, base+"/team.json")
		if err != nil {
			return s, err
		}
		var t Team
		if err := DecodeStrict(b, &t); err != nil {
			return s, err
		}
		if err := validateTeam(t, e.Name(), s.Roles); err != nil {
			return s, err
		}
		ins, err := ReadDocument(root, base+"/instructions.md")
		if err != nil {
			return s, err
		}
		ts := TeamSnapshot{Config: t, Instructions: string(ins), Workflows: map[string]Workflow{}}
		if _, err := os.Stat(filepath.Join(root, base, "workflows")); err == nil {
			wp, err := ExactPath(root, base+"/workflows")
			if err != nil {
				return s, err
			}
			ws, err := os.ReadDir(wp)
			if err != nil {
				return s, err
			}
			for _, we := range ws {
				if !strings.HasSuffix(we.Name(), ".json") {
					continue
				}
				id := strings.TrimSuffix(we.Name(), ".json")
				if !ValidID(id) {
					return s, fmt.Errorf("invalid workflow ID")
				}
				raw, err := ReadDocument(root, base+"/workflows/"+we.Name())
				if err != nil {
					return s, err
				}
				var w Workflow
				if err := DecodeStrict(raw, &w); err != nil {
					return s, err
				}
				if err := validateWorkflow(w, id, t); err != nil {
					return s, err
				}
				ts.Workflows[id] = w
			}
		}
		if t.DefaultWorkflow != "" {
			if _, ok := ts.Workflows[t.DefaultWorkflow]; !ok {
				return s, fmt.Errorf("missing default workflow")
			}
		}
		canonical, _ := json.Marshal(ts)
		ts.Hash = Hash(canonical)
		s.Teams[t.TeamID] = ts
	}
	canonical, _ := json.Marshal(s)
	s.Hash = Hash(canonical)
	return s, nil
}
func validateTeam(t Team, id string, roles map[string]Role) error {
	p := t.Policy
	if t.SchemaVersion != 1 || t.TeamID != id || t.ConfigVersion < 1 || !ValidID(t.Leader.AgentRef) || t.InstructionsFile != "instructions.md" || len(t.Members) == 0 || p.RunAdmission != "fifo_single_active" || p.MaxParallelTasks < 1 || p.MaxDelegateDepth < 1 || p.MaxTotalTasks < 1 || p.MaxAttemptsPerTask < 1 || p.AllowedTools == nil || p.WritableRoots == nil {
		return fmt.Errorf("invalid or missing team fields: %s", id)
	}
	tools := map[string]bool{}
	for _, name := range p.AllowedTools {
		if tools[name] {
			return fmt.Errorf("duplicate allowed tool: %s", name)
		}
		tools[name] = true
		switch name {
		case "read", "grep", "find", "ls", "write", "edit":
		default:
			return fmt.Errorf("unfenced tool is not supported: %s", name)
		}
	}
	seen := map[string]bool{}
	for _, m := range t.Members {
		if _, ok := roles[m.RoleRef]; !ok || seen[m.RoleRef] || strings.TrimSpace(m.Responsibility) == "" {
			return fmt.Errorf("invalid member %s", m.RoleRef)
		}
		seen[m.RoleRef] = true
	}
	a := p.Acceptance
	if a.ChildPolicy != "inherit_parent" && a.ChildPolicy != "separate" {
		return fmt.Errorf("invalid child_policy")
	}
	if a.Mode == "review" {
		if !seen[a.ReviewerRef] || a.CheckerRef != "" {
			return fmt.Errorf("invalid reviewer_ref")
		}
	} else if a.Mode == "checker" {
		if (a.CheckerRef != "numbers-count" && a.CheckerRef != "numbers-sum" && a.CheckerRef != "numbers-stats") || a.ReviewerRef != "" {
			return fmt.Errorf("invalid checker_ref")
		}
	} else {
		return fmt.Errorf("ACCEPTANCE_POLICY_MISSING: Team requires checker or review")
	}
	for _, r := range p.WritableRoots {
		if filepath.IsAbs(r) || r == "" || strings.Contains(filepath.ToSlash(r), "..") || strings.HasPrefix(filepath.ToSlash(r), ".agents") {
			return fmt.Errorf("invalid writable root %s", r)
		}
	}
	return nil
}
func validateWorkflow(w Workflow, id string, t Team) error {
	if w.SchemaVersion != 1 || w.WorkflowID != id || len(w.Steps) == 0 || len(w.Steps) > t.Policy.MaxTotalTasks {
		return fmt.Errorf("invalid workflow %s", id)
	}
	roles := map[string]bool{}
	for _, m := range t.Members {
		roles[m.RoleRef] = true
	}
	steps := map[string]Step{}
	for _, s := range w.Steps {
		if !ValidID(s.ID) || steps[s.ID].ID != "" || !roles[s.RoleRef] || strings.TrimSpace(s.Goal) == "" || s.DependsOn == nil {
			return fmt.Errorf("invalid step %s", s.ID)
		}
		switch s.Kind {
		case "execute", "review", "rework", "ask":
		default:
			return fmt.Errorf("invalid step kind")
		}
		if _, err := ParseOutputSchema(s.ExpectedOutput); err != nil {
			return err
		}
		if err := ValidateResultRefs(s.Refs); err != nil {
			return err
		}
		steps[s.ID] = s
	}
	seen := map[string]int{}
	var visit func(string) error
	visit = func(id string) error {
		if seen[id] == 1 {
			return fmt.Errorf("CALL_CYCLE: workflow at %s", id)
		}
		if seen[id] == 2 {
			return nil
		}
		s, ok := steps[id]
		if !ok {
			return fmt.Errorf("unknown dependency %s", id)
		}
		seen[id] = 1
		deps := map[string]bool{}
		for _, d := range s.DependsOn {
			if deps[d.Step] {
				return fmt.Errorf("duplicate dependency")
			}
			deps[d.Step] = true
			switch d.Condition {
			case "execution_completed", "acceptance_accepted", "review_rejected":
			default:
				return fmt.Errorf("invalid dependency condition")
			}
			if s.Kind == "review" && steps[d.Step].RoleRef == s.RoleRef {
				return fmt.Errorf("review must use independent role")
			}
			if err := visit(d.Step); err != nil {
				return err
			}
		}
		seen[id] = 2
		return nil
	}
	for id := range steps {
		if err := visit(id); err != nil {
			return err
		}
	}
	return nil
}

// ValidateResultRefs permits an unpinned Task reference or a complete exact
// revision/hash pair. Resolution to current results happens at dispatch.
func ValidateResultRefs(refs []ResultRef) error {
	seen := map[string]bool{}
	for _, ref := range refs {
		if !ValidID(ref.TaskID) || seen[ref.TaskID] || ref.Length < 0 {
			return fmt.Errorf("invalid or duplicate result ref: %s", ref.TaskID)
		}
		seen[ref.TaskID] = true
		if ref.Hash == "" && ref.ResultRevision == 0 {
			if ref.Length != 0 {
				return fmt.Errorf("unpinned ref cannot declare length: %s", ref.TaskID)
			}
			continue
		}
		if ref.ResultRevision < 1 || len(ref.Hash) != 64 {
			return fmt.Errorf("result ref requires revision/hash pair: %s", ref.TaskID)
		}
		for _, ch := range ref.Hash {
			if !strings.ContainsRune("0123456789abcdef", ch) {
				return fmt.Errorf("invalid result hash: %s", ref.TaskID)
			}
		}
	}
	return nil
}

// ValidateWorkflow is shared by file loading and atomic Leader plan submission.
func ValidateWorkflow(w Workflow, team Team) error { return validateWorkflow(w, w.WorkflowID, team) }
