package store

import "database/sql"

type CardType struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Constraints  string `json:"constraints"`
	TemplatePath string `json:"template_path"`
	OpenAIFileID string `json:"openai_file_id"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type CardTypesStore struct {
	db *sql.DB
}

func NewCardTypesStore(db *sql.DB) *CardTypesStore {
	return &CardTypesStore{db: db}
}

const cardTypeCols = "id, name, description, constraints, COALESCE(template_path,''), COALESCE(openai_file_id,''), created_at, updated_at"

func scanCardType(row interface{ Scan(...any) error }) (CardType, error) {
	var ct CardType
	err := row.Scan(&ct.ID, &ct.Name, &ct.Description, &ct.Constraints, &ct.TemplatePath, &ct.OpenAIFileID, &ct.CreatedAt, &ct.UpdatedAt)
	if err == sql.ErrNoRows {
		return ct, ErrNotFound
	}
	return ct, err
}

func (s *CardTypesStore) List() ([]CardType, error) {
	rows, err := s.db.Query("SELECT " + cardTypeCols + " FROM card_types ORDER BY name ASC")
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
