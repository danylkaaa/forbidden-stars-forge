package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cardforge/internal/imaging"
	"cardforge/internal/openai"
	"cardforge/internal/pricing"
	"cardforge/internal/store"
)

// ArtworkExtendHandler has the model repaint a card's artwork: extend it around, or improve its quality.
type ArtworkExtendHandler struct {
	Cards    *CardsHandler
	Settings *store.SettingsStore
}

const extendPrompt = "Extend (outpaint) this picture in all directions: keep the original picture exactly as it is, unchanged, in the centre of the new image, and paint new surroundings on every side that continue the scene seamlessly in the same art style, colours, lighting and level of detail. Fill every pixel of the image with painted content: the result must be fully opaque, with no transparent or empty areas, no alpha channel, no checkerboard and no blank margins. No borders, frames, text, logos or watermarks."

type extendResponse struct {
	store.CardAssembly
	CostUSD float64 `json:"cost_usd"`
}

const enhancePrompt = "Improve the quality and resolution of this picture: render it at a higher resolution with finer detail, sharper edges and cleaner textures, and remove blur, noise, compression artifacts and banding. Keep the composition, subjects, poses, colours, lighting and art style exactly the same, and do not add, remove or move anything. Fill the whole frame: the result must be fully opaque, with no transparent or empty areas, no borders, frames, text, logos or watermarks."

// Extend sends the card's artwork and a prompt to the model, which paints more around it in all directions in a
// picture of the given width / height ratio (at final quality); the result replaces the artwork.
func (h *ArtworkExtendHandler) Extend(w http.ResponseWriter, r *http.Request) {
	id, ok := h.Cards.assemblyID(w, r)
	if !ok {
		return
	}
	var in struct {
		Ratio  float64 `json:"ratio"`
		Prompt string  `json:"prompt"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	if err := dec.Decode(&in); err != nil || in.Ratio < 0.1 || in.Ratio > 10 || dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "ratio (width / height, between 0.1 and 10) is required")
		return
	}
	h.redo(w, r, id, extendPrompt, in.Prompt, func(int, int) string { return imaging.ExtendSize(in.Ratio) }, false)
}

// Enhance sends the card's artwork to the model to be made sharper and more detailed, at a higher resolution and
// the same shape (at final quality); the result replaces the artwork, which keeps its place and size on the card.
func (h *ArtworkExtendHandler) Enhance(w http.ResponseWriter, r *http.Request) {
	id, ok := h.Cards.assemblyID(w, r)
	if !ok {
		return
	}
	var in struct {
		Prompt string `json:"prompt"`
	}
	if r.ContentLength != 0 {
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
		if err := dec.Decode(&in); err != nil || dec.Decode(new(any)) != io.EOF {
			writeError(w, 400, "invalid JSON")
			return
		}
	}
	h.redo(w, r, id, enhancePrompt, in.Prompt, imaging.EnhanceSize, true)
}

// redo has the model repaint the card's artwork with a prompt (plus the user's own words) at the size sizeFor gives
// for the artwork's pixel size, and replaces the artwork with the result. The artwork's place on the card is kept
// when `keepPlace`, else reset.
func (h *ArtworkExtendHandler) redo(w http.ResponseWriter, r *http.Request, id int64, prompt, extra string, sizeFor func(w, h int) string, keepPlace bool) {
	a, err := h.Cards.Store.Assembly(id)
	if err != nil {
		h.Cards.storeError(w, err)
		return
	}
	if a.ArtworkPath == "" {
		writeError(w, 400, "card has no artwork")
		return
	}
	data, err := os.ReadFile(filepath.Join(h.Cards.DataDir, a.ArtworkPath))
	if err != nil {
		writeError(w, 400, "artwork file is missing")
		return
	}
	input, err := imaging.AsPNG(data)
	if err != nil {
		writeError(w, 400, "the artwork cannot be read: "+err.Error())
		return
	}
	cfg, _, _ := image.DecodeConfig(bytes.NewReader(input))
	size := sizeFor(cfg.Width, cfg.Height)
	all, err := h.Settings.GetAll()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if extra = strings.TrimSpace(extra); extra != "" {
		prompt += " " + extra
	}
	client := openai.New(resolveOpenAIKey(all))
	client.BaseURL = openAIBaseURL
	ctx, cancel := context.WithTimeout(r.Context(), 240*time.Second)
	defer cancel()
	model := all["openai_model"]
	res, err := client.EditImage(ctx, openai.ImageEditRequest{
		Model: model, Prompt: prompt, Quality: all["final_quality"], Size: size,
		InputFidelity: all["input_fidelity"], Background: "opaque", // the whole picture is painted: no transparency
		ImageURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(input),
	})
	if err != nil {
		writeError(w, 502, err.Error())
		return
	}
	path, err := h.Cards.writeArtwork(res.PNG)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	old := a.ArtworkPath
	a.ArtworkPath, a.ImageKey = path, "upload"
	if !keepPlace {
		a.Transform = store.ArtworkTransform{Scale: 1, Adjust: a.Transform.Adjust}
	}
	saved, err := h.Cards.Store.SaveAssembly(a)
	if err != nil {
		_ = os.Remove(filepath.Join(h.Cards.DataDir, path))
		h.Cards.storeError(w, err)
		return
	}
	_ = os.Remove(filepath.Join(h.Cards.DataDir, old))
	cost := 0.0
	if pt, err := pricing.Parse(all["price_table"]); err == nil {
		cost = pt.Cost(model, pricing.Usage{InputTokens: res.InputTokens, TextInputTokens: res.TextInputTokens, OutputTokens: res.OutputTokens})
	}
	writeJSON(w, 200, extendResponse{CardAssembly: assemblyResponse(saved), CostUSD: cost})
}
