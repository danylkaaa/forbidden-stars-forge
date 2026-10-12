package store

import "database/sql"

type CardType struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Constraints  string `json:"constraints"`
	TemplatePath string `json:"template_path"`
	OpenAIFileID string `json:"openai_file_id"`
	OverlayPath  string `json:"overlay_path"` // preview-only, never sent to OpenAI
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type CardTypesStore struct {
	db *sql.DB
}

func NewCardTypesStore(db *sql.DB) *CardTypesStore {
	return &CardTypesStore{db: db}
}

const cardTypeCols = "id, name, description, constraints, COALESCE(template_path,''), COALESCE(openai_file_id,''), COALESCE(overlay_path,''), created_at, updated_at"

func scanCardType(row interface{ Scan(...any) error }) (CardType, error) {
	var ct CardType
	err := row.Scan(&ct.ID, &ct.Name, &ct.Description, &ct.Constraints, &ct.TemplatePath, &ct.OpenAIFileID, &ct.OverlayPath, &ct.CreatedAt, &ct.UpdatedAt)
	if err == sql.ErrNoRows {
		return ct, ErrNotFound
	}
	return ct, err
}

func (s *CardTypesStore) List() ([]CardType, error) {
	rows, err := s.db.Query("SELECT " + cardTypeCols + " FROM card_types ORDER BY CASE name WHEN 'combat' THEN 0 WHEN 'events' THEN 1 WHEN 'upgrade' THEN 2 WHEN 'combat back' THEN 3 WHEN 'events back' THEN 4 WHEN 'upgrade back' THEN 5 ELSE 6 END, name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]CardType, 0)
	for rows.Next() {
		ct, err := scanCardType(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ct)
	}
	return out, rows.Err()
}

func (s *CardTypesStore) Get(id int64) (CardType, error) {
	return scanCardType(s.db.QueryRow("SELECT "+cardTypeCols+" FROM card_types WHERE id = ?", id))
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (s *CardTypesStore) Create(name, description, constraints, templatePath string) (CardType, error) {
	res, err := s.db.Exec(
		`INSERT INTO card_types (name, description, constraints, template_path) VALUES (?, ?, ?, ?)`,
		name, description, constraints, nullable(templatePath))
	if err != nil {
		if isUniqueViolation(err) {
			return CardType{}, ErrDuplicateName
		}
		return CardType{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return CardType{}, err
	}
	return s.Get(id)
}

// Update saves fields; a non-nil newTemplatePath replaces the template AND
// clears the stale openai_file_id in the same statement (PRD §7.2).
func (s *CardTypesStore) Update(id int64, name, description, constraints string, newTemplatePath *string) (CardType, error) {
	var res sql.Result
	var err error
	if newTemplatePath != nil {
		res, err = s.db.Exec(
			`UPDATE card_types SET name = ?, description = ?, constraints = ?,
			 template_path = ?, openai_file_id = NULL, updated_at = datetime('now') WHERE id = ?`,
			name, description, constraints, nullable(*newTemplatePath), id)
	} else {
		res, err = s.db.Exec(
			`UPDATE card_types SET name = ?, description = ?, constraints = ?, updated_at = datetime('now') WHERE id = ?`,
			name, description, constraints, id)
	}
	if err != nil {
		if isUniqueViolation(err) {
			return CardType{}, ErrDuplicateName
		}
		return CardType{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return CardType{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *CardTypesStore) SetFileID(id int64, fileID string) error {
	res, err := s.db.Exec(
		`UPDATE card_types SET openai_file_id = ?, updated_at = datetime('now') WHERE id = ?`, fileID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// SetOverlay sets (or with "" clears) the overlay image path.
func (s *CardTypesStore) SetOverlay(id int64, path string) error {
	res, err := s.db.Exec(
		`UPDATE card_types SET overlay_path = ?, updated_at = datetime('now') WHERE id = ?`, nullable(path), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *CardTypesStore) Delete(id int64) error {
	res, err := s.db.Exec(`DELETE FROM card_types WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// BuiltinCardTypes always exist: one per card category (combat, events,
// upgrades). They are created on startup and cannot be deleted or renamed.
var BuiltinCardTypes = []string{"combat", "events", "upgrade", "combat back", "events back", "upgrade back"}

// Back card types start with a prompt prefilled for a deck's card back; the
// server also gives them a plain chroma template (see api.EnsureBackTemplates).
var backDecks = map[string]string{"combat back": "combat", "events back": "event", "upgrade back": "upgrade"}

const backConstraints = "The whole green canvas is the card back: replace all of it. Keep the exact canvas dimensions and aspect ratio. No text, letters or numbers. Keep a clean, even margin so the design survives card trimming."

func backDescription(deck string) string {
	return "Create the back of a Warhammer 40K board-game " + deck + " card for this faction. A symmetrical, ornate design that fills the whole card: a central faction emblem framed by an ornamental border, in the faction's colours and materials. It must read clearly at small size and be identical on every " + deck + " card of the deck. Do not reuse elements of the card front (no title bar, resource column or text panels)."
}

// IsBackCardType reports whether a card type is one of the built-in backs.
func IsBackCardType(name string) bool { _, ok := backDecks[name]; return ok }

func IsBuiltinCardType(name string) bool {
	for _, b := range BuiltinCardTypes {
		if b == name {
			return true
		}
	}
	return false
}

func (s *CardTypesStore) EnsureBuiltins() error {
	for _, name := range BuiltinCardTypes {
		description, constraints := "", ""
		if deck, ok := backDecks[name]; ok {
			description, constraints = backDescription(deck), backConstraints
		}
		if _, err := s.db.Exec(`INSERT OR IGNORE INTO card_types(name,description,constraints) VALUES(?,?,?)`, name, description, constraints); err != nil {
			return err
		}
	}
	return nil
}

// SetTemplatePath gives a card type a template without touching its text.
func (s *CardTypesStore) SetTemplatePath(id int64, path string) error {
	_, err := s.db.Exec(`UPDATE card_types SET template_path=?, openai_file_id=NULL, updated_at=datetime('now') WHERE id=?`, path, id)
	return err
}
