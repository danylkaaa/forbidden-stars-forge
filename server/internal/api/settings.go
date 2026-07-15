package api

import (
	"encoding/json"
	"net/http"
	"os"

	"cardforge/internal/store"
)

type SettingsHandler struct {
	Store *store.SettingsStore
}

type settingsResponse struct {
	OpenAIAPIKeyMasked  string `json:"openai_api_key_masked"`
	OpenAIAPIKeyFromEnv bool   `json:"openai_api_key_from_env"`
	OpenAIModel         string `json:"openai_model"`
	ImageSize           string `json:"image_size"`
	DraftQuality        string `json:"draft_quality"`
	FinalQuality        string `json:"final_quality"`
	InputFidelity       string `json:"input_fidelity"`
	ClaudeBinary        string `json:"claude_binary"`
	PriceTable          string `json:"price_table"`
}

type settingsUpdate struct {
	OpenAIAPIKey  string `json:"openai_api_key"`
	OpenAIModel   string `json:"openai_model"`
	ImageSize     string `json:"image_size"`
	DraftQuality  string `json:"draft_quality"`
	FinalQuality  string `json:"final_quality"`
	InputFidelity string `json:"input_fidelity"`
	ClaudeBinary  string `json:"claude_binary"`
	PriceTable    string `json:"price_table"`
}

func maskKey(key string) string {
	if key == "" {
		return ""
	}
	last4 := key
	if len(key) > 4 {
		last4 = key[len(key)-4:]
	}
	return "sk-…" + last4
}

func oneOf(v string, allowed ...string) bool {
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

func (h *SettingsHandler) buildResponse() (settingsResponse, error) {
	all, err := h.Store.GetAll()
	if err != nil {
		return settingsResponse{}, err
	}
	key, fromEnv := all["openai_api_key"], false
	if env := os.Getenv("OPENAI_API_KEY"); env != "" {
		key, fromEnv = env, true
	}
	return settingsResponse{
		OpenAIAPIKeyMasked:  maskKey(key),
		OpenAIAPIKeyFromEnv: fromEnv,
		OpenAIModel:         all["openai_model"],
		ImageSize:           all["image_size"],
		DraftQuality:        all["draft_quality"],
		FinalQuality:        all["final_quality"],
		InputFidelity:       all["input_fidelity"],
		ClaudeBinary:        all["claude_binary"],
		PriceTable:          all["price_table"],
	}, nil
}

func (h *SettingsHandler) Get(w http.ResponseWriter, _ *http.Request) {
	resp, err := h.buildResponse()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *SettingsHandler) Put(w http.ResponseWriter, r *http.Request) {
	var u settingsUpdate
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if !oneOf(u.DraftQuality, "low", "medium") {
		writeError(w, http.StatusBadRequest, "draft_quality must be low or medium")
		return
	}
	if !oneOf(u.FinalQuality, "medium", "high") {
		writeError(w, http.StatusBadRequest, "final_quality must be medium or high")
		return
	}
	if !oneOf(u.InputFidelity, "low", "high") {
		writeError(w, http.StatusBadRequest, "input_fidelity must be low or high")
		return
	}

	kv := map[string]string{
		"openai_model":   u.OpenAIModel,
		"image_size":     u.ImageSize,
		"draft_quality":  u.DraftQuality,
		"final_quality":  u.FinalQuality,
		"input_fidelity": u.InputFidelity,
		"claude_binary":  u.ClaudeBinary,
		"price_table":    u.PriceTable,
	}
	if u.OpenAIAPIKey != "" { // write-only: empty means "leave unchanged"
		kv["openai_api_key"] = u.OpenAIAPIKey
	}
	if err := h.Store.SetMany(kv); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	resp, err := h.buildResponse()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *SettingsHandler) TestOpenAI(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "stub: real connection test arrives with the Card Types milestone",
	})
}

func (h *SettingsHandler) TestClaude(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "stub: real CLI test arrives with the Factions milestone",
	})
}
