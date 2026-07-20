package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"cardforge/internal/batchpoller"
	"cardforge/internal/jobs"
	"cardforge/internal/openai"
	"cardforge/internal/store"
)

func NewRouter(db *sql.DB, staticFS fs.FS, dataDir string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		})
		if db != nil {
			settingsStore := store.NewSettingsStore(db)
			factionsStore := store.NewFactionsStore(db)
			cardTypesStore := store.NewCardTypesStore(db)
			batchesStore := store.NewBatchesStore(db)

			settings := &SettingsHandler{Store: settingsStore}
			r.Get("/settings", settings.Get)
			r.Put("/settings", settings.Put)
			r.Post("/settings/test-openai", settings.TestOpenAI)
			r.Post("/settings/test-claude", settings.TestClaude)

			factions := &FactionsHandler{Store: factionsStore, Batches: batchesStore}
			r.Get("/factions", factions.List)
			r.Post("/factions", factions.Create)
			r.Put("/factions/{id}", factions.Update)
			r.Delete("/factions/{id}", factions.Delete)
			r.Get("/factions/{id}/revisions", factions.Revisions)
			r.Post("/factions/{id}/revisions/{revID}/restore", factions.Restore)

			jobsH := &JobsHandler{Registry: jobs.New(60 * time.Second), Settings: settingsStore}
			r.Post("/factions/generate-description", jobsH.GenerateDescription)
			r.Get("/jobs/{id}", jobsH.Get)
			r.Post("/jobs/{id}/cancel", jobsH.Cancel)

			cardTypes := &CardTypesHandler{
				Store:    cardTypesStore,
				Settings: settingsStore,
				Batches:  batchesStore,
				DataDir:  dataDir,
			}
			r.Get("/card-types", cardTypes.List)
			r.Post("/card-types", cardTypes.Create)
			r.Put("/card-types/{id}", cardTypes.Update)
			r.Delete("/card-types/{id}", cardTypes.Delete)
			r.Get("/card-types/{id}/template", cardTypes.ServeTemplate)
			r.Post("/card-types/{id}/upload-to-openai", cardTypes.UploadToOpenAI)

			gens := &GenerationsHandler{
				Gens:      store.NewGenerationsStore(db),
				Factions:  factionsStore,
				CardTypes: cardTypesStore,
				Settings:  settingsStore,
				DataDir:   dataDir,
			}
			r.Post("/generate", gens.Generate)
			r.Get("/generate/preview", gens.Preview)
			r.Get("/generations", gens.List)
			r.Get("/generations/{id}", gens.Get)
			r.Get("/generations/{id}/image", gens.ServeImage)

			// The poller's own client factory reads openAIBaseURL/resolveOpenAIKey
			// fresh on every call, so tests that swap openAIBaseURL for a fake
			// server also cover any request the poller makes.
			poller := batchpoller.New(batchesStore, settingsStore, dataDir, func() (*openai.Client, error) {
				all, err := settingsStore.GetAll()
				if err != nil {
					return nil, err
				}
				c := openai.New(resolveOpenAIKey(all))
				c.BaseURL = openAIBaseURL
				return c, nil
			})
			go poller.Start(context.Background())

			batches := &BatchesHandler{
				Store:     batchesStore,
				Factions:  factionsStore,
				CardTypes: cardTypesStore,
				Settings:  settingsStore,
				Poller:    poller,
				DataDir:   dataDir,
			}
			r.Post("/batches/preview", batches.Preview)
			r.Post("/batches", batches.Create)
			r.Get("/batches", batches.List)
			r.Get("/batches/{id}", batches.Get)
			r.Post("/batches/{id}/cancel", batches.Cancel)
			r.Get("/batches/{id}/items/{itemID}/image", batches.ItemImage)
			r.Get("/batches/{id}/download", batches.Download)
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
