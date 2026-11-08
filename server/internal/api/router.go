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
			usageStore := store.NewUsageStore(db)

			settings := &SettingsHandler{Store: settingsStore}
			r.Get("/settings", settings.Get)
			r.Put("/settings", settings.Put)
			r.Post("/settings/test-openai", settings.TestOpenAI)
			r.Post("/settings/test-claude", settings.TestClaude)
			r.Post("/settings/openai-models", settings.OpenAIModels)

			factions := &FactionsHandler{Store: factionsStore, Cards: cardsStore}
			r.Get("/factions", factions.List)
			r.Post("/factions", factions.Create)
			r.Put("/factions/{id}", factions.Update)
			r.Delete("/factions/{id}", factions.Delete)
			logos := &LogosHandler{Store: store.NewLogosStore(db), Factions: factionsStore, DataDir: dataDir}
			factionCards := &FactionCardsHandler{Store: store.NewFactionCardsStore(db), Factions: factionsStore, DataDir: dataDir}
			r.Get("/faction-card-layout", factionCards.GetLayout)
			r.Put("/faction-card-layout", factionCards.SaveLayout)
			r.Get("/faction-cards", factionCards.List)
			r.Get("/faction-cards/{id}", factionCards.Get)
			r.Put("/faction-cards/{id}", factionCards.Save)
			r.Get("/faction-card-defaults", factionCards.Defaults)
			r.Put("/faction-cards/{id}/assets/{key}", factionCards.UploadAsset)
			r.Get("/faction-cards/{id}/assets/{key}", factionCards.Asset)
			r.Delete("/faction-cards/{id}/assets/{key}", factionCards.DeleteAsset)
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
			r.Delete("/cards", cards.DeleteAll)
			r.Get("/assembly-layout", cards.GetAssemblyLayout)
			r.Put("/assembly-layout", cards.SaveAssemblyLayout)
			r.Get("/card-type-layouts", cards.CardTypeLayouts)
			r.Put("/card-type-layouts/{category}", cards.SaveCardTypeLayout)
			r.Get("/assembly-templates", cards.AssemblyTemplates)
			r.Put("/assembly-templates", cards.SaveAssemblyTemplate)
			r.Get("/nebulas", cards.Nebulas)
			r.Put("/nebulas/{id}", cards.SaveNebula)
			r.Get("/faction-banners", cards.FactionBanners)
			r.Put("/faction-banners/{id}", cards.SaveFactionBanner)
			r.Get("/faction-event-elements", cards.FactionEventElements)
			r.Put("/faction-event-elements/{id}", cards.SaveFactionEventElement)
			r.Get("/nebula-placements", cards.NebulaPlacements)
			r.Put("/nebula-placements/{id}/{category}", cards.SaveNebulaPlacement)
			r.Get("/reference-cards", cards.ReferenceCards)
			r.Post("/reference-cards/{category}", cards.UploadReferenceCard)
			r.Get("/reference-cards/{id}/image", cards.GetReferenceCard)
			r.Delete("/reference-cards/{id}", cards.DeleteReferenceCard)
			r.Get("/card-logo-scales", cards.CardLogoScales)
			r.Put("/card-logo-scales/{id}/{category}", cards.SaveCardLogoScale)
			r.Get("/faction-colors", cards.FactionColors)
			r.Put("/faction-colors/{id}", cards.SaveFactionColor)
			r.Get("/nebula-pictures", cards.NebulaPictures)
			r.Get("/nebula-pictures/{category}", cards.GetNebulaPicture)
			r.Put("/nebula-pictures/{category}", cards.UploadNebulaPicture)
			r.Delete("/nebula-pictures/{category}", cards.DeleteNebulaPicture)
			r.Get("/overlay-adjustments", cards.OverlayAdjustments)
			r.Put("/overlay-adjustments/{id}/{overlay}", cards.SaveOverlayAdjustment)
			r.Put("/assembly-templates/{id}/{category}/{side}/adjust", cards.SaveTemplateAdjust)
			r.Put("/assembly-templates/{id}/{category}/logo", cards.UploadBackLogo)
			r.Get("/assembly-templates/{id}/{category}/logo", cards.GetBackLogo)
			r.Delete("/assembly-templates/{id}/{category}/logo", cards.DeleteBackLogo)
			r.Get("/cards/{id}/assembly", cards.GetAssembly)
			r.Put("/cards/{id}/assembly", cards.SaveAssembly)
			r.Post("/cards/{id}/artwork", cards.UploadArtwork)
			artworkAI := &ArtworkExtendHandler{Cards: cards, Settings: settingsStore}
			r.Post("/cards/{id}/artwork/extend", artworkAI.Extend)
			r.Post("/cards/{id}/artwork/enhance", artworkAI.Enhance)
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
				DataDir:  dataDir,
			}
			r.Get("/card-types", cardTypes.List)
			r.Post("/card-types", cardTypes.Create)
			r.Put("/card-types/{id}", cardTypes.Update)
			r.Delete("/card-types/{id}", cardTypes.Delete)
			r.Get("/card-types/{id}/template", cardTypes.ServeTemplate)
			r.Delete("/card-types/{id}/template", cardTypes.DropTemplate)
			r.Put("/card-types/{id}/overlay", cardTypes.PutOverlay)
			r.Delete("/card-types/{id}/overlay", cardTypes.DeleteOverlay)
			r.Get("/card-types/{id}/overlay", cardTypes.ServeOverlay)
			r.Post("/card-types/{id}/upload-to-openai", cardTypes.UploadToOpenAI)

			masksStore := store.NewImageMasksStore(db)
			gens := &GenerationsHandler{
				Gens:      store.NewGenerationsStore(db),
				Factions:  factionsStore,
				CardTypes: cardTypesStore,
				Settings:  settingsStore,
				Usage:     usageStore,
				Masks:     masksStore,
				DataDir:   dataDir,
			}
			masks := &MasksHandler{Masks: masksStore, Gens: gens.Gens}
			r.Get("/image-masks", masks.List)
			r.Get("/generations/{id}/mask", masks.Get)
			r.Put("/generations/{id}/mask", masks.Put)
			r.Delete("/generations/{id}/mask", masks.Delete)
			r.Post("/generate", gens.Generate)
			r.Post("/image-edits", gens.Edit)
			r.Get("/generate/preview", gens.Preview)
			r.Post("/generate/assemble", gens.Assemble)
			r.Post("/generations/upload", gens.Upload)
			r.Get("/generations", gens.List)
			r.Get("/generations/{id}", gens.Get)
			r.Delete("/generations/{id}", gens.Delete)
			r.Get("/generations/{id}/image", gens.ServeImage)
			r.Put("/generations/{id}/favorite", gens.SetFavorite)
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
