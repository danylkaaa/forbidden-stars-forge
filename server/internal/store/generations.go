package store

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"
)

// nextImageNumber is a SQL expression for the next image number of a
// faction × card type pair, counted across Test Generation and batches.
// Args: factionID, cardTypeID, factionID, cardTypeID. The single-writer
// connection (db.go) serializes inserts, so numbers don't collide.
const nextImageNumber = `(SELECT COUNT(*) FROM generations WHERE faction_id = ? AND card_type_id = ?) +
	(SELECT COUNT(*) FROM batch_items WHERE faction_id = ? AND card_type_id = ?) + 1`

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func nameSlug(s string) string {
	return strings.Trim(nonAlnum.ReplaceAllString(strings.ToLower(s), "_"), "_")
}

// ImageNameSuffix is the part of an image name after its number:
// "-<faction>-<type>-<quality>".
func ImageNameSuffix(factionName, cardTypeName, quality string) string {
	return fmt.Sprintf("-%s-%s-%s", nameSlug(factionName), nameSlug(cardTypeName), quality)
}

type Generation struct {
	ID           int64   `json:"id"`
	FactionID    int64   `json:"faction_id"`
	CardTypeID   int64   `json:"card_type_id"`
	Mode         string  `json:"mode"`
	Model        string  `json:"model"`
	Quality      string  `json:"quality"`
	Name         string  `json:"name"` // "<n>-<faction>-<type>-<quality>", searchable
	Favorite     bool    `json:"favorite"`
	Prompt       string  `json:"prompt"`
	Status       string  `json:"status"`
	ImagePath    string  `json:"image_path"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
	DurationMS   int64   `json:"duration_ms"`
	Error        string  `json:"error"`
	CreatedAt    string  `json:"created_at"`
}

type GenerationsStore struct {
	db *sql.DB
}

func NewGenerationsStore(db *sql.DB) *GenerationsStore {
	return &GenerationsStore{db: db}
}

const generationCols = `id, faction_id, card_type_id, mode, model, quality, name, favorite, prompt, status,
	COALESCE(image_path,''), COALESCE(input_tokens,0), COALESCE(output_tokens,0),
	COALESCE(cost_usd,0), COALESCE(duration_ms,0), COALESCE(error,''), created_at`

func scanGeneration(row interface{ Scan(...any) error }) (Generation, error) {
	var g Generation
	err := row.Scan(&g.ID, &g.FactionID, &g.CardTypeID, &g.Mode, &g.Model, &g.Quality, &g.Name, &g.Favorite, &g.Prompt, &g.Status,
		&g.ImagePath, &g.InputTokens, &g.OutputTokens, &g.CostUSD, &g.DurationMS, &g.Error, &g.CreatedAt)
	if err == sql.ErrNoRows {
		return g, ErrNotFound
	}
	return g, err
}

// Create inserts a pending generation named "<n><nameSuffix>", where n is
// the next image number for this faction × card type (see nextImageNumber).
func (s *GenerationsStore) Create(factionID, cardTypeID int64, mode, model, quality, nameSuffix, prompt string) (Generation, error) {
	res, err := s.db.Exec(
		`INSERT INTO generations (faction_id, card_type_id, mode, model, quality, name, prompt, status)
		 VALUES (?, ?, ?, ?, ?, (`+nextImageNumber+`) || ?, ?, 'pending')`,
		factionID, cardTypeID, mode, model, quality, factionID, cardTypeID, factionID, cardTypeID, nameSuffix, prompt)
	if err != nil {
		return Generation{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Generation{}, err
	}
	return s.Get(id)
}

func (s *GenerationsStore) Get(id int64) (Generation, error) {
	return scanGeneration(s.db.QueryRow("SELECT "+generationCols+" FROM generations WHERE id = ?", id))
}

func (s *GenerationsStore) List() ([]Generation, error) {
	rows, err := s.db.Query("SELECT " + generationCols + " FROM generations ORDER BY id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Generation, 0)
	for rows.Next() {
		g, err := scanGeneration(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// MarkDone persists every completion artifact in one statement so status
// never reads 'done' with partial data (PRD §7.3).
func (s *GenerationsStore) MarkDone(id int64, imagePath string, inTok, outTok int64, costUSD float64, durationMS int64) error {
	res, err := s.db.Exec(
		`UPDATE generations SET status = 'done', image_path = ?, input_tokens = ?, output_tokens = ?,
		 cost_usd = ?, duration_ms = ? WHERE id = ?`,
		imagePath, inTok, outTok, costUSD, durationMS, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *GenerationsStore) SetFavorite(id int64, favorite bool) error {
	res, err := s.db.Exec(`UPDATE generations SET favorite = ? WHERE id = ?`, favorite, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *GenerationsStore) MarkFailed(id int64, errMsg string) error {
	res, err := s.db.Exec(`UPDATE generations SET status = 'failed', error = ? WHERE id = ?`, errMsg, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
