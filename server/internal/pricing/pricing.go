// Package pricing converts OpenAI token usage to USD via the editable
// price_table setting, and provides labeled per-image estimates.
package pricing

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
)

// ModelPrice: InputPer1MUSD is the image-input rate. GPT Image models bill
// prompt text tokens at a lower rate; when TextInputPer1MUSD is set, the
// text share of input tokens is priced at it instead.
type ModelPrice struct {
	InputPer1MUSD     float64 `json:"input_per_1m_usd"`
	TextInputPer1MUSD float64 `json:"text_input_per_1m_usd,omitempty"`
	OutputPer1MUSD    float64 `json:"output_per_1m_usd"`
}

// Usage is the token usage reported by an images response. TextInputTokens
// is the text part of InputTokens (usage.input_tokens_details.text_tokens).
type Usage struct {
	InputTokens     int64
	TextInputTokens int64
	OutputTokens    int64
}

type PriceTable map[string]ModelPrice

// Parse reads the price_table JSON. Non-object values (e.g. the seeded
// "note" string) are skipped rather than treated as errors.
func Parse(jsonStr string) (PriceTable, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(jsonStr), &raw); err != nil {
		return nil, err
	}
	out := make(PriceTable)
	for k, v := range raw {
		var mp ModelPrice
		if err := json.Unmarshal(v, &mp); err == nil {
			var probe map[string]any
			if json.Unmarshal(v, &probe) == nil {
				out[k] = mp
			}
		}
	}
	return out, nil
}

var snapshotSuffix = regexp.MustCompile(`-\d{4}-\d{2}-\d{2}$`)

// lookup finds a model's prices; a dated snapshot (gpt-image-2-2026-04-21)
// falls back to its base model's entry.
func (t PriceTable) lookup(model string) (ModelPrice, bool) {
	if mp, ok := t[model]; ok {
		return mp, true
	}
	mp, ok := t[snapshotSuffix.ReplaceAllString(model, "")]
	return mp, ok
}

// Cost returns the USD cost of u, or 0 for a model missing from the table.
func (t PriceTable) Cost(model string, u Usage) float64 {
	mp, ok := t.lookup(model)
	if !ok {
		return 0
	}
	imageIn, textIn := u.InputTokens, int64(0)
	if mp.TextInputPer1MUSD > 0 && u.TextInputTokens > 0 && u.TextInputTokens <= u.InputTokens {
		imageIn, textIn = u.InputTokens-u.TextInputTokens, u.TextInputTokens
	}
	return float64(imageIn)/1e6*mp.InputPer1MUSD +
		float64(textIn)/1e6*mp.TextInputPer1MUSD +
		float64(u.OutputTokens)/1e6*mp.OutputPer1MUSD
}

// Output tokens per quality, measured on gpt-image-2.x at 816x1104
// (~0.9 MP): low=140, high=1219. Medium isn't measured yet; 310 follows
// OpenAI's published low:medium:high ratio for GPT Image. Output tokens are
// fixed per quality and size, so these scale with the requested area.
var outputTokensAt816x1104 = map[string]int64{"low": 140, "medium": 310, "high": 1219}

const (
	measuredArea = 816 * 1104
	// Typical input when there's no history: template image + Markdown
	// prompt, roughly half image and half text tokens.
	defaultImageInputTokens = 900
	defaultTextInputTokens  = 800
	BatchDiscount           = 0.5 // Batch API price is 50% of standard
)

// PastRun is a finished run's output tokens and its cost at standard
// (non-batch) prices — batch costs doubled back.
type PastRun struct {
	OutputTokens int64
	StandardCost float64
}

// OutputTokens estimates the image output tokens for a quality and size
// ("WxH"; anything else is treated as the measured size). Unknown qualities
// (xhigh, max, auto) fall back to high.
func OutputTokens(quality, size string) int64 {
	base, ok := outputTokensAt816x1104[quality]
	if !ok {
		base = outputTokensAt816x1104["high"]
	}
	var w, h int64
	if _, err := fmt.Sscanf(size, "%dx%d", &w, &h); err != nil || w <= 0 || h <= 0 {
		return base
	}
	return base * w * h / measuredArea
}

// EstimatePerImage estimates one standard (non-batch) image's cost: the
// output part from quality+size, the input part (template image + prompt,
// text and image tokens priced differently) from the median input cost of
// recent real runs, or a typical default. Returns 0 when the model has no
// price.
func (t PriceTable) EstimatePerImage(model, quality, size string, past []PastRun) float64 {
	mp, ok := t.lookup(model)
	if !ok {
		return 0
	}
	inputCost := float64(defaultImageInputTokens)/1e6*mp.InputPer1MUSD +
		float64(defaultTextInputTokens)/1e6*textRate(mp)
	if len(past) > 0 {
		costs := make([]float64, 0, len(past))
		for _, r := range past {
			costs = append(costs, max(0, r.StandardCost-float64(r.OutputTokens)/1e6*mp.OutputPer1MUSD))
		}
		sort.Float64s(costs)
		inputCost = costs[len(costs)/2]
	}
	return inputCost + float64(OutputTokens(quality, size))/1e6*mp.OutputPer1MUSD
}

func textRate(mp ModelPrice) float64 {
	if mp.TextInputPer1MUSD > 0 {
		return mp.TextInputPer1MUSD
	}
	return mp.InputPer1MUSD
}
