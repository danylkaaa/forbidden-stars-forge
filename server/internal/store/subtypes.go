package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

type SubtypeOverlay struct {
	ID   int64  `json:"id"`
	Path string `json:"-"`
}
type CardSubtype struct {
	ID       int64            `json:"id"`
	Category string           `json:"category"`
	Name     string           `json:"name"`
	Layout   json.RawMessage  `json:"layout"`
	Overlays []SubtypeOverlay `json:"overlays"`
}

type SubtypesStore struct{ db *sql.DB }

func NewSubtypesStore(db *sql.DB) *SubtypesStore { return &SubtypesStore{db: db} }

var ErrInvalidSubtype = errors.New("category must be combat, schema or upgrade and name is required")
var ErrBuiltinSubtype = errors.New("built-in subtypes cannot be renamed or deleted")

// BuiltinSubtypes always exist. Combat cards without a chosen subtype use
// "Level 0" or "Level 1+" by their level.
var BuiltinSubtypes = []struct{ Category, Name string }{{"combat", "Level 0"}, {"combat", "Level 1+"}}

func (s *SubtypesStore) EnsureBuiltins() error {
	for _, b := range BuiltinSubtypes {
		if _, err := s.db.Exec(`INSERT OR IGNORE INTO card_subtypes(category,name) VALUES(?,?)`, b.Category, b.Name); err != nil {
			return err
		}
	}
	return nil
}

func (s *SubtypesStore) isBuiltin(id int64) (bool, error) {
	st, err := s.Get(id)
	if err != nil {
		return false, err
	}
	for _, b := range BuiltinSubtypes {
		if b.Category == st.Category && b.Name == st.Name {
			return true, nil
		}
	}
	return false, nil
}

func validSubtype(category, name string) bool {
	return (category == "combat" || category == "schema" || category == "upgrade") && strings.TrimSpace(name) != "" && len(name) <= 100
}

