package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
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

// ArtworkExtendHandler asks the model to paint more around a card's artwork, so it fills the artwork area.
type ArtworkExtendHandler struct {
	Cards    *CardsHandler
	Settings *store.SettingsStore
}

const extendPrompt = "Extend (outpaint) this picture in all directions: keep the original picture exactly as it is, unchanged, in the centre of the new image, and paint new surroundings on every side that continue the scene seamlessly in the same art style, colours, lighting and level of detail. Fill every pixel of the image with painted content: the result must be fully opaque, with no transparent or empty areas, no alpha channel, no checkerboard and no blank margins. No borders, frames, text, logos or watermarks."

type extendResponse struct {
	store.CardAssembly
	CostUSD float64 `json:"cost_usd"`
}

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
	a, err := h.Cards.Store.Assembly(id)
	if err != nil {
		h.Cards.storeError(w, err)
		return
	}
	if a.ArtworkPath == "" {
		writeError(w, 400, "card has no artwork to extend")
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
	size := imaging.ExtendSize(in.Ratio)
	all, err := h.Settings.GetAll()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	prompt := extendPrompt
	if extra := strings.TrimSpace(in.Prompt); extra != "" {
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
	out := res.PNG
	path, err := h.Cards.writeArtwork(out)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	old := a.ArtworkPath
	a.ArtworkPath, a.ImageKey, a.Transform = path, "upload", store.ArtworkTransform{Scale: 1, Adjust: a.Transform.Adjust}
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
