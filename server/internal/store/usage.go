package store

import (
	"database/sql"

	"cardforge/internal/pricing"
)

// UsageStore reads token usage of past finished runs (Test Generation) to calibrate cost estimates.
type UsageStore struct {
	db *sql.DB
}

func NewUsageStore(db *sql.DB) *UsageStore {
	return &UsageStore{db: db}
}

// RecentRuns returns the most recent finished, priced runs with this model
// (any model when model is ""), newest first.
func (s *UsageStore) RecentRuns(model string, limit int) ([]pricing.PastRun, error) {
	rows, err := s.db.Query(`SELECT output_tokens, cost FROM (
			SELECT g.output_tokens, g.cost_usd AS cost, g.model, g.created_at AS at FROM generations g
			WHERE g.status = 'done' AND g.cost_usd > 0
		) WHERE (? = '' OR model = ?) ORDER BY at DESC LIMIT ?`, model, model, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]pricing.PastRun, 0)
	for rows.Next() {
		var r pricing.PastRun
		if err := rows.Scan(&r.OutputTokens, &r.StandardCost); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// RecentDurations returns how long (ms) the most recent finished runs took, newest first, for runs of this model
// and quality ("" matches any) on this card type (0 matches any).
func (s *UsageStore) RecentDurations(model, quality string, cardTypeID int64, limit int) ([]int64, error) {
	rows, err := s.db.Query(`SELECT duration_ms FROM generations
		WHERE status = 'done' AND duration_ms > 0 AND (? = '' OR model = ?) AND (? = '' OR quality = ?) AND (? = 0 OR card_type_id = ?)
		ORDER BY created_at DESC, id DESC LIMIT ?`, model, model, quality, quality, cardTypeID, cardTypeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []int64{}
	for rows.Next() {
		var ms int64
		if err := rows.Scan(&ms); err != nil {
			return nil, err
		}
		out = append(out, ms)
	}
	return out, rows.Err()
}