func (s *SubtypesStore) List() ([]CardSubtype, error) {
	rows, err := s.db.Query(`SELECT id,category,name,layout FROM card_subtypes ORDER BY category,name`)
	if err != nil {
		return nil, err
	}
	out := []CardSubtype{}
	index := map[int64]int{}
	for rows.Next() {
		st := CardSubtype{Overlays: []SubtypeOverlay{}}
		var layout string
		if err := rows.Scan(&st.ID, &st.Category, &st.Name, &layout); err != nil {
			rows.Close()
			return nil, err
		}
		st.Layout = json.RawMessage(layout)
		index[st.ID] = len(out)
		out = append(out, st)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	orows, err := s.db.Query(`SELECT id,subtype_id,path FROM subtype_overlays ORDER BY subtype_id,position,id`)
	if err != nil {
		return nil, err
	}
	defer orows.Close()
	for orows.Next() {
		var o SubtypeOverlay
		var sid int64
		if err := orows.Scan(&o.ID, &sid, &o.Path); err != nil {
			return nil, err
		}
		if i, ok := index[sid]; ok {
			out[i].Overlays = append(out[i].Overlays, o)
		}
	}
	return out, orows.Err()
}

func (s *SubtypesStore) Get(id int64) (CardSubtype, error) {
	list, err := s.List()
	if err != nil {
		return CardSubtype{}, err
	}
	for _, st := range list {
		if st.ID == id {
			return st, nil
		}
	}
	return CardSubtype{}, ErrNotFound
}

func (s *SubtypesStore) Create(category, name string) (CardSubtype, error) {
	name = strings.TrimSpace(name)
	if !validSubtype(category, name) {
		return CardSubtype{}, ErrInvalidSubtype
	}
	res, err := s.db.Exec(`INSERT INTO card_subtypes(category,name) VALUES(?,?)`, category, name)
	if isUniqueViolation(err) {
		return CardSubtype{}, ErrDuplicateName
	}
	if err != nil {
		return CardSubtype{}, err
	}
	id, _ := res.LastInsertId()
	return s.Get(id)
}

func (s *SubtypesStore) Rename(id int64, name string) (CardSubtype, error) {
	if builtin, err := s.isBuiltin(id); err != nil {
		return CardSubtype{}, err
	} else if builtin {
		return CardSubtype{}, ErrBuiltinSubtype
	}
	name = strings.TrimSpace(name)
	if !validSubtype("combat", name) {
		return CardSubtype{}, ErrInvalidSubtype
	}
	res, err := s.db.Exec(`UPDATE card_subtypes SET name=? WHERE id=?`, name, id)
	if isUniqueViolation(err) {
		return CardSubtype{}, ErrDuplicateName
	}
	if err != nil {
		return CardSubtype{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return CardSubtype{}, ErrNotFound
	}
	return s.Get(id)
}

// Delete returns the overlay files the caller should remove.
func (s *SubtypesStore) Delete(id int64) ([]string, error) {
	st, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if builtin, _ := s.isBuiltin(id); builtin {
		return nil, ErrBuiltinSubtype
	}
	if _, err := s.db.Exec(`DELETE FROM card_subtypes WHERE id=?`, id); err != nil {
		return nil, err
	}
	paths := []string{}
	for _, o := range st.Overlays {
		paths = append(paths, o.Path)
	}
	return paths, nil
}

// AddOverlay puts the new overlay on top of the stack.
func (s *SubtypesStore) AddOverlay(subtypeID int64, path string) (CardSubtype, error) {
	if _, err := s.Get(subtypeID); err != nil {
		return CardSubtype{}, err
	}
	if _, err := s.db.Exec(`INSERT INTO subtype_overlays(subtype_id,path,position) VALUES(?,?,(SELECT COALESCE(MAX(position)+1,0) FROM subtype_overlays WHERE subtype_id=?))`, subtypeID, path, subtypeID); err != nil {
		return CardSubtype{}, err
	}
	return s.Get(subtypeID)
}

func (s *SubtypesStore) Overlay(subtypeID, overlayID int64) (SubtypeOverlay, error) {
	var o SubtypeOverlay
	err := s.db.QueryRow(`SELECT id,path FROM subtype_overlays WHERE id=? AND subtype_id=?`, overlayID, subtypeID).Scan(&o.ID, &o.Path)
	if errors.Is(err, sql.ErrNoRows) {
		return o, ErrNotFound
	}
	return o, err
}

func (s *SubtypesStore) DeleteOverlay(subtypeID, overlayID int64) (string, error) {
	o, err := s.Overlay(subtypeID, overlayID)
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`DELETE FROM subtype_overlays WHERE id=?`, overlayID)
	return o.Path, err
}

// ReorderOverlays takes every overlay id of the subtype, bottom first.
func (s *SubtypesStore) ReorderOverlays(subtypeID int64, ids []int64) (CardSubtype, error) {
	st, err := s.Get(subtypeID)
	if err != nil {
		return st, err
	}
	have := map[int64]bool{}
	for _, o := range st.Overlays {
		have[o.ID] = true
	}
	seen := map[int64]bool{}
	for _, id := range ids {
		if !have[id] || seen[id] {
			return st, errors.New("order must list each overlay of the subtype exactly once")
		}
		seen[id] = true
	}
	if len(ids) != len(have) {
		return st, errors.New("order must list each overlay of the subtype exactly once")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return st, err
	}
	defer tx.Rollback()
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE subtype_overlays SET position=? WHERE id=?`, i, id); err != nil {
			return st, err
		}
	}
	if err := tx.Commit(); err != nil {
		return st, err
	}
	return s.Get(subtypeID)
}

// SetLayout stores overlay-bound layer positions for the subtype.
func (s *SubtypesStore) SetLayout(id int64, layout json.RawMessage) (CardSubtype, error) {
	if err := ValidateAssembly(CardAssembly{OverlayID: "none", Transform: ArtworkTransform{Scale: 1}, Layout: layout}); err != nil {
		return CardSubtype{}, err
	}
	res, err := s.db.Exec(`UPDATE card_subtypes SET layout=? WHERE id=?`, string(layout), id)
	if err != nil {
		return CardSubtype{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return CardSubtype{}, ErrNotFound
	}
	return s.Get(id)
}
