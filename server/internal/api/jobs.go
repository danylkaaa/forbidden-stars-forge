package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"cardforge/internal/claude"
	"cardforge/internal/jobs"
	"cardforge/internal/prompt"
	"cardforge/internal/store"
)

type JobsHandler struct {
	Registry *jobs.Registry
	Settings *store.SettingsStore
}

func (h *JobsHandler) claudeBinary() string {
	all, err := h.Settings.GetAll()
	if err != nil {
		return "claude"
	}
	if b := all["claude_binary"]; b != "" {
		return b
	}
	return "claude"
}

func (h *JobsHandler) GenerateDescription(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
		DLC  string `json:"dlc"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if !oneOf(req.DLC, dlcValues...) {
		writeError(w, http.StatusBadRequest, "dlc must be one of: "+strings.Join(dlcValues, ", "))
		return
	}

	runner := &claude.Runner{Binary: h.claudeBinary()}
	p := prompt.FactionDescription(req.Name, req.DLC)
	id := h.Registry.Start(func(ctx context.Context) (string, error) {
		return runner.Run(ctx, p)
	})
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": id, "status": "pending"})
}

func (h *JobsHandler) Get(w http.ResponseWriter, r *http.Request) {
	job, ok := h.Registry.Get(chi.URLParam(r, "id"))
	if !ok {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (h *JobsHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	if !h.Registry.Cancel(chi.URLParam(r, "id")) {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
