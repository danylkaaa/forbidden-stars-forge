package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func pngOf(w, h int, at func(x, y int) color.NRGBA) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetNRGBA(x, y, at(x, y))
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

var (
	red  = color.NRGBA{255, 0, 0, 255}
	blue = color.NRGBA{0, 0, 255, 255}
)

func TestAreaEditCreatesLinkedGenerationAndProtectsUnmaskedArea(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h, _, dataDir := newTestRouterWithStore(t)
	fid, ctid := setupGenFixtures(t, h)

	original := pngOf(40, 10, func(int, int) color.NRGBA { return red })
	edited := pngOf(40, 10, func(int, int) color.NRGBA { return blue })
	var editBody map[string]any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		out := original
		if _, isEdit := body["mask"]; isEdit {
			editBody, out = body, edited
		}
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":10,"output_tokens":10}}`, base64.StdEncoding.EncodeToString(out))
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	_, g := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	parentID := int64(g["id"].(float64))
	if done := pollGeneration(t, h, parentID); done["status"] != "done" {
		t.Fatalf("parent: %v", done)
	}

	mask := pngOf(40, 10, func(x, _ int) color.NRGBA { // edit the left half
		if x < 20 {
			return color.NRGBA{0, 0, 0, 0}
		}
		return color.NRGBA{0, 0, 0, 255}
	})
	body := fmt.Sprintf(`{"parent":{"kind":"generation","id":%d},"mask":"data:image/png;base64,%s","instruction":"add a cog","protect":true}`,
		parentID, base64.StdEncoding.EncodeToString(mask))
	rec, out := doJSON(t, h, http.MethodPost, "/api/image-edits", body)
	if rec.Code != http.StatusCreated || out["parent_kind"] != "generation" || out["parent_id"] != float64(parentID) ||
		out["parent_name"] != "1-tau-combat-low" || out["name"] != "2-tau-combat-low" || out["edit_instruction"] != "add a cog" {
		t.Fatalf("edit: %d %v", rec.Code, out)
	}
	done := pollGeneration(t, h, int64(out["id"].(float64)))
	if done["status"] != "done" {
		t.Fatalf("edit result: %v", done)
	}

	img := editBody["images"].([]any)[0].(map[string]any)
	if !strings.HasPrefix(img["image_url"].(string), "data:image/png;base64,") ||
		!strings.HasPrefix(editBody["mask"].(map[string]any)["image_url"].(string), "data:image/png;base64,") {
		t.Fatalf("edit request images/mask: %v", editBody)
	}
	if p := editBody["prompt"].(string); !strings.Contains(p, "## Edit\nadd a cog") || !strings.Contains(p, "fill crimson zone") {
		t.Fatalf("edit prompt:\n%s", p)
	}

	saved, err := os.ReadFile(filepath.Join(dataDir, done["image_path"].(string)))
	if err != nil {
		t.Fatal(err)
	}
	res, _ := png.Decode(bytes.NewReader(saved))
	px := func(x int) color.NRGBA { return color.NRGBAModel.Convert(res.At(x, 5)).(color.NRGBA) }
	if px(2) != blue || px(37) != red {
		t.Fatalf("protect: left=%v right=%v", px(2), px(37))
	}
}

func TestAreaEditValidation(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	mask := base64.StdEncoding.EncodeToString(pngOf(4, 4, func(int, int) color.NRGBA { return red }))
	for name, c := range map[string]struct {
		body string
		code int
	}{
		"no instruction": {`{"parent":{"kind":"generation","id":1},"mask":"data:image/png;base64,` + mask + `"}`, 400},
		"no mask":        {`{"parent":{"kind":"generation","id":1},"instruction":"x"}`, 400},
		"bad kind":       {`{"parent":{"kind":"nope","id":1},"mask":"data:image/png;base64,` + mask + `","instruction":"x"}`, 400},
		"missing parent": {`{"parent":{"kind":"generation","id":99},"mask":"data:image/png;base64,` + mask + `","instruction":"x"}`, 404},
	} {
		if rec, out := doJSON(t, h, http.MethodPost, "/api/image-edits", c.body); rec.Code != c.code {
			t.Errorf("%s: %d %v", name, rec.Code, out)
		}
	}
}
