package store

import (
	"database/sql"
	"errors"
)

// ImageMask says which generated image has a hiding mask and when it last changed.
type ImageMask struct {
	GenerationID int64  `json:"generation_id"`
	UpdatedAt    string `json:"updated_at"`
}

type ImageMasksStore struct{ db *sql.DB }

func NewImageMasksStore(db *sql.DB) *ImageMasksStore { return &ImageMasksStore{db: db} }

func (s *ImageMasksStore) Get(generationID int64) ([]byte, ImageMask, error) {
	m := ImageMask{GenerationID: generationID}
	var png []byte
	err := s.db.QueryRow(`SELECT png, updated_at FROM image_masks WHERE generation_id=?`, generationID).Scan(&png, &m.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, m, ErrNotFound
	}
	return png, m, err
}

func (s *ImageMasksStore) Put(generationID int64, png []byte) error {
	_, err := s.db.Exec(`INSERT INTO image_masks(generation_id,png) VALUES(?,?) ON CONFLICT(generation_id) DO UPDATE SET png=excluded.png,updated_at=datetime('now')`, generationID, png)
	return err
}

func (s *ImageMasksStore) Delete(generationID int64) error {
	_, err := s.db.Exec(`DELETE FROM image_masks WHERE generation_id=?`, generationID)
	return err
}

func (s *ImageMasksStore) List() ([]ImageMask, error) {
	rows, err := s.db.Query(`SELECT generation_id, updated_at FROM image_masks ORDER BY generation_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ImageMask{}
	for rows.Next() {
		var m ImageMask
		if err := rows.Scan(&m.GenerationID, &m.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
