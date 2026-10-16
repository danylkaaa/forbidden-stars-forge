package store

import (
	"errors"
	"math"
)

// FactionEventElement is the ornament on a faction's event cards: a library image, with its
// place (offsets from the default spot, as shares of the card) and its width as a share of the card.
type FactionEventElement struct {
	FactionID    int64   `json:"faction_id"`
	ElementKey   string  `json:"element_key"`
	ElementX     float64 `json:"element_x"`
	ElementY     float64 `json:"element_y"`
	ElementScale float64 `json:"element_scale"`
}

func (s *CardsStore) FactionEventElements() ([]FactionEventElement, error) {
	rows, err := s.db.Query(`SELECT faction_id,element_key,element_x,element_y,element_scale FROM faction_event_elements ORDER BY faction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FactionEventElement{}
	for rows.Next() {
		var e FactionEventElement
		if err := rows.Scan(&e.FactionID, &e.ElementKey, &e.ElementX, &e.ElementY, &e.ElementScale); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *CardsStore) SaveFactionEventElement(e FactionEventElement) error {
	for _, v := range []float64{e.ElementX, e.ElementY, e.ElementScale} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("event element settings must be numbers")
		}
	}
	if math.Abs(e.ElementX) > 1 || math.Abs(e.ElementY) > 1 {
		return errors.New("element position must be between -1 and 1")
	}
	if e.ElementScale < 0.05 || e.ElementScale > 1.5 {
		return errors.New("element size must be between 0.05 and 1.5")
	}
	if e.ElementKey != "" {
		if _, err := s.AssemblySource(e.ElementKey); err != nil {
			return errors.New("selected element image does not exist")
		}
	}
	_, err := s.db.Exec(`INSERT INTO faction_event_elements(faction_id,element_key,element_x,element_y,element_scale) VALUES(?,?,?,?,?) ON CONFLICT(faction_id) DO UPDATE SET element_key=excluded.element_key,element_x=excluded.element_x,element_y=excluded.element_y,element_scale=excluded.element_scale,updated_at=datetime('now')`, e.FactionID, e.ElementKey, e.ElementX, e.ElementY, e.ElementScale)
	return err
}
