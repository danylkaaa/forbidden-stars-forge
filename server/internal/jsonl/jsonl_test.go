package jsonl

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Tau Empire":       "tau_empire",
		"  Space  Wolves ": "space_wolves",
		"Iron-Hands!!":     "iron_hands",
		"___leading":       "leading",
	}
	for in, want := range cases {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBuildProducesValidLinesPerItem(t *testing.T) {
	items := []Item{
		{FactionID: 1, FactionName: "Tau Empire", CardTypeID: 10, CardTypeName: "combat", FileID: "file-1", Prompt: "p1"},
		{FactionID: 2, FactionName: "Iron Hands", CardTypeID: 10, CardTypeName: "combat", FileID: "file-1", Prompt: "p2"},
	}
	text, lines, err := Build(items, "gpt-image-2", "816x1104", "low", "high")
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 || lines[0].CustomID != "tau_empire__combat" || lines[1].CustomID != "iron_hands__combat" {
		t.Fatalf("lines: %+v", lines)
	}
	raws := strings.Split(strings.TrimRight(text, "\n"), "\n")
	if len(raws) != 2 {
		t.Fatalf("raw lines: %d", len(raws))
	}
	var parsed struct {
		CustomID string `json:"custom_id"`
		Method   string `json:"method"`
		URL      string `json:"url"`
		Body     struct {
			Model         string              `json:"model"`
			Image         []map[string]string `json:"image"`
			Prompt        string              `json:"prompt"`
			Size          string              `json:"size"`
			Quality       string              `json:"quality"`
			InputFidelity string              `json:"input_fidelity"`
			OutputFormat  string              `json:"output_format"`
			N             int                 `json:"n"`
		} `json:"body"`
	}
	if err := json.Unmarshal([]byte(raws[0]), &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.CustomID != "tau_empire__combat" || parsed.Method != "POST" || parsed.URL != "/v1/images/edits" ||
		parsed.Body.Model != "gpt-image-2" || parsed.Body.Image[0]["file_id"] != "file-1" || parsed.Body.Prompt != "p1" ||
		parsed.Body.Size != "816x1104" || parsed.Body.Quality != "low" || parsed.Body.InputFidelity != "high" ||
		parsed.Body.OutputFormat != "png" || parsed.Body.N != 1 {
		t.Fatalf("parsed: %+v", parsed)
	}
}

func TestBuildDedupesCollidingCustomIDs(t *testing.T) {
	items := []Item{
		{FactionID: 1, FactionName: "Tau!!", CardTypeID: 10, CardTypeName: "combat", FileID: "f", Prompt: "p"},
		{FactionID: 2, FactionName: "Tau??", CardTypeID: 10, CardTypeName: "combat", FileID: "f", Prompt: "p"},
	}
	_, lines, err := Build(items, "m", "s", "q", "f")
	if err != nil {
		t.Fatal(err)
	}
	if lines[0].CustomID == lines[1].CustomID {
		t.Fatalf("custom_ids collided: %+v", lines)
	}
	if lines[0].CustomID != "tau__combat" || lines[1].CustomID != "tau__combat-1" {
		t.Fatalf("dedup suffix: %+v", lines)
	}
}

func TestBuildRejectsEmpty(t *testing.T) {
	if _, _, err := Build(nil, "m", "s", "q", "f"); err == nil {
		t.Fatal("expected error for empty items")
	}
}

func TestBuildRejectsOverCap(t *testing.T) {
	items := make([]Item, MaxLines+1)
	for i := range items {
		items[i] = Item{FactionID: int64(i), FactionName: "f", CardTypeID: int64(i), CardTypeName: "c", FileID: "x", Prompt: "p"}
	}
	_, _, err := Build(items, "m", "s", "q", "f")
	if err == nil || !strings.Contains(err.Error(), "1001") {
		t.Fatalf("err = %v", err)
	}
}
