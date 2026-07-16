package api

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"cardforge/internal/jobs"
	"cardforge/internal/store"
)

func NewRouter(db *sql.DB, staticFS fs.FS) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		})
		if db != nil {
			settings := &SettingsHandler{Store: store.NewSettingsStore(db)}
			r.Get("/settings", settings.Get)
			r.Put("/settings", settings.Put)
			r.Post("/settings/test-openai", settings.TestOpenAI)
			r.Post("/settings/test-claude", settings.TestClaude)

			factions := &FactionsHandler{Store: store.NewFactionsStore(db)}
			r.Get("/factions", factions.List)
			r.Post("/factions", factions.Create)
			r.Put("/factions/{id}", factions.Update)
			r.Delete("/factions/{id}", factions.Delete)
			r.Get("/factions/{id}/revisions", factions.Revisions)
			r.Post("/factions/{id}/revisions/{revID}/restore", factions.Restore)

			jobsH := &JobsHandler{Registry: jobs.New(60 * time.Second), Settings: store.NewSettingsStore(db)}
			r.Post("/factions/generate-description", jobsH.GenerateDescription)
			r.Get("/jobs/{id}", jobsH.Get)
			r.Post("/jobs/{id}/cancel", jobsH.Cancel)
		}
	})

	if staticFS != nil {
		r.NotFound(spaHandler(staticFS))
	}

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
