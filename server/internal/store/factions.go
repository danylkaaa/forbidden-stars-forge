package store

import (
	"database/sql"
	"errors"

	sqlitedriver "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrDuplicateName = errors.New("name already exists")
)

// isUniqueViolation reports whether err is a SQLITE_CONSTRAINT_UNIQUE
// error from modernc.org/sqlite. modernc.org/sqlite enables extended
// result codes on every connection it opens (see conn.go: c.open calls
// c.extendedResultCodes(true)), so *sqlite.Error.Code() returns the
// extended code (2067) rather than the bare SQLITE_CONSTRAINT (19) -
// verified empirically against the vendored v1.53.0 driver.
func isUniqueViolation(err error) bool {
	var sqliteErr *sqlitedriver.Error
	if errors.As(err, &sqliteErr) {
		return sqliteErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE
	}
	return false
}

type Faction struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	DLC         string `json:"dlc"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type FactionRevision struct {
	ID          int64  `json:"id"`
	FactionID   int64  `json:"faction_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	DLC         string `json:"dlc"`
	Source      string `json:"source"`
	CreatedAt   string `json:"created_at"`
}

type FactionsStore struct {
	db *sql.DB
}

func NewFactionsStore(db *sql.DB) *FactionsStore {
	return &FactionsStore{db: db}
}

const factionCols = "id, name, description, dlc, created_at, updated_at"

func scanFaction(row interface{ Scan(...any) error }) (Faction, error) {
	var f Faction
	err := row.Scan(&f.ID, &f.Name, &f.Description, &f.DLC, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}

func (s *FactionsStore) List() ([]Faction, error) {
	rows, err := s.db.Query("SELECT " + factionCols + " FROM factions ORDER BY updated_at DESC, id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Faction, 0)
	for rows.Next() {
		f, err := scanFaction(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *FactionsStore) Get(id int64) (Faction, error) {
	return scanFaction(s.db.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
}

func insertRevision(tx *sql.Tx, factionID int64, name, description, dlc, source string) error {
	_, err := tx.Exec(
		`INSERT INTO faction_revisions (faction_id, name, description, dlc, source) VALUES (?, ?, ?, ?, ?)`,
		factionID, name, description, dlc, source)
	return err
}

func (s *FactionsStore) Create(name, description, dlc, source string) (Faction, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Faction{}, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`INSERT INTO factions (name, description, dlc) VALUES (?, ?, ?)`, name, description, dlc)
	if err != nil {
		if isUniqueViolation(err) {
			return Faction{}, ErrDuplicateName
		}
		return Faction{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Faction{}, err
	}
	if err := insertRevision(tx, id, name, description, dlc, source); err != nil {
		return Faction{}, err
	}
	f, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
	if err != nil {
		return Faction{}, err
	}
	return f, tx.Commit()
}

// Update saves new state and writes a revision. A save identical to the
// current state is a no-op: no row change, no revision, changed=false.
func (s *FactionsStore) Update(id int64, name, description, dlc, source string) (Faction, bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Faction{}, false, err
	}
	defer tx.Rollback()

	cur, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
	if err != nil {
		return Faction{}, false, err
	}
	if cur.Name == name && cur.Description == description && cur.DLC == dlc {
		return cur, false, tx.Commit()
	}

	_, err = tx.Exec(
		`UPDATE factions SET name = ?, description = ?, dlc = ?, updated_at = datetime('now') WHERE id = ?`,
		name, description, dlc, id)
	if err != nil {
		if isUniqueViolation(err) {
			return Faction{}, false, ErrDuplicateName
		}
		return Faction{}, false, err
	}
	if err := insertRevision(tx, id, name, description, dlc, source); err != nil {
		return Faction{}, false, err
	}
	f, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
	if err != nil {
		return Faction{}, false, err
	}
	return f, true, tx.Commit()
}

func (s *FactionsStore) Delete(id int64) error {
	res, err := s.db.Exec(`DELETE FROM factions WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// Restore applies a past revision's state and appends a new revision with
// source='rollback'. History is append-only — nothing is rewritten.
func (s *FactionsStore) Restore(factionID, revisionID int64) (Faction, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Faction{}, err
	}
	defer tx.Rollback()

	var name, description, dlc string
	err = tx.QueryRow(
		`SELECT name, description, dlc FROM faction_revisions WHERE id = ? AND faction_id = ?`,
		revisionID, factionID).Scan(&name, &description, &dlc)
	if errors.Is(err, sql.ErrNoRows) {
		return Faction{}, ErrNotFound
	}
	if err != nil {
		return Faction{}, err
	}

	res, err := tx.Exec(
		`UPDATE factions SET name = ?, description = ?, dlc = ?, updated_at = datetime('now') WHERE id = ?`,
		name, description, dlc, factionID)
	if err != nil {
		return Faction{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Faction{}, ErrNotFound
	}
	if err := insertRevision(tx, factionID, name, description, dlc, "rollback"); err != nil {
		return Faction{}, err
	}
	f, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", factionID))
	if err != nil {
		return Faction{}, err
	}
	return f, tx.Commit()
}

func (s *FactionsStore) Revisions(factionID int64) ([]FactionRevision, error) {
	rows, err := s.db.Query(
		`SELECT id, faction_id, name, description, dlc, source, created_at
		 FROM faction_revisions WHERE faction_id = ? ORDER BY id DESC`, factionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]FactionRevision, 0)
	for rows.Next() {
		var r FactionRevision
		if err := rows.Scan(&r.ID, &r.FactionID, &r.Name, &r.Description, &r.DLC, &r.Source, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
