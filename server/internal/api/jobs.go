package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

func (h *JobsHandler) runner() *claude.Runner {
	all, err := h.Settings.GetAll()
	if err != nil {
		return &claude.Runner{}
	}
	return claudeRunner(all)
}

// claudeRunner configures the CLI from settings (binary, model, effort).
func claudeRunner(all map[string]string) *claude.Runner {
	return &claude.Runner{Binary: all["claude_binary"], Model: all["claude_model"], Effort: all["claude_effort"]}
}

func (h *JobsHandler) GenerateDescription(w http.ResponseWriter, r *http.Request) {
	// Messages, when present, turn this into an edit conversation on top of
	// CurrentDescription; without them it's the one-shot generator.
	var req struct {
		Name               string           `json:"name"`
		DLC                string           `json:"dlc"`
		PrimaryColor       string           `json:"primary_color"`
		Texture            string           `json:"texture"`
		CurrentDescription string           `json:"current_description"`
		Messages           []prompt.Message `json:"messages"`
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

	if err := validateChat(req.Messages); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	runner := h.runner()
	p := prompt.FactionDescription(req.Name, req.DLC)
	if len(req.Messages) > 0 {
		p = prompt.FactionDescriptionChat(req.Name, req.DLC, req.PrimaryColor, req.Texture, req.CurrentDescription, req.Messages)
	}
	id := h.Registry.Start(func(ctx context.Context) (string, error) {
		return runner.Run(ctx, p)
	})
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": id, "status": "pending"})
}

// CardTypeAssist starts a Claude job that edits a card type's description
// or constraints following the conversation in messages. The card type's
// current (unsaved) fields come from the request so drafts work too.
func (h *JobsHandler) CardTypeAssist(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Field       string           `json:"field"`
		Name        string           `json:"name"`
		Description string           `json:"description"`
		Constraints string           `json:"constraints"`
		Messages    []prompt.Message `json:"messages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if !oneOf(req.Field, "description", "constraints") {
		writeError(w, http.StatusBadRequest, "field must be description or constraints")
		return
	}
	if len(req.Messages) == 0 {
		writeError(w, http.StatusBadRequest, "messages are required")
		return
	}
	if err := validateChat(req.Messages); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	runner := h.runner()
	p := prompt.CardTypeFieldChat(req.Field, strings.TrimSpace(req.Name), req.Description, req.Constraints, req.Messages)
	id := h.Registry.Start(func(ctx context.Context) (string, error) {
		return runner.Run(ctx, p)
	})
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": id, "status": "pending"})
}

// ImagePromptAssist starts a Claude job that edits a full image-edit
// prompt (Test Generation's prompt override) following the conversation.
func (h *JobsHandler) ImagePromptAssist(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPrompt string           `json:"current_prompt"`
		Messages      []prompt.Message `json:"messages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if strings.TrimSpace(req.CurrentPrompt) == "" {
		writeError(w, http.StatusBadRequest, "current_prompt is required")
		return
	}
	if len(req.Messages) == 0 {
		writeError(w, http.StatusBadRequest, "messages are required")
		return
	}
	if err := validateChat(req.Messages); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	runner := h.runner()
	p := prompt.ImagePromptChat(req.CurrentPrompt, req.Messages)
	id := h.Registry.Start(func(ctx context.Context) (string, error) {
		return runner.Run(ctx, p)
	})
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": id, "status": "pending"})
}

const (
	maxChatMessages  = 40
	maxMessageLength = 20000
)

// validateChat requires user/assistant turns that alternate, start and end
// with the user, and stay within size limits.
func validateChat(msgs []prompt.Message) error {
	if len(msgs) == 0 {
		return nil
	}
	if len(msgs) > maxChatMessages {
		return fmt.Errorf("conversation too long (max %d messages)", maxChatMessages)
	}
	for i, m := range msgs {
		want := "user"
		if i%2 == 1 {
			want = "assistant"
		}
		if m.Role != want {
			return fmt.Errorf("messages[%d].role must be %q", i, want)
		}
		if len(m.Content) > maxMessageLength {
			return fmt.Errorf("messages[%d] too long (max %d characters)", i, maxMessageLength)
		}
	}
	if len(msgs)%2 == 0 {
		return errors.New("last message must be from the user")
	}
	return nil
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
