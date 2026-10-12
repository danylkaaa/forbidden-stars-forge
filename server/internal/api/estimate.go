package api

import (
	"cardforge/internal/pricing"
	"cardforge/internal/store"
)

// estimatePerImage is the standard-price estimate for one image of the
// given model and mode, using the Settings quality/size and recent real
// runs (same model if any, else any model) to calibrate the input cost.
func estimatePerImage(usage *store.UsageStore, all map[string]string, model, mode string) float64 {
	quality := all["draft_quality"]
	if mode == "final" {
		quality = all["final_quality"]
	}
	pt, err := pricing.Parse(all["price_table"])
	if err != nil {
		return 0
	}
	var past []pricing.PastRun
	if usage != nil {
		past, _ = usage.RecentRuns(model, 30)
		if len(past) == 0 {
			past, _ = usage.RecentRuns("", 30)
		}
	}
	return pt.EstimatePerImage(model, quality, all["image_size"], past)
}
