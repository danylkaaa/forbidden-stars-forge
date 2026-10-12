package store

import (
	"database/sql"
	"encoding/json"
	"errors"
)

type LayoutScope struct {
	TemplateKey string `json:"template_key"`
	FactionID   int64  `json:"faction_id"`
	CardTypeID  int64  `json:"card_type_id"`
}

func (s *CardsStore) AssemblyLayout(scope LayoutScope) (json.RawMessage, error) {
	var layout string
	err := s.db.QueryRow(`SELECT layout FROM assembly_layouts WHERE template_key=? AND faction_id=? AND card_type_id=?`, scope.TemplateKey, scope.FactionID, scope.CardTypeID).Scan(&layout)
	if errors.Is(err, sql.ErrNoRows) {
		return json.RawMessage(`{}`), nil
	}
	return json.RawMessage(layout), err
}
func (s *CardsStore) SaveAssemblyLayout(scope LayoutScope, layout json.RawMessage) error {
	err := ValidateAssembly(CardAssembly{OverlayID: "none", Transform: ArtworkTransform{Scale: 1}, Layout: layout})
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO assembly_layouts(template_key,faction_id,card_type_id,layout) VALUES(?,?,?,?) ON CONFLICT(template_key,faction_id,card_type_id) DO UPDATE SET layout=excluded.layout,updated_at=datetime('now')`, scope.TemplateKey, scope.FactionID, scope.CardTypeID, string(layout))
	return err
}
