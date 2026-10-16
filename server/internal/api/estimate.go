package api

import (
	"sort"

	"cardforge/internal/pricing"
	"cardforge/internal/store"
)

// estimatePerImage is the standard-price estimate for one image of the
// given model and mode, using the Settings quality, the card type's size and recent real
// runs (same model if any, else any model) to calibrate the input cost.
func estimatePerImage(usage *store.UsageStore, all map[string]string, model, mode, size string) float64 {
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
	return pt.EstimatePerImage(model, quality, size, past)
}

// estimateSeconds is how long one image typically takes with these settings: the median of recent finished runs
// of the same model, quality and card type, else of the same model and quality; 0 when there is no history.
func estimateSeconds(usage *store.UsageStore, all map[string]string, model, mode string, cardTypeID int64) float64 {
	if usage == nil {
		return 0
	}
	quality := all["draft_quality"]
	if mode == "final" {
		quality = all["final_quality"]
	}
	for _, typeID := range []int64{cardTypeID, 0} {
		runs, err := usage.RecentDurations(model, quality, typeID, 20)
		if err == nil && len(runs) > 0 {
			return medianSeconds(runs)
		}
	}
	return 0
}

func medianSeconds(ms []int64) float64 {
	sorted := append([]int64(nil), ms...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	mid := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return float64(sorted[mid]) / 1000
	}
	return float64(sorted[mid-1]+sorted[mid]) / 2000
}
