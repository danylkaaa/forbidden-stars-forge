// Package pricing converts OpenAI token usage to USD via the editable
// price_table setting, and provides labeled per-image estimates.
package pricing

import "encoding/json"

type ModelPrice struct {
	InputPer1MUSD  float64 `json:"input_per_1m_usd"`
	OutputPer1MUSD float64 `json:"output_per_1m_usd"`
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

func (t PriceTable) Cost(model string, inTok, outTok int64) float64 {
	mp, ok := t[model]
	if !ok {
		return 0
	}
	return float64(inTok)/1e6*mp.InputPer1MUSD + float64(outTok)/1e6*mp.OutputPer1MUSD
}

// EstimatePerImage is the rough pre-call lookup (PRD §7.3/§7.4 —
// hardcoded, clearly labeled "estimate" wherever shown).
func EstimatePerImage(quality string) float64 {
	switch quality {
	case "low":
		return 0.01
	case "medium":
		return 0.06
	case "high":
		return 0.19
	}
	return 0
}
