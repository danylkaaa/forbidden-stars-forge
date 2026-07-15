package store

import (
	"path/filepath"
	"testing"
)

func openTestDB(t *testing.T) *SettingsStore {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewSettingsStore(db)
}

func TestGetAllReturnsSeededDefaults(t *testing.T) {
	s := openTestDB(t)
	all, err := s.GetAll()
	if err != nil {
		t.Fatal(err)
	}
	if all["draft_quality"] != "low" || all["final_quality"] != "high" {
		t.Fatalf("unexpected defaults: %v", all)
	}
}

func TestSetManyUpdatesValues(t *testing.T) {
	s := openTestDB(t)
	err := s.SetMany(map[string]string{
		"openai_model":  "gpt-image-3",
		"claude_binary": "/usr/local/bin/claude",
	})
	if err != nil {
		t.Fatal(err)
	}
	all, _ := s.GetAll()
	if all["openai_model"] != "gpt-image-3" {
		t.Fatalf("openai_model = %q", all["openai_model"])
	}
	if all["claude_binary"] != "/usr/local/bin/claude" {
		t.Fatalf("claude_binary = %q", all["claude_binary"])
	}
}

func TestSetManyIgnoresUnknownKeys(t *testing.T) {
	s := openTestDB(t)
	if err := s.SetMany(map[string]string{"bogus_key": "x"}); err != nil {
		t.Fatal(err)
	}
	all, _ := s.GetAll()
	if _, ok := all["bogus_key"]; ok {
		t.Fatal("unknown key was inserted")
	}
}
