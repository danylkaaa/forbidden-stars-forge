package store

import (
	"encoding/json"
	"errors"
)

// OverlayIDs are the bundled picture layers of a card whose tone and colour a faction can correct.
var OverlayIDs = map[string]bool{"ribbon": true, "background": true, "foreground": true, "bottom": true, "chains": true, "banners": true}

// OverlayAdjustment is a faction's correction of one overlay, used on every card of the faction that draws it.
type OverlayAdjustment struct {
	FactionID int64         `json:"faction_id"`
	Overlay   string        `json:"overlay"`
	Adjust    ArtworkAdjust `json:"adjust"`
}

func (s *CardsStore) OverlayAdjustments() ([]OverlayAdjustment, error) {
	rows, err := s.db.Query(`SELECT faction_id,overlay,adjust FROM overlay_adjustments ORDER BY faction_id,overlay`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OverlayAdjustment{}
	for rows.Next() {
		var o OverlayAdjustment
		var raw string
		if err := rows.Scan(&o.FactionID, &o.Overlay, &raw); err != nil {
			return nil, err
		}
		if json.Unmarshal([]byte(raw), &o.Adjust) == nil {
			out = append(out, o)
		}
	}
	return out, rows.Err()
}

// SaveOverlayAdjustment stores the correction; nil removes it.
func (s *CardsStore) SaveOverlayAdjustment(factionID int64, overlay string, a *ArtworkAdjust) error {
	if !OverlayIDs[overlay] {
		return errors.New("unknown overlay")
	}
	if a == nil {
		_, err := s.db.Exec(`DELETE FROM overlay_adjustments WHERE faction_id=? AND overlay=?`, factionID, overlay)
		return err
	}
	if !validAdjust(a) {
		return errors.New("adjustment values are out of range")
	}
	raw, err := json.Marshal(a)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO overlay_adjustments(faction_id,overlay,adjust) VALUES(?,?,?) ON CONFLICT(faction_id,overlay) DO UPDATE SET adjust=excluded.adjust,updated_at=datetime('now')`, factionID, overlay, string(raw))
	return err
}
