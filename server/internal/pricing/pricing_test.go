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
	got := pt.Cost("gpt-image-2", 1200, 4800)
	if got < 0.2039 || got > 0.2041 {
		t.Fatalf("cost = %v", got)
	}
	if pt.Cost("unknown-model", 1000, 1000) != 0 {
		t.Fatal("unknown model should cost 0")
	}
}

func TestEstimatePerImage(t *testing.T) {
	cases := map[string]float64{"low": 0.01, "medium": 0.06, "high": 0.19, "bogus": 0}
	for q, want := range cases {
		if got := EstimatePerImage(q); got != want {
			t.Fatalf("%s = %v, want %v", q, got, want)
		}
	}
}
