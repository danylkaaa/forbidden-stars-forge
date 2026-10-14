package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"strconv"
	"strings"

	"cardforge/internal/store"
)

type CardsHandler struct {
	Store    *store.CardsStore
	Factions *store.FactionsStore
	DataDir  string
}
type cardIssue struct {
	Index   *int   `json:"index,omitempty"`
	Field   string `json:"field"`
	Message string `json:"message"`
}

func issue(field, msg string) cardIssue { return cardIssue{Field: field, Message: msg} }
func cardErrors(w http.ResponseWriter, issues []cardIssue) {
	writeJSON(w, 400, map[string]any{"error": "Card validation failed", "errors": issues})
}
func readCardJSON(r *http.Request) (json.RawMessage, error) {
	// Keep accidental uploads bounded while accepting ordinary text-only decks.
	decoder := json.NewDecoder(io.LimitReader(r.Body, 10*1024*1024+1))
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return nil, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, errors.New("expected one JSON value")
	}
	if len(raw) > 10*1024*1024 {
		return nil, errors.New("JSON exceeds 10 MiB")
	}
	return raw, nil
}
func (h *CardsHandler) decode(raw json.RawMessage) (store.CardInput, []cardIssue, error) {
	var in store.CardInput
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil || obj == nil {
		return in, []cardIssue{issue("card", "must be an object")}, nil
	}

	// JSON allows 1.0 and 1e0 as integer values. Normalize exact integers
	// before decoding into int64 so the UI and backend agree on those forms.
	normalized := make(map[string]json.RawMessage, len(obj))
	for key, value := range obj {
		normalized[key] = value
	}
	for _, key := range []string{"faction_id", "level", "resource_cost", "shields", "guns", "eagles"} {
		value, exists := obj[key]
		if !exists {
			continue
		}
		value = bytes.TrimSpace(value)
		if len(value) == 0 || value[0] == '"' || bytes.Equal(value, []byte("null")) {
			continue
		}
		number, ok := new(big.Rat).SetString(string(value))
		if !ok || !number.IsInt() || !number.Num().IsInt64() {
			return in, []cardIssue{issue(key, "must be an integer in the allowed range")}, nil
		}
		normalized[key] = json.RawMessage(number.Num().String())
	}
	normalizedRaw, err := json.Marshal(normalized)
	if err != nil {
		return in, nil, err
	}
	if err := json.Unmarshal(normalizedRaw, &in); err != nil {
		field := "card"
		var te *json.UnmarshalTypeError
		if errors.As(err, &te) {
			field = te.Field
		}
		return in, []cardIssue{issue(field, "has an invalid JSON type")}, nil
	}
	issues := []cardIssue{}
	if in.Category == "combat" && in.Starting != nil && *in.Starting {
		startingDefaults(&in)
	}
	for _, e := range store.ValidateCard(in) {
		issues = append(issues, issue(e.Field, e.Message))
	}
	allowed := store.CardCategoryFields(in.Category)
	for key, value := range obj {
		if !allowed[key] {
			issues = append(issues, issue(key, "unknown field or field from another category"))
		} else if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			issues = append(issues, issue(key, "must not be null"))
		}
	}
	if in.FactionID > 0 {
		if _, err := h.Factions.Get(in.FactionID); errors.Is(err, store.ErrNotFound) {
			issues = append(issues, issue("faction_id", "faction does not exist"))
		} else if err != nil {
			return in, nil, err
		}
	}
	in.Name = strings.TrimSpace(in.Name)
	return in, issues, nil
}
func (h *CardsHandler) storeError(w http.ResponseWriter, err error) {
	var ve *store.CardValidationError
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, 404, "card not found")
	case errors.Is(err, store.ErrInvalidFaction):
		cardErrors(w, []cardIssue{issue("faction_id", err.Error())})
	case errors.As(err, &ve):
		issues := []cardIssue{}
		for _, e := range ve.Fields {
			issues = append(issues, issue(e.Field, e.Message))
		}
		cardErrors(w, issues)
	default:
		writeError(w, 500, err.Error())
	}
}
func (h *CardsHandler) List(w http.ResponseWriter, r *http.Request) {
	var faction int64
	if raw, exists := r.URL.Query()["faction_id"]; exists {
		var err error
		faction, err = strconv.ParseInt(raw[0], 10, 64)
		if err != nil || faction <= 0 || faction > store.MaxCardInteger {
			writeError(w, 400, "invalid faction_id filter")
			return
		}
	}
	category := r.URL.Query().Get("category")
	if category != "" && !oneOf(category, "combat", "schema", "upgrade") {
		writeError(w, 400, "invalid category filter")
		return
	}
	cs, err := h.Store.List(faction, category)
	if err != nil {
		h.storeError(w, err)
		return
	}
	writeJSON(w, 200, cs)
}
func (h *CardsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok || id <= 0 {
		writeError(w, 400, "invalid id")
		return
	}
	c, err := h.Store.Get(id)
	if err != nil {
		h.storeError(w, err)
		return
	}
	writeJSON(w, 200, c)
}
func (h *CardsHandler) save(w http.ResponseWriter, r *http.Request, update bool) {
	raw, err := readCardJSON(r)
	if err != nil {
		cardErrors(w, []cardIssue{issue("card", err.Error())})
		return
	}
	in, issues, err := h.decode(raw)
	if err != nil {
		h.storeError(w, err)
		return
	}
	if len(issues) > 0 {
		cardErrors(w, issues)
		return
	}
	var c store.Card
	status := 201
	if update {
		id, ok := idParam(r, "id")
		if !ok || id <= 0 {
			writeError(w, 400, "invalid id")
			return
		}
		c, err = h.Store.Update(id, in)
		status = 200
	} else {
		c, err = h.Store.Create(in)
	}
	if err != nil {
		h.storeError(w, err)
		return
	}
	writeJSON(w, status, c)
}
func (h *CardsHandler) Create(w http.ResponseWriter, r *http.Request) { h.save(w, r, false) }
func (h *CardsHandler) Update(w http.ResponseWriter, r *http.Request) { h.save(w, r, true) }
func (h *CardsHandler) Import(w http.ResponseWriter, r *http.Request) {
	raw, err := readCardJSON(r)
	if err != nil {
		cardErrors(w, []cardIssue{issue("cards", err.Error())})
		return
	}
	var obj map[string]json.RawMessage
	if err = json.Unmarshal(raw, &obj); err != nil || obj == nil {
		cardErrors(w, []cardIssue{issue("cards", "expected an object with a cards array")})
		return
	}
	issues := []cardIssue{}
	for key := range obj {
		if key != "cards" {
			issues = append(issues, issue(key, "unknown field"))
		}
	}
	var entries []json.RawMessage
	if err = json.Unmarshal(obj["cards"], &entries); err != nil || len(entries) == 0 {
		issues = append(issues, issue("cards", "must be a non-empty array"))
	}
	inputs := make([]store.CardInput, 0, len(entries))
	for i, entry := range entries {
		in, es, e := h.decode(entry)
		if e != nil {
			h.storeError(w, e)
			return
		}
		for _, v := range es {
			index := i
			v.Index = &index
			issues = append(issues, v)
		}
		inputs = append(inputs, in)
	}
	if len(issues) > 0 {
		cardErrors(w, issues)
		return
	}
	cards, err := h.Store.Import(inputs)
	if err != nil {
		h.storeError(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"cards": cards, "count": len(cards)})
}

// startingDefaults fills a starting card's level and price: both are 0, so
// they may be left out of an import. Other values are rejected by validation.
func startingDefaults(in *store.CardInput) {
	zero := int64(0)
	if in.Level == nil {
		in.Level = &zero
	}
	if in.ResourceCost == nil {
		in.ResourceCost = &zero
	}
}
