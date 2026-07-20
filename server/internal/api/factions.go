package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"cardforge/internal/store"
)

var dlcValues = []string{"Galaxy in Flames", "Symphony of War", "Darkest Dawn"}

type FactionsHandler struct {
	Store   *store.FactionsStore
	Batches *store.BatchesStore
}

type factionSave struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	DLC         string `json:"dlc"`
	Source      string `json:"source"`
}

func decodeFactionSave(r *http.Request) (factionSave, string) {
	var s factionSave
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		return s, "invalid JSON: " + err.Error()
	}
	s.Name = strings.TrimSpace(s.Name)
	if s.Name == "" {
		return s, "name is required"
	}
	if !oneOf(s.DLC, dlcValues...) {
		return s, "dlc must be one of: " + strings.Join(dlcValues, ", ")
	}
	if s.Source == "" {
		s.Source = "manual"
	}
	if !oneOf(s.Source, "manual", "claude") {
		return s, "source must be manual or claude"
	}
	return s, ""
}

func idParam(r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	return id, err == nil
}

func (h *FactionsHandler) storeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "faction not found")
	case errors.Is(err, store.ErrDuplicateName):
		writeError(w, http.StatusConflict, "a faction with this name already exists")
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

func (h *FactionsHandler) List(w http.ResponseWriter, _ *http.Request) {
	all, err := h.Store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, all)
}

func (h *FactionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	s, msg := decodeFactionSave(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	f, err := h.Store.Create(s.Name, s.Description, s.DLC, s.Source)
	if err != nil {
		h.storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func (h *FactionsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	s, msg := decodeFactionSave(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	f, _, err := h.Store.Update(id, s.Name, s.Description, s.DLC, s.Source)
	if err != nil {
		h.storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, f)
}

func (h *FactionsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ref, err := h.Batches.FactionReferenced(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ref {
		writeError(w, http.StatusConflict, "referenced by a batch — cannot delete")
		return
	}
	if err := h.Store.Delete(id); err != nil {
		h.storeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *FactionsHandler) Revisions(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	revs, err := h.Store.Revisions(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, revs)
}

func (h *FactionsHandler) Restore(w http.ResponseWriter, r *http.Request) {
	id, ok1 := idParam(r, "id")
	revID, ok2 := idParam(r, "revID")
	if !ok1 || !ok2 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	f, err := h.Store.Restore(id, revID)
	if err != nil {
		h.storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, f)
}
