package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

const MaxCardInteger int64 = 9007199254740991

var ErrInvalidFaction = errors.New("faction does not exist")

type CardInput struct {
	FactionID    int64   `json:"faction_id"`
	Name         string  `json:"name"`
	Category     string  `json:"category"`
	Level        *int64  `json:"level,omitempty"`
	ResourceCost *int64  `json:"resource_cost,omitempty"`
	Shields      *int64  `json:"shields,omitempty"`
	Guns         *int64  `json:"guns,omitempty"`
	Eagles       *int64  `json:"eagles,omitempty"`
	UpperText    *string `json:"upper_text,omitempty"`
	// Units are the unit names a combat card's lower text is about (shown joined with "/" before the unit text).
	Units       *[]string `json:"units,omitempty"`
	UnitText    *string   `json:"unit_text,omitempty"`
	Subtype     *string   `json:"subtype,omitempty"`
	Text        *string   `json:"text,omitempty"`
	Action      *string   `json:"action,omitempty"`
	UpgradeType *string   `json:"upgrade_type,omitempty"`
	// Limitation is an upgrade card's optional bottom line; nil or empty means none.
	Limitation *string `json:"limitation,omitempty"`
	// Starting marks a combat card as a starting card (level 0, no price, shows the
	// faction logo). Any other combat card has a level from 0 to 3.
	Starting *bool `json:"starting,omitempty"`
}
type Card struct {
	ID int64 `json:"id"`
	CardInput
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}
type CardFieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}
type CardValidationError struct{ Fields []CardFieldError }

func (e *CardValidationError) Error() string { return "invalid card" }

func ValidateCard(in CardInput) []CardFieldError {
	out := []CardFieldError{}
	add := func(f, m string) { out = append(out, CardFieldError{f, m}) }
	if in.FactionID <= 0 || in.FactionID > MaxCardInteger {
		add("faction_id", "must be a positive safe integer")
	}
	if strings.TrimSpace(in.Name) == "" {
		add("name", "is required")
	}
	if in.Category != "combat" && in.Category != "schema" && in.Category != "upgrade" {
		add("category", "must be combat, schema, or upgrade")
		return out
	}
	number := func(f string, v *int64, max int64) {
		if v == nil {
			add(f, "is required")
		} else if *v < 0 || *v > max {
			add(f, "is outside the allowed integer range")
		}
	}
	text := func(f string, v *string) {
		if v == nil {
			add(f, "is required (empty text is allowed)")
		}
	}
	enum := func(f string, v *string, values ...string) {
		if v != nil {
			for _, a := range values {
				if *v == a {
					return
				}
			}
		}
		add(f, "must be one of: "+strings.Join(values, ", "))
	}
	present := map[string]bool{"level": in.Level != nil, "resource_cost": in.ResourceCost != nil, "shields": in.Shields != nil, "guns": in.Guns != nil, "eagles": in.Eagles != nil, "upper_text": in.UpperText != nil, "units": in.Units != nil, "unit_text": in.UnitText != nil, "subtype": in.Subtype != nil, "text": in.Text != nil, "action": in.Action != nil, "upgrade_type": in.UpgradeType != nil, "limitation": in.Limitation != nil, "starting": in.Starting != nil}
	allowed := CardCategoryFields(in.Category)
	for f, yes := range present {
		if yes && !allowed[f] {
			add(f, "does not belong to this category")
		}
	}
	switch in.Category {
	case "combat":
		number("level", in.Level, 3)
		number("resource_cost", in.ResourceCost, MaxCardInteger)
		if in.Starting != nil && *in.Starting {
			if in.Level != nil && *in.Level != 0 {
				add("level", "must be 0 for a starting card")
			}
			if in.ResourceCost != nil && *in.ResourceCost != 0 {
				add("resource_cost", "must be 0 for a starting card")
			}
		}
		number("shields", in.Shields, MaxCardInteger)
		number("guns", in.Guns, MaxCardInteger)
		number("eagles", in.Eagles, MaxCardInteger)
		text("upper_text", in.UpperText)
		if in.Units == nil {
			add("units", "is required (an empty list is allowed)")
		} else {
			for _, u := range *in.Units {
				if strings.TrimSpace(u) == "" || strings.Contains(u, "/") {
					add("units", "each unit name must be non-empty and contain no \"/\"")
					break
				}
			}
		}
		text("unit_text", in.UnitText)
	case "schema":
		enum("subtype", in.Subtype, "schema", "tactic")
		text("text", in.Text)
		enum("action", in.Action, "rotate_clockwise", "rotate_counterclockwise", "move_vertical", "move_horizontal")
	case "upgrade":
		enum("upgrade_type", in.UpgradeType, "deploy", "advance", "strategize", "dominate", "orbital_strike")
		number("level", in.Level, 3)
		number("resource_cost", in.ResourceCost, MaxCardInteger)
		text("text", in.Text)
	}
	return out
}
func CardCategoryFields(category string) map[string]bool {
	fields := map[string]bool{"faction_id": true, "name": true, "category": true}
	var extra []string
	switch category {
	case "combat":
		extra = []string{"level", "resource_cost", "shields", "guns", "eagles", "upper_text", "units", "unit_text", "starting"}
	case "schema":
		extra = []string{"subtype", "text", "action"}
	case "upgrade":
		extra = []string{"upgrade_type", "level", "resource_cost", "text", "limitation"}
	}
	for _, f := range extra {
		fields[f] = true
	}
	return fields
}

