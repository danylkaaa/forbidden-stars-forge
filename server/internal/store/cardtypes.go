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
	rows, err := s.db.Query("SELECT " + cardTypeCols + " FROM card_types ORDER BY CASE name WHEN 'combat' THEN 0 WHEN 'events' THEN 1 WHEN 'upgrade' THEN 2 WHEN 'combat back' THEN 3 WHEN 'events back' THEN 4 WHEN 'upgrade back' THEN 5 WHEN 'faction card' THEN 6 WHEN 'faction card back' THEN 7 ELSE 8 END, name ASC")
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
var BuiltinCardTypes = []string{"combat", "events", "upgrade", "combat back", "events back", "upgrade back", "faction card", "faction card back"}

// Back card types start with a prompt prefilled for a deck's card back; the
// server also gives them a plain chroma template (see api.EnsureBackTemplates).
var backDecks = map[string]string{"combat back": "combat", "events back": "event", "upgrade back": "upgrade"}

const backConstraints = "The whole green canvas is the card back: replace all of it. Keep the exact canvas dimensions and aspect ratio. No text, letters or numbers. Keep a clean, even margin so the design survives card trimming."

func backDescription(deck string) string {
	return "Create the back of a Warhammer 40K board-game " + deck + " card for this faction. A symmetrical, ornate design that fills the whole card: a central faction emblem framed by an ornamental border, in the faction's colours and materials. It must read clearly at small size and be identical on every " + deck + " card of the deck. Do not reuse elements of the card front (no title bar, resource column or text panels)."
}

// Faction cards are one 258 × 170 mm (268 × 180 mm with bleed) landscape card per faction. Both sides
// are generated as empty frames: text, stats and unit icons are drawn by the
// app. They are described here rather than as ordinary card backs.
var factionCardDescriptions = map[string]string{
	"faction card":      "Create the front of a Warhammer 40K board-game faction card (landscape, 268 x 180 mm: the 258 x 170 mm card plus 5 mm of bleed on every edge, so the painted background and frame must run right to the canvas edge) for this faction, in the faction's colours and materials. The left third is a dramatic painted scene of the faction's leader or iconic troops, edge to edge. Over it sits a tall ornate frame in two parts. Left part: at the top an empty round medallion socket (the faction logo is added later), under it a wide empty parchment panel for a title and rules text, and below that an empty heading bar with a large empty dark area beneath it for tokens. Right part: a tall dark panel with eight evenly spaced horizontal rows; the first row holds two small empty plates (city and factory), each with an empty round socket and an empty number plate; the other seven rows each have an empty round socket on the left, an empty number plate beside it, and an empty wide plate with a narrow empty heading bar above it. Small empty round sockets sit in the frame's left edge beside some rows (tech levels). Every panel, plate and socket stays completely empty.",
	"faction card back": "Create the back of a Warhammer 40K board-game faction card (landscape, 268 x 180 mm: the 258 x 170 mm card plus 5 mm of bleed on every edge, so the painted background and frame must run right to the canvas edge) for this faction, matching its front, in the faction's colours and materials. Left third: at the top an empty round medallion socket (the faction logo is added later); below it a tall framed panel with an empty heading bar and six equal empty rows, each with an empty square picture socket on the left and an empty wide plate on the right. Right two thirds: a large empty parchment panel for a story, with an empty portrait window beside it; below them three rows of two objective plates. Each objective plate has an empty picture window on its left with an angled frame, and an empty wide text plate on its right large enough for a bold name and three lines of description; a short connector pipe joins the two columns. Every panel, window and plate stays completely empty.",
}

// Descriptions shipped earlier. A card type still holding one of them is
// updated to the current text; edited ones are left alone.
var factionCardOldDescriptions = []string{
	"Create the front of a Warhammer 40K board-game faction card (landscape, 258 x 170 mm) for this faction, in the faction's colours and materials. The left third is a dramatic painted scene of the faction's leader or iconic troops, edge to edge. Over it sits a tall ornate frame in two parts. Left part: at the top an empty round medallion socket (the faction logo is added later), under it a wide empty parchment panel for a title and rules text, and below that an empty heading bar with a large empty dark area beneath it for tokens. Right part: a tall dark panel with eight evenly spaced horizontal rows; the first row holds two small empty plates (city and factory), each with an empty round socket and an empty number plate; the other seven rows each have an empty round socket on the left, an empty number plate beside it, and an empty wide plate with a narrow empty heading bar above it. Small empty round sockets sit in the frame's left edge beside some rows (tech levels). Every panel, plate and socket stays completely empty.",
	"Create the back of a Warhammer 40K board-game faction card (landscape, 258 x 170 mm) for this faction, matching its front, in the faction's colours and materials. Left third: at the top an empty round medallion socket (the faction logo is added later); below it a tall framed panel with an empty heading bar and six equal empty rows, each with an empty square picture socket on the left and an empty wide plate on the right. Right two thirds: a large empty parchment panel for a story, with an empty portrait window beside it; below them three rows of two objective plates. Each objective plate has an empty picture window on its left with an angled frame, and an empty wide text plate on its right large enough for a bold name and three lines of description; a short connector pipe joins the two columns. Every panel, window and plate stays completely empty.",
	"Create the back of a Warhammer 40K board-game faction card (landscape, 258 x 170 mm) for this faction, matching its front. The left third is a tall panel with the faction emblem above an empty framed list of five equal rows, each with an empty square socket on the left and an empty wide plate on the right. The right two thirds holds a large empty parchment panel for a story, an empty square portrait window beside it, and below them three rows of two empty plates, each plate with an empty square picture window on its left. Ornate, symmetrical frame in the faction's colours and materials; every panel and window stays completely empty.",
}

const factionCardConstraints = "The whole green canvas is the card: replace all of it. Keep the exact canvas dimensions and aspect ratio (landscape). No text, letters, numbers, icons or unit figures anywhere; they are added later. Keep the panels flat, even and empty so text can be placed on them."

// IsFactionCardType reports whether a card type is a faction card side.
func IsFactionCardType(name string) bool { _, ok := factionCardDescriptions[name]; return ok }

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
		} else if d, ok := factionCardDescriptions[name]; ok {
			description, constraints = d, factionCardConstraints
		}
		if _, err := s.db.Exec(`INSERT OR IGNORE INTO card_types(name,description,constraints) VALUES(?,?,?)`, name, description, constraints); err != nil {
			return err
		}
		if _, ok := factionCardDescriptions[name]; ok {
			for _, old := range factionCardOldDescriptions {
				if _, err := s.db.Exec(`UPDATE card_types SET description=? WHERE name=? AND description=?`, description, name, old); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// SetTemplatePath gives a card type a template without touching its text.
func (s *CardTypesStore) SetTemplatePath(id int64, path string) error {
	_, err := s.db.Exec(`UPDATE card_types SET template_path=?, openai_file_id=NULL, updated_at=datetime('now') WHERE id=?`, path, id)
	return err
}
