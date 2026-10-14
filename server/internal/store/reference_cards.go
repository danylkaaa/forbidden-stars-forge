package store

import "errors"

// ReferenceCard is a picture to compare cards of a category against.
type ReferenceCard struct {
	ID       int64  `json:"id"`
	Category string `json:"category"`
	Side     string `json:"side"`
	Name     string `json:"name"`
	Path     string `json:"-"`
}

func validReferenceCategory(c string) bool {
	return c == "combat" || c == "schema" || c == "upgrade" || c == "faction"
}

func (s *CardsStore) ReferenceCards() ([]ReferenceCard, error) {
	rows, err := s.db.Query(`SELECT id,category,side,name,path FROM reference_cards ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReferenceCard{}
	for rows.Next() {
		var r ReferenceCard
		if err := rows.Scan(&r.ID, &r.Category, &r.Side, &r.Name, &r.Path); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *CardsStore) AddReferenceCard(category, side, name, path string) (ReferenceCard, error) {
	if !validReferenceCategory(category) {
		return ReferenceCard{}, errors.New("category must be combat, schema, upgrade or faction")
	}
	if side != "front" && side != "back" {
		return ReferenceCard{}, errors.New("side must be front or back")
	}
	res, err := s.db.Exec(`INSERT INTO reference_cards(category,side,name,path) VALUES(?,?,?,?)`, category, side, name, path)
	if err != nil {
		return ReferenceCard{}, err
	}
	id, err := res.LastInsertId()
	return ReferenceCard{ID: id, Category: category, Side: side, Name: name, Path: path}, err
}

func (s *CardsStore) ReferenceCard(id int64) (ReferenceCard, error) {
	var r ReferenceCard
	err := s.db.QueryRow(`SELECT id,category,side,name,path FROM reference_cards WHERE id=?`, id).Scan(&r.ID, &r.Category, &r.Side, &r.Name, &r.Path)
	if err != nil {
		return r, ErrNotFound
	}
	return r, nil
}

// DeleteReferenceCard removes the row and returns the file path to delete.
func (s *CardsStore) DeleteReferenceCard(id int64) (string, error) {
	r, err := s.ReferenceCard(id)
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`DELETE FROM reference_cards WHERE id=?`, id)
	return r.Path, err
}
