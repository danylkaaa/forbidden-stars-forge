package api

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// DeleteMany deletes the listed cards together: all of them or none.
func (h *CardsHandler) DeleteMany(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var in struct {
		IDs []int64 `json:"ids"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF || len(in.IDs) == 0 || len(in.IDs) > 1000 {
		writeError(w, 400, "expected {\"ids\": [card ids]} with 1–1000 ids")
		return
	}
	files, err := h.Store.DeleteMany(in.IDs)
	if err != nil {
		h.storeError(w, err)
		return
	}
	for _, f := range files {
		_ = os.Remove(filepath.Join(h.DataDir, f))
	}
	writeJSON(w, 200, map[string]int{"deleted": len(in.IDs)})
}
