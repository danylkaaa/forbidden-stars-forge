package api

import (
	"database/sql"
	"os"
	"path/filepath"
)

// RemoveOrphanArtwork deletes card artwork files no card assembly refers to
// (left behind when cards were dropped by a migration). It returns how many
// files it removed.
func RemoveOrphanArtwork(db *sql.DB, dataDir string) (int, error) {
	rows, err := db.Query(`SELECT artwork_path FROM card_assemblies WHERE artwork_path != ''`)
	if err != nil {
		return 0, err
	}
	used := map[string]bool{}
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			rows.Close()
			return 0, err
		}
		used[filepath.Base(path)] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()
	dir := filepath.Join(dataDir, "card-artwork")
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return 0, nil
	} else if err != nil {
		return 0, err
	}
	removed := 0
	for _, e := range entries {
		if e.IsDir() || used[e.Name()] {
			continue
		}
		if err := os.Remove(filepath.Join(dir, e.Name())); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}
