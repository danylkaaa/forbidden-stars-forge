package api

import (
	"io/fs"
	"net/http"
	"strings"
)

// spaHandler serves files from staticFS; unknown paths fall back to
// index.html so client-side routes work on hard reload.
func spaHandler(staticFS fs.FS) http.HandlerFunc {
	fileServer := http.FileServerFS(staticFS)
	return func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(staticFS, p); err != nil {
			http.ServeFileFS(w, r, staticFS, "index.html")
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}
