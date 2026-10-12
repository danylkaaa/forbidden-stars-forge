package store

import (
	"database/sql"
	"errors"
)

type FactionLogo struct {
	FactionID int64  `json:"faction_id"`
	Path      string `json:"-"`
}

type LogosStore struct{ db *sql.DB }

func NewLogosStore(db *sql.DB) *LogosStore { return &LogosStore{db: db} }

func (s *LogosStore) List() ([]FactionLogo, error) {
	rows, err := s.db.Query(`SELECT faction_id,path FROM faction_logos ORDER BY faction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FactionLogo{}
	for rows.Next() {
		var l FactionLogo
		if err := rows.Scan(&l.FactionID, &l.Path); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *LogosStore) Get(factionID int64) (string, error) {
	var path string
	err := s.db.QueryRow(`SELECT path FROM faction_logos WHERE faction_id=?`, factionID).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}

// Set returns the replaced logo's path ("" if none) so the caller can remove it.
func (s *LogosStore) Set(factionID int64, path string) (string, error) {
	old, err := s.Get(factionID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", err
	}
	_, err = s.db.Exec(`INSERT INTO faction_logos(faction_id,path) VALUES(?,?) ON CONFLICT(faction_id) DO UPDATE SET path=excluded.path,updated_at=datetime('now')`, factionID, path)
	return old, err
}

func (s *LogosStore) Delete(factionID int64) (string, error) {
	old, err := s.Get(factionID)
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`DELETE FROM faction_logos WHERE faction_id=?`, factionID)
	return old, err
}
