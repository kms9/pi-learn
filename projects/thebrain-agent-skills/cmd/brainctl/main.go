package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// brainctl is intentionally read-only until local write-path contracts have
// been verified in a disposable TheBrain test Brain.
type client struct {
	origin string
	key    string
	http   *http.Client
}

func newClient(origin, key string) (*client, error) {
	if strings.TrimSpace(key) == "" {
		return nil, errors.New("THEBRAIN_API_KEY is empty; obtain it from TheBrain Settings > User > Local API Key")
	}
	if origin == "" {
		origin = "http://127.0.0.1:11522"
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("invalid THEBRAIN_API_URL: expected loopback origin, without /api path")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errors.New("THEBRAIN_API_URL must use http or https")
	}
	host := strings.ToLower(u.Hostname())
	ip := net.ParseIP(host)
	if host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return nil, errors.New("refusing non-loopback TheBrain API origin")
	}
	return &client{
		origin: strings.TrimRight(origin, "/"),
		key:    key,
		http:   &http.Client{Timeout: 8 * time.Second},
	}, nil
}

func (c *client) get(path string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, c.origin+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request %s failed: %w", path, err)
	}
	defer resp.Body.Close()
	// Bound responses to prevent a failed endpoint returning an unbounded body.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		switch resp.StatusCode {
		case http.StatusUnauthorized:
			return nil, errors.New("HTTP 401: missing or invalid Local API Key")
		case http.StatusForbidden:
			return nil, errors.New("HTTP 403: Key may not match the signed-in TheBrain user")
		default:
			return nil, fmt.Errorf("GET %s returned HTTP %d", path, resp.StatusCode)
		}
	}
	return bytes.TrimSpace(body), nil
}

func printJSON(data []byte) error {
	if len(data) == 0 {
		fmt.Println("{}")
		return nil
	}
	if !json.Valid(data) {
		return errors.New("API returned a non-JSON response; verify endpoint and TheBrain version")
	}
	var out bytes.Buffer
	if err := json.Indent(&out, data, "", "  "); err != nil {
		return err
	}
	fmt.Println(out.String())
	return nil
}

func getAndPrint(c *client, path string) error {
	body, err := c.get(path)
	if err != nil {
		return err
	}
	return printJSON(body)
}

func newFlags(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	return fs
}

func requireNoArgs(args []string) error {
	if len(args) != 0 {
		return errors.New("unexpected arguments")
	}
	return nil
}

func thoughtFlags(name string, args []string) (string, string, bool, error) {
	fs := newFlags(name)
	brainID := fs.String("brain-id", "", "target Brain UUID")
	id := fs.String("id", "", "target Thought UUID")
	siblings := fs.Bool("include-siblings", true, "include siblings in graph")
	if err := fs.Parse(args); err != nil {
		return "", "", false, err
	}
	if len(fs.Args()) != 0 || *brainID == "" || *id == "" {
		return "", "", false, errors.New(name + " requires --brain-id UUID --id UUID")
	}
	return url.PathEscape(*brainID), url.PathEscape(*id), *siblings, nil
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New(usage)
	}
	if args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Println(usage)
		return nil
	}
	c, err := newClient(os.Getenv("THEBRAIN_API_URL"), os.Getenv("THEBRAIN_API_KEY"))
	if err != nil {
		return err
	}
	switch args[0] {
	case "doctor":
		if err := requireNoArgs(args[1:]); err != nil {
			return err
		}
		state, err := c.get("/api/app/state")
		if err != nil {
			return fmt.Errorf("app state check: %w", err)
		}
		brains, err := c.get("/api/brains")
		if err != nil {
			return fmt.Errorf("brain list check: %w", err)
		}
		if !json.Valid(state) || !json.Valid(brains) {
			return errors.New("doctor: one of the API responses was not JSON")
		}
		body, err := json.Marshal(map[string]any{
			"status":   "connected",
			"appState": json.RawMessage(state),
			"brains":   json.RawMessage(brains),
		})
		if err != nil {
			return err
		}
		return printJSON(body)
	case "app":
		if len(args) != 2 || args[1] != "state" {
			return errors.New("usage: brainctl app state")
		}
		return getAndPrint(c, "/api/app/state")
	case "brain":
		if len(args) < 2 {
			return errors.New("usage: brainctl brain list | get --brain-id UUID")
		}
		switch args[1] {
		case "list":
			if err := requireNoArgs(args[2:]); err != nil {
				return err
			}
			return getAndPrint(c, "/api/brains")
		case "get":
			fs := newFlags("brain get")
			id := fs.String("brain-id", "", "target Brain UUID")
			if err := fs.Parse(args[2:]); err != nil {
				return err
			}
			if len(fs.Args()) != 0 || *id == "" {
				return errors.New("brain get requires --brain-id UUID")
			}
			return getAndPrint(c, "/api/brains/"+url.PathEscape(*id))
		}
	case "thought":
		if len(args) < 2 || (args[1] != "get" && args[1] != "graph") {
			return errors.New("usage: brainctl thought get|graph --brain-id UUID --id UUID")
		}
		brain, id, siblings, err := thoughtFlags("thought "+args[1], args[2:])
		if err != nil {
			return err
		}
		path := "/api/thoughts/" + brain + "/" + id
		if args[1] == "graph" {
			path += "/graph?includeSiblings=" + strconv.FormatBool(siblings)
		}
		return getAndPrint(c, path)
	case "note":
		if len(args) < 2 || args[1] != "get" {
			return errors.New("usage: brainctl note get --brain-id UUID --id UUID")
		}
		brain, id, _, err := thoughtFlags("note get", args[2:])
		if err != nil {
			return err
		}
		return getAndPrint(c, "/api/notes/"+brain+"/"+id)
	case "search":
		fs := newFlags("search")
		brainID := fs.String("brain-id", "", "target Brain UUID")
		query := fs.String("query", "", "search text")
		max := fs.Int("max-results", 30, "maximum search results")
		onlyNames := fs.Bool("only-names", false, "search Thought names only")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if len(fs.Args()) != 0 || *brainID == "" || strings.TrimSpace(*query) == "" || *max < 1 || *max > 1000 {
			return errors.New("search requires --brain-id UUID --query TEXT [--max-results 1..1000]")
		}
		q := url.Values{}
		q.Set("queryText", *query)
		q.Set("maxResults", strconv.Itoa(*max))
		q.Set("onlySearchThoughtNames", strconv.FormatBool(*onlyNames))
		return getAndPrint(c, "/api/search/"+url.PathEscape(*brainID)+"?"+q.Encode())
	}
	return errors.New(usage)
}

const usage = "brainctl (read-only)\n" +
	"  doctor\n" +
	"  app state\n" +
	"  brain list | get --brain-id UUID\n" +
	"  thought get|graph --brain-id UUID --id UUID [--include-siblings=false]\n" +
	"  note get --brain-id UUID --id UUID\n" +
	"  search --brain-id UUID --query TEXT [--max-results 30] [--only-names]\n" +
	"Environment: THEBRAIN_API_KEY (required), THEBRAIN_API_URL (default http://127.0.0.1:11522)"

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "brainctl:", err)
		os.Exit(1)
	}
}