type CardsStore struct{ db *sql.DB }

func NewCardsStore(db *sql.DB) *CardsStore { return &CardsStore{db} }

const cardCols = "id, faction_id, name, category, level, resource_cost, shields, guns, eagles, upper_text, lower_text, subtype, text, action, upgrade_type, created_at, updated_at, starting, limitation, units"

func scanCard(row interface{ Scan(...any) error }) (Card, error) {
	var c Card
	var starting bool
	var units string
	err := row.Scan(&c.ID, &c.FactionID, &c.Name, &c.Category, &c.Level, &c.ResourceCost, &c.Shields, &c.Guns, &c.Eagles, &c.UpperText, &c.UnitText, &c.Subtype, &c.Text, &c.Action, &c.UpgradeType, &c.CreatedAt, &c.UpdatedAt, &starting, &c.Limitation, &units)
	if c.Category == "combat" {
		c.Starting = &starting
		var names []string
		if json.Unmarshal([]byte(units), &names) != nil || names == nil {
			names = []string{}
		}
		c.Units = &names
	}
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return c, err
}

// unitsFor stores a combat card's unit names as a JSON array ("[]" for any other card).
func unitsFor(c CardInput) string {
	if c.Category != "combat" || c.Units == nil {
		return "[]"
	}
	names := make([]string, 0, len(*c.Units))
	for _, u := range *c.Units {
		names = append(names, strings.TrimSpace(u))
	}
	b, _ := json.Marshal(names)
	return string(b)
}

