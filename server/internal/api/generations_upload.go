package api

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	pngenc "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"cardforge/internal/store"
)

// UploadedPrompt marks a generation whose image was uploaded, not generated.
const UploadedPrompt = "(uploaded)"

var nameSlug = regexp.MustCompile(`[^a-z0-9]+`)

// Upload adds your own image to a faction's library as a finished generation
// of a card type, so every picker lists and uses it like a generated one.
func (h *GenerationsHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 21<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "upload exceeds 20 MiB or is invalid")
		return
	}
	defer r.MultipartForm.RemoveAll()
	factionID, e1 := strconv.ParseInt(r.FormValue("faction_id"), 10, 64)
	cardTypeID, e2 := strconv.ParseInt(r.FormValue("card_type_id"), 10, 64)
	if e1 != nil || e2 != nil {
		writeError(w, http.StatusBadRequest, "faction_id and card_type_id are required")
		return
	}
	if _, _, ok := h.loadPair(w, factionID, cardTypeID); !ok {
		return
	}
	f, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, "image file is required")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (20<<20)+1))
	if err != nil || len(data) > 20<<20 {
		writeError(w, http.StatusBadRequest, "image must be under 20 MiB")
		return
	}
	img, kind, err := image.Decode(bytes.NewReader(data))
	if err != nil || (kind != "png" && kind != "jpeg") {
		writeError(w, http.StatusBadRequest, "image must be a PNG or JPEG")
		return
	}
	var out bytes.Buffer
	if err := pngenc.Encode(&out, img); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	label := strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename))
	if v := strings.TrimSpace(r.FormValue("name")); v != "" {
		label = v
	}
	suffix := "-upload"
	if s := strings.Trim(nameSlug.ReplaceAllString(strings.ToLower(label), "_"), "_"); s != "" {
		if len(s) > 40 {
			s = s[:40]
		}
		suffix = "-" + s
	}
	g, err := h.Gens.Create(factionID, cardTypeID, "draft", "upload", "", suffix, UploadedPrompt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rel := filepath.Join("generated", fmt.Sprintf("gen-%d.png", g.ID))
	err = os.MkdirAll(filepath.Join(h.DataDir, "generated"), 0o755)
	if err == nil {
		err = os.WriteFile(filepath.Join(h.DataDir, rel), out.Bytes(), 0o644)
	}
	if err != nil {
		_ = h.Gens.MarkFailed(g.ID, "save image: "+err.Error())
		writeError(w, http.StatusInternalServerError, "could not save the image")
		return
	}
	if err := h.Gens.MarkDone(g.ID, rel, 0, 0, 0, 0); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	g, err = h.Gens.Get(g.ID)
	if errors.Is(err, store.ErrNotFound) || err != nil {
		writeError(w, http.StatusInternalServerError, "uploaded image was not saved")
		return
	}
	writeJSON(w, http.StatusCreated, g)
}
