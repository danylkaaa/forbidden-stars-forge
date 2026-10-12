package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"cardforge/internal/openai"
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
	Background          string `json:"background"`
	ClaudeBinary        string `json:"claude_binary"`
	ClaudeModel         string `json:"claude_model"`
	ClaudeEffort        string `json:"claude_effort"`
	PriceTable          string `json:"price_table"`
}

type settingsUpdate struct {
	OpenAIAPIKey  string `json:"openai_api_key"`
	OpenAIModel   string `json:"openai_model"`
	ImageSize     string `json:"image_size"`
	DraftQuality  string `json:"draft_quality"`
	FinalQuality  string `json:"final_quality"`
	InputFidelity string `json:"input_fidelity"`
	Background    string `json:"background"`
	ClaudeBinary  string `json:"claude_binary"`
	ClaudeModel   string `json:"claude_model"`
	ClaudeEffort  string `json:"claude_effort"`
	PriceTable    string `json:"price_table"`
}

func maskKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 4 {
		return "sk-…****"
	}
	return "sk-…" + key[len(key)-4:]
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
		Background:          all["background"],
		ClaudeBinary:        all["claude_binary"],
		ClaudeModel:         all["claude_model"],
		ClaudeEffort:        all["claude_effort"],
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

	if u.Background == "" {
		u.Background = "auto"
	}
	if !oneOf(u.Background, "auto", "opaque", "transparent") {
		writeError(w, http.StatusBadRequest, "background must be auto, opaque or transparent")
		return
	}
	u.ClaudeModel = strings.TrimSpace(u.ClaudeModel)
	if !oneOf(u.ClaudeEffort, "", "low", "medium", "high", "xhigh", "max") {
		writeError(w, http.StatusBadRequest, "claude_effort must be empty, low, medium, high, xhigh or max")
		return
	}

	kv := map[string]string{
		"openai_model":   u.OpenAIModel,
		"image_size":     u.ImageSize,
		"draft_quality":  u.DraftQuality,
		"final_quality":  u.FinalQuality,
		"input_fidelity": u.InputFidelity,
		"background":     u.Background,
		"claude_binary":  u.ClaudeBinary,
		"claude_model":   u.ClaudeModel,
		"claude_effort":  u.ClaudeEffort,
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

func (h *SettingsHandler) TestOpenAI(w http.ResponseWriter, r *http.Request) {
	all, err := h.Store.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	client := openai.New(resolveOpenAIKey(all))
	client.BaseURL = openAIBaseURL
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	n, err := client.ListModels(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": fmt.Sprintf("Connected — %d models available", n)})
}

// OpenAIModels lists the image models available to an API key, for the
// Settings model dropdown. The body's api_key (a not-yet-saved key typed
// in the UI) wins; otherwise the env/stored key is used.
func (h *SettingsHandler) OpenAIModels(w http.ResponseWriter, r *http.Request) {
	var req struct {
		APIKey string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	key := req.APIKey
	if key == "" {
		all, err := h.Store.GetAll()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		key = resolveOpenAIKey(all)
	}
	client := openai.New(key)
	client.BaseURL = openAIBaseURL
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	models, err := client.ListImageModels(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

func (h *SettingsHandler) TestClaude(w http.ResponseWriter, r *http.Request) {
	all, err := h.Store.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	runner := claudeRunner(all)
	// Higher effort / bigger models can take a while even for "Reply with OK".
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	out, err := runner.Run(ctx, "Reply with OK")
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": out})
}
