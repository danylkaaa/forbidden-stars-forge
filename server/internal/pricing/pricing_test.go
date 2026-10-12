package pricing

import "testing"

const seeded = `{"note":"estimates - edit to match current OpenAI pricing","gpt-image-2":{"input_per_1m_usd":10.0,"output_per_1m_usd":40.0}}`

func TestParseSkipsNonModelKeys(t *testing.T) {
	pt, err := Parse(seeded)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := pt["note"]; ok {
		t.Fatal("note should be skipped")
	}
	if pt["gpt-image-2"].InputPer1MUSD != 10.0 {
		t.Fatalf("prices: %+v", pt["gpt-image-2"])
	}
}

func TestParseInvalidJSON(t *testing.T) {
	if _, err := Parse("not json"); err == nil {
		t.Fatal("expected error")
	}
}

func TestCost(t *testing.T) {
	pt, _ := Parse(seeded)
	// 1200 input + 4800 output tokens: 1200/1M*10 + 4800/1M*40 = 0.012 + 0.192
	got := pt.Cost("gpt-image-2", Usage{InputTokens: 1200, OutputTokens: 4800})
	if got < 0.2039 || got > 0.2041 {
		t.Fatalf("cost = %v", got)
	}
	if pt.Cost("unknown-model", Usage{InputTokens: 1000, OutputTokens: 1000}) != 0 {
		t.Fatal("unknown model should cost 0")
	}
}

func TestCostSplitsTextInputAndResolvesSnapshots(t *testing.T) {
	pt, _ := Parse(`{"gpt-image-2":{"input_per_1m_usd":8,"text_input_per_1m_usd":5,"output_per_1m_usd":30}}`)
	// 1645 input (500 text, 1145 image) + 140 output:
	// 1145/1M*8 + 500/1M*5 + 140/1M*30 = 0.00916 + 0.0025 + 0.0042
	u := Usage{InputTokens: 1645, TextInputTokens: 500, OutputTokens: 140}
	for _, m := range []string{"gpt-image-2", "gpt-image-2-2026-04-21"} {
		if got := pt.Cost(m, u); got < 0.015859 || got > 0.015861 {
			t.Fatalf("%s cost = %v", m, got)
		}
	}
}

func TestEstimatePerImageMatchesMeasuredRuns(t *testing.T) {
	pt, _ := Parse(`{"gpt-image-2.5-flare":{"input_per_1m_usd":8,"text_input_per_1m_usd":5,"output_per_1m_usd":30}}`)
	// Real draft runs from this app (output tokens, cost).
	past := []PastRun{{140, 0.0156}, {140, 0.0152}, {140, 0.0163}, {1219, 0.0479}, {140, 0.0146}}
	// Real runs in this app: draft (low) ≈ $0.0156, final (high) ≈ $0.048.
	low := pt.EstimatePerImage("gpt-image-2.5-flare", "low", "816x1104", past)
	high := pt.EstimatePerImage("gpt-image-2.5-flare", "high", "816x1104", past)
	if low < 0.0150 || low > 0.0165 || high < 0.046 || high > 0.051 {
		t.Fatalf("low=%v high=%v", low, high)
	}
	if got := pt.EstimatePerImage("unknown", "low", "816x1104", past); got != 0 {
		t.Fatalf("unpriced model: %v", got)
	}
	// No history: typical input split, still in the right range.
	if got := pt.EstimatePerImage("gpt-image-2.5-flare", "low", "816x1104", nil); got < 0.014 || got > 0.017 {
		t.Fatalf("no-history low=%v", got)
	}
}

func TestOutputTokensScaleWithArea(t *testing.T) {
	if got := OutputTokens("high", "816x1104"); got != 1219 {
		t.Fatalf("measured size: %d", got)
	}
	if got := OutputTokens("high", "1632x2208"); got != 4876 {
		t.Fatalf("4x area: %d", got)
	}
	if OutputTokens("max", "auto") != 1219 {
		t.Fatal("unknown quality/size should fall back to high at the measured size")
	}
}
