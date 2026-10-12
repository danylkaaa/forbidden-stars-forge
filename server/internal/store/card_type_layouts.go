package store

import (
	"encoding/json"
	"errors"
)

type CardTypeLayout struct {
	Category string          `json:"category"`
	Layout   json.RawMessage `json:"layout"`
}

func (s *CardsStore) CardTypeLayouts() ([]CardTypeLayout, error) {
	rows, err := s.db.Query(`SELECT category,layout FROM card_type_layouts ORDER BY category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CardTypeLayout{}
	for rows.Next() {
		var l CardTypeLayout
		var layout string
		if err := rows.Scan(&l.Category, &layout); err != nil {
			return nil, err
		}
		l.Layout = json.RawMessage(layout)
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *CardsStore) SaveCardTypeLayout(l CardTypeLayout) error {
	if l.Category != "combat" && l.Category != "schema" && l.Category != "upgrade" {
		return errors.New("category must be combat, schema or upgrade")
	}
	if err := ValidateAssembly(CardAssembly{OverlayID: "none", Transform: ArtworkTransform{Scale: 1}, Layout: l.Layout}); err != nil {
		return err
	}
	_, err := s.db.Exec(`INSERT INTO card_type_layouts(category,layout) VALUES(?,?) ON CONFLICT(category) DO UPDATE SET layout=excluded.layout,updated_at=datetime('now')`, l.Category, string(l.Layout))
	return err
}
