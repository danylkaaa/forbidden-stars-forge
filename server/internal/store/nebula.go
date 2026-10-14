package store

import (
	"errors"
	"math"
	"regexp"
)

// Nebula is how a faction's event card back draws its space background.
type Nebula struct {
	FactionID int64   `json:"faction_id"`
	Color     string  `json:"color"` // "#rrggbb", or empty to follow the back's colour
	Seed      int64   `json:"seed"`
	Density   float64 `json:"density"`
	// AsTemplate uses the nebula as the front template of card types that have no chosen one.
	AsTemplate bool `json:"as_template"`
}

var nebulaColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *CardsStore) Nebulas() ([]Nebula, error) {
	rows, err := s.db.Query(`SELECT faction_id,color,seed,density,as_template FROM faction_nebulas ORDER BY faction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Nebula{}
	for rows.Next() {
		var n Nebula
		if err := rows.Scan(&n.FactionID, &n.Color, &n.Seed, &n.Density, &n.AsTemplate); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *CardsStore) SaveNebula(n Nebula) error {
	if n.Color != "" && !nebulaColor.MatchString(n.Color) {
		return errors.New("color must be empty or #rrggbb")
	}
	if n.Seed < 0 || n.Seed > 2147483647 {
		return errors.New("seed must be between 0 and 2147483647")
	}
	if math.IsNaN(n.Density) || n.Density < 0.2 || n.Density > 2 {
		return errors.New("density must be between 0.2 and 2")
	}
	_, err := s.db.Exec(`INSERT INTO faction_nebulas(faction_id,color,seed,density,as_template) VALUES(?,?,?,?,?) ON CONFLICT(faction_id) DO UPDATE SET color=excluded.color,seed=excluded.seed,density=excluded.density,as_template=excluded.as_template,updated_at=datetime('now')`, n.FactionID, n.Color, n.Seed, n.Density, n.AsTemplate)
	return err
}
