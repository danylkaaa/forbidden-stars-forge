package api

import (
	"net/http"
	"path/filepath"
	"testing"

	"cardforge/internal/store"
)

func newTestRouterWithStore(t *testing.T) (http.Handler, string) {
	t.Helper()
	dataDir := t.TempDir()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewRouter(db, nil, dataDir), dataDir
}
