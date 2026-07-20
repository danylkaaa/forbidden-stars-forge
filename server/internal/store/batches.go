package store

import "database/sql"

type Batch struct {
	ID            int64   `json:"id"`
	OpenAIBatchID string  `json:"openai_batch_id"`
	Mode          string  `json:"mode"`
	Status        string  `json:"status"`
	JSONLPath     string  `json:"jsonl_path"`
	OutputPath    string  `json:"output_path"`
	TotalCostUSD  float64 `json:"total_cost_usd"`
	SubmittedAt   string  `json:"submitted_at"`
	CompletedAt   string  `json:"completed_at"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

type BatchItem struct {
	ID           int64   `json:"id"`
	BatchID      int64   `json:"batch_id"`
	FactionID    int64   `json:"faction_id"`
	CardTypeID   int64   `json:"card_type_id"`
	CustomID     string  `json:"custom_id"`
	Status       string  `json:"status"`
	ImagePath    string  `json:"image_path"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
	Error        string  `json:"error"`
}

type BatchItemInput struct {
	FactionID  int64
	CardTypeID int64
	CustomID   string
}

type BatchesStore struct {
	db *sql.DB
}

func NewBatchesStore(db *sql.DB) *BatchesStore {
	return &BatchesStore{db: db}
}

const batchCols = `id, COALESCE(openai_batch_id,''), mode, status, jsonl_path,
	COALESCE(output_path,''), COALESCE(total_cost_usd,0),
	COALESCE(submitted_at,''), COALESCE(completed_at,''), created_at, updated_at`

func scanBatch(row interface{ Scan(...any) error }) (Batch, error) {
	var b Batch
	err := row.Scan(&b.ID, &b.OpenAIBatchID, &b.Mode, &b.Status, &b.JSONLPath,
		&b.OutputPath, &b.TotalCostUSD, &b.SubmittedAt, &b.CompletedAt, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return b, ErrNotFound
	}
	return b, err
}

func (s *BatchesStore) Create(mode, jsonlPath string, items []BatchItemInput) (Batch, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Batch{}, err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO batches (mode, status, jsonl_path) VALUES (?, 'created', ?)`, mode, jsonlPath)
	if err != nil {
		return Batch{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Batch{}, err
	}
	for _, it := range items {
		if _, err := tx.Exec(
			`INSERT INTO batch_items (batch_id, faction_id, card_type_id, custom_id, status) VALUES (?, ?, ?, ?, 'pending')`,
			id, it.FactionID, it.CardTypeID, it.CustomID); err != nil {
			return Batch{}, err
		}
	}
	b, err := scanBatch(tx.QueryRow("SELECT "+batchCols+" FROM batches WHERE id = ?", id))
	if err != nil {
		return Batch{}, err
	}
	return b, tx.Commit()
}

func (s *BatchesStore) Get(id int64) (Batch, error) {
	return scanBatch(s.db.QueryRow("SELECT "+batchCols+" FROM batches WHERE id = ?", id))
}

func (s *BatchesStore) List() ([]Batch, error) {
	return s.queryBatches("SELECT " + batchCols + " FROM batches ORDER BY id DESC")
}

func (s *BatchesStore) NonTerminal() ([]Batch, error) {
	return s.queryBatches("SELECT " + batchCols + " FROM batches WHERE status IN ('submitted','in_progress') ORDER BY id ASC")
}

func (s *BatchesStore) queryBatches(q string) ([]Batch, error) {
	rows, err := s.db.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Batch, 0)
	for rows.Next() {
		b, err := scanBatch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *BatchesStore) MarkSubmitted(id int64, openaiBatchID string) error {
	return s.execOne(
		`UPDATE batches SET status = 'submitted', openai_batch_id = ?, submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
		openaiBatchID, id)
}

// SetStatus updates a non-terminal batch's status. Terminal batches are
// left untouched (silent no-op) so a stale poll can never regress them.
func (s *BatchesStore) SetStatus(id int64, status string) error {
	_, err := s.db.Exec(
		`UPDATE batches SET status = ?, updated_at = datetime('now')
		 WHERE id = ? AND status NOT IN ('completed','failed','cancelled')`, status, id)
	return err
}

func (s *BatchesStore) Complete(id int64, outputPath string, totalCost float64) error {
	return s.execOne(
		`UPDATE batches SET status = 'completed', output_path = ?, total_cost_usd = ?,
		 completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
		outputPath, totalCost, id)
}

// Delete removes a batch and its items (batch_items cascades via its FK
// to batches). Only meant for cleaning up a batch that failed to reach
// OpenAI — a submitted batch should be cancelled, not deleted, so its
// history is preserved.
func (s *BatchesStore) Delete(id int64) error {
	return s.execOne(`DELETE FROM batches WHERE id = ?`, id)
}

func (s *BatchesStore) execOne(q string, args ...any) error {
	res, err := s.db.Exec(q, args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

const batchItemCols = `id, batch_id, faction_id, card_type_id, custom_id, status,
	COALESCE(image_path,''), COALESCE(input_tokens,0), COALESCE(output_tokens,0),
	COALESCE(cost_usd,0), COALESCE(error,'')`

func (s *BatchesStore) Items(batchID int64) ([]BatchItem, error) {
	rows, err := s.db.Query("SELECT "+batchItemCols+" FROM batch_items WHERE batch_id = ? ORDER BY custom_id ASC", batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]BatchItem, 0)
	for rows.Next() {
		var it BatchItem
		if err := rows.Scan(&it.ID, &it.BatchID, &it.FactionID, &it.CardTypeID, &it.CustomID, &it.Status,
			&it.ImagePath, &it.InputTokens, &it.OutputTokens, &it.CostUSD, &it.Error); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *BatchesStore) MarkItemDone(batchID int64, customID, imagePath string, inTok, outTok int64, costUSD float64) error {
	return s.execOne(
		`UPDATE batch_items SET status = 'done', image_path = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?
		 WHERE batch_id = ? AND custom_id = ?`,
		imagePath, inTok, outTok, costUSD, batchID, customID)
}

func (s *BatchesStore) MarkItemFailed(batchID int64, customID, errMsg string) error {
	return s.execOne(
		`UPDATE batch_items SET status = 'failed', error = ? WHERE batch_id = ? AND custom_id = ?`,
		errMsg, batchID, customID)
}

func (s *BatchesStore) FactionReferenced(factionID int64) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM batch_items WHERE faction_id = ?`, factionID).Scan(&n)
	return n > 0, err
}

func (s *BatchesStore) CardTypeReferenced(cardTypeID int64) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM batch_items WHERE card_type_id = ?`, cardTypeID).Scan(&n)
	return n > 0, err
}
