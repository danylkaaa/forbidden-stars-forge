package api

import (
	"testing"

	"cardforge/internal/store"
)

func TestTheFactionCardFinalUsesItsOwnQualityWhereTheModelHasIt(t *testing.T) {
	all := map[string]string{"draft_quality": "low", "final_quality": "high", "faction_card_quality": "max"}
	board, combat := store.CardType{Name: "faction card"}, store.CardType{Name: "combat"}
	cases := []struct {
		mode  string
		ct    store.CardType
		model string
		want  string
	}{
		{"final", board, "gpt-image-2.5-flare", "max"},
		{"final", store.CardType{Name: "faction card back"}, "gpt-image-2.5-sunburst-2026-09-08", "max"},
		{"final", board, "gpt-image-2", "high"}, // no xhigh or max on this model
		{"draft", board, "gpt-image-2.5-flare", "low"},
		{"final", combat, "gpt-image-2.5-flare", "high"},
	}
	for _, c := range cases {
		if got := qualityFor(c.mode, all, c.ct, c.model); got != c.want {
			t.Errorf("%s %s %s: %s, want %s", c.mode, c.ct.Name, c.model, got, c.want)
		}
	}
	all["faction_card_quality"] = ""
	if got := qualityFor("final", all, board, "gpt-image-2.5-flare"); got != "high" {
		t.Errorf("unset: %s", got)
	}
}