// limitationFor stores an upgrade's limitation, or NULL when it is empty or the card is not an upgrade.
func limitationFor(c CardInput) any {
	if c.Category != "upgrade" || c.Limitation == nil || strings.TrimSpace(*c.Limitation) == "" {
		return nil
	}
	return *c.Limitation
}
func cardArgs(c CardInput) []any {
	return []any{c.FactionID, strings.TrimSpace(c.Name), c.Category, c.Level, c.ResourceCost, c.Shields, c.Guns, c.Eagles, c.UpperText, c.UnitText, c.Subtype, c.Text, c.Action, c.UpgradeType, c.Category == "combat" && c.Starting != nil && *c.Starting, limitationFor(c), unitsFor(c)}
}
func (s *CardsStore) Get(id int64) (Card, error) {
	return scanCard(s.db.QueryRow("SELECT "+cardCols+" FROM cards WHERE id=?", id))
}
func (s *CardsStore) List(factionID int64, category string) ([]Card, error) {
	rows, err := s.db.Query("SELECT "+cardCols+" FROM cards WHERE (?=0 OR faction_id=?) AND (?='' OR category=?) ORDER BY updated_at DESC,id DESC", factionID, factionID, category, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Card{}
	for rows.Next() {
		c, e := scanCard(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func checkCard(tx *sql.Tx, in CardInput) error {
	if fields := ValidateCard(in); len(fields) > 0 {
		return &CardValidationError{fields}
	}
	var id int64
	if err := tx.QueryRow("SELECT id FROM factions WHERE id=?", in.FactionID).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrInvalidFaction
		}
		return err
	}
	return nil
}
func insertCard(tx *sql.Tx, in CardInput) (Card, error) {
	if err := checkCard(tx, in); err != nil {
		return Card{}, err
	}
	res, err := tx.Exec("INSERT INTO cards (faction_id,name,category,level,resource_cost,shields,guns,eagles,upper_text,lower_text,subtype,text,action,upgrade_type,starting,limitation,units) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", cardArgs(in)...)
	if err != nil {
		return Card{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Card{}, err
	}
	return scanCard(tx.QueryRow("SELECT "+cardCols+" FROM cards WHERE id=?", id))
}
func (s *CardsStore) Create(in CardInput) (Card, error) {
	cs, err := s.Import([]CardInput{in})
	if err != nil {
		return Card{}, err
	}
	return cs[0], nil
}
func (s *CardsStore) Import(inputs []CardInput) ([]Card, error) {
	if len(inputs) == 0 {
		return nil, &CardValidationError{[]CardFieldError{{"cards", "must be a non-empty array"}}}
	}
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	out := make([]Card, 0, len(inputs))
	for _, in := range inputs {
		c, e := insertCard(tx, in)
		if e != nil {
			return nil, e
		}
		out = append(out, c)
	}
	return out, tx.Commit()
}
func (s *CardsStore) Update(id int64, in CardInput) (Card, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Card{}, err
	}
	defer tx.Rollback()
	if _, err = scanCard(tx.QueryRow("SELECT "+cardCols+" FROM cards WHERE id=?", id)); err != nil {
		return Card{}, err
	}
	if err = checkCard(tx, in); err != nil {
		return Card{}, err
	}
	args := append(cardArgs(in), id)
	_, err = tx.Exec("UPDATE cards SET faction_id=?,name=?,category=?,level=?,resource_cost=?,shields=?,guns=?,eagles=?,upper_text=?,lower_text=?,subtype=?,text=?,action=?,upgrade_type=?,starting=?,limitation=?,units=?,updated_at=datetime('now') WHERE id=?", args...)
	if err != nil {
		return Card{}, err
	}
	c, err := scanCard(tx.QueryRow("SELECT "+cardCols+" FROM cards WHERE id=?", id))
	if err != nil {
		return Card{}, err
	}
	return c, tx.Commit()
}
func (s *CardsStore) FactionReferenced(id int64) (bool, error) {
	var yes bool
	err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM cards WHERE faction_id=?)", id).Scan(&yes)
	return yes, err
}

// DeleteMany removes the cards (and their assemblies) in one transaction and
// returns the artwork files the caller should remove. Unknown ids fail the
// whole delete.
func (s *CardsStore) DeleteMany(ids []int64) ([]string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	files := []string{}
	for _, id := range ids {
		var path sql.NullString
		if err := tx.QueryRow(`SELECT artwork_path FROM card_assemblies WHERE card_id=?`, id).Scan(&path); err == nil && path.String != "" {
			files = append(files, path.String)
		}
		res, err := tx.Exec(`DELETE FROM cards WHERE id=?`, id)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, ErrNotFound
		}
	}
	return files, tx.Commit()
}

// DeleteAll removes every card with its assembly, returning how many were removed and their artwork files.
func (s *CardsStore) DeleteAll() (int, []string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, nil, err
	}
	defer tx.Rollback()
	files := []string{}
	rows, err := tx.Query(`SELECT artwork_path FROM card_assemblies WHERE artwork_path <> ''`)
	if err != nil {
		return 0, nil, err
	}
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			rows.Close()
			return 0, nil, err
		}
		files = append(files, path)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, nil, err
	}
	rows.Close()
	res, err := tx.Exec(`DELETE FROM cards`)
	if err != nil {
		return 0, nil, err
	}
	n, _ := res.RowsAffected()
	return int(n), files, tx.Commit()
}
