package api

import (
	"net/http"
	"net/http/httptest"
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
