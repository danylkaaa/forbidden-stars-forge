package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestSPAServesFilesAndFallsBackToIndex(t *testing.T) {
	staticFS := fstest.MapFS{
		"index.html":    {Data: []byte("<html>app</html>")},
		"assets/app.js": {Data: []byte("console.log(1)")},
	}
	r := NewRouter(nil, staticFS)

	cases := []struct {
		path string
		want string
	}{
		{"/", "<html>app</html>"},
		{"/assets/app.js", "console.log(1)"},
		{"/settings", "<html>app</html>"}, // client route → index fallback
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, c.path, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != 200 || rec.Body.String() != c.want {
			t.Fatalf("%s: code=%d body=%q", c.path, rec.Code, rec.Body.String())
		}
	}
}

func TestSPAFallbackExcludesAPIPaths(t *testing.T) {
	staticFS := fstest.MapFS{
		"index.html": {Data: []byte("<html>app</html>")},
	}
	r := NewRouter(nil, staticFS)

	req := httptest.NewRequest(http.MethodGet, "/api/does-not-exist", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("code=%d body=%q, want 404", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "<html>") {
		t.Fatalf("body=%q looks like HTML, want JSON error", rec.Body.String())
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Fatalf("Content-Type=%q, want application/json", ct)
	}
}
