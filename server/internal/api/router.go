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
			cardsStore := store.NewCardsStore(db)
			batchesStore := store.NewBatchesStore(db)
			usageStore := store.NewUsageStore(db)

			settings := &SettingsHandler{Store: settingsStore}
			r.Get("/settings", settings.Get)
			r.Put("/settings", settings.Put)
			r.Post("/settings/test-openai", settings.TestOpenAI)
			r.Post("/settings/test-claude", settings.TestClaude)
			r.Post("/settings/openai-models", settings.OpenAIModels)

			factions := &FactionsHandler{Store: factionsStore, Batches: batchesStore, Cards: cardsStore}
			r.Get("/factions", factions.List)
			r.Post("/factions", factions.Create)
			r.Put("/factions/{id}", factions.Update)
			r.Delete("/factions/{id}", factions.Delete)
			logos := &LogosHandler{Store: store.NewLogosStore(db), Factions: factionsStore, DataDir: dataDir}
			r.Get("/faction-logos", logos.List)
			r.Get("/factions/{id}/logo", logos.Get)
			r.Put("/factions/{id}/logo", logos.Upload)
			r.Delete("/factions/{id}/logo", logos.Delete)
			r.Get("/factions/{id}/revisions", factions.Revisions)
			r.Post("/factions/{id}/revisions/{revID}/restore", factions.Restore)

			cards := &CardsHandler{Store: cardsStore, Factions: factionsStore, DataDir: dataDir}
			r.Get("/cards", cards.List)
			r.Get("/cards/{id}", cards.Get)
			r.Post("/cards", cards.Create)
			r.Put("/cards/{id}", cards.Update)
			r.Post("/cards/import", cards.Import)
			r.Post("/cards/delete", cards.DeleteMany)
			r.Get("/assembly-layout", cards.GetAssemblyLayout)
			r.Put("/assembly-layout", cards.SaveAssemblyLayout)
			subtypes := &SubtypesHandler{Store: store.NewSubtypesStore(db), DataDir: dataDir}
			r.Get("/subtypes", subtypes.List)
			r.Post("/subtypes", subtypes.Create)
			r.Put("/subtypes/{id}", subtypes.Rename)
			r.Delete("/subtypes/{id}", subtypes.Delete)
			r.Put("/subtypes/{id}/layout", subtypes.SetLayout)
			r.Post("/subtypes/{id}/overlays", subtypes.AddOverlay)
			r.Put("/subtypes/{id}/overlays/order", subtypes.Reorder)
			r.Get("/subtypes/{id}/overlays/{overlayID}", subtypes.Overlay)
			r.Delete("/subtypes/{id}/overlays/{overlayID}", subtypes.DeleteOverlay)
			r.Get("/card-type-layouts", cards.CardTypeLayouts)
			r.Put("/card-type-layouts/{category}", cards.SaveCardTypeLayout)
			r.Get("/assembly-templates", cards.AssemblyTemplates)
			r.Put("/assembly-templates", cards.SaveAssemblyTemplate)
			r.Put("/assembly-templates/{id}/{category}/logo", cards.UploadBackLogo)
			r.Get("/assembly-templates/{id}/{category}/logo", cards.GetBackLogo)
			r.Delete("/assembly-templates/{id}/{category}/logo", cards.DeleteBackLogo)
			r.Get("/cards/{id}/assembly", cards.GetAssembly)
			r.Put("/cards/{id}/assembly", cards.SaveAssembly)
			r.Post("/cards/{id}/artwork", cards.UploadArtwork)
			r.Get("/cards/{id}/artwork", cards.Artwork)

			jobsH := &JobsHandler{Registry: jobs.New(60 * time.Second), Settings: settingsStore}
			r.Post("/factions/generate-description", jobsH.GenerateDescription)
			r.Post("/card-types/assist", jobsH.CardTypeAssist)
			r.Post("/generate/prompt-assist", jobsH.ImagePromptAssist)
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
			r.Put("/card-types/{id}/overlay", cardTypes.PutOverlay)
			r.Delete("/card-types/{id}/overlay", cardTypes.DeleteOverlay)
			r.Get("/card-types/{id}/overlay", cardTypes.ServeOverlay)
			r.Post("/card-types/{id}/upload-to-openai", cardTypes.UploadToOpenAI)

			gens := &GenerationsHandler{
				Gens:      store.NewGenerationsStore(db),
				Factions:  factionsStore,
				CardTypes: cardTypesStore,
				Settings:  settingsStore,
				Batches:   batchesStore,
				Usage:     usageStore,
				DataDir:   dataDir,
			}
			r.Post("/generate", gens.Generate)
			r.Post("/image-edits", gens.Edit)
			r.Get("/generate/preview", gens.Preview)
			r.Post("/generate/assemble", gens.Assemble)
			r.Get("/generations", gens.List)
			r.Get("/generations/{id}", gens.Get)
			r.Delete("/generations/{id}", gens.Delete)
			r.Get("/generations/{id}/image", gens.ServeImage)
			r.Put("/generations/{id}/favorite", gens.SetFavorite)

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
				Usage:     usageStore,
				Poller:    poller,
				DataDir:   dataDir,
			}
			r.Post("/batches/preview", batches.Preview)
			r.Post("/batches", batches.Create)
			r.Get("/batches", batches.List)
			r.Get("/batches/{id}", batches.Get)
			r.Post("/batches/{id}/cancel", batches.Cancel)
			r.Get("/batches/{id}/items/{itemID}/image", batches.ItemImage)
			r.Delete("/batches/{id}/items/{itemID}", batches.DeleteItem)
			r.Put("/batches/{id}/items/{itemID}/favorite", batches.SetItemFavorite)
			r.Get("/batches/{id}/download", batches.Download)
			r.Get("/batch-items", batches.DoneItems)
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
