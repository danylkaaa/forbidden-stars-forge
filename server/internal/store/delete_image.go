package store

import (
	"database/sql"
	"errors"
	"fmt"
)

var ErrImageInUse = errors.New("image is used by a card template or artwork; choose another image or clear the choice first")
var ErrImagePending = errors.New("cannot delete an image while its generation or batch is still running")

// deleteImage removes one experiment while preserving other batch items and
// independent artwork copies saved on cards. References are checked in the
// same transaction as deletion.
func deleteImage(db *sql.DB, id, batchID int64) (string, error) {
	table, key, kind := "generations", fmt.Sprintf("test-%d", id), "generation"
	where, args := "id=? AND deleted_at=''", []any{id}
	if batchID != 0 {
		table, key, kind = "batch_items", fmt.Sprintf("batch-%d", id), "batch-item"
		where, args = "id=? AND batch_id=? AND deleted_at=''", []any{id, batchID}
	}
	tx, err := db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if batchID != 0 {
		var batchStatus string
		if err := tx.QueryRow("SELECT status FROM batches WHERE id=?", batchID).Scan(&batchStatus); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", ErrNotFound
			}
			return "", err
		}
		if batchStatus != "completed" && batchStatus != "failed" && batchStatus != "cancelled" {
			return "", ErrImagePending
		}
	}
	var path, status string
	err = tx.QueryRow("SELECT COALESCE(image_path,''),status FROM "+table+" WHERE "+where, args...).Scan(&path, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if status == "pending" {
		return "", ErrImagePending
	}
	var used bool
	err = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM assembly_templates WHERE image_key=?) OR EXISTS(SELECT 1 FROM card_assemblies WHERE image_key=? AND artwork_path='')`, key, key).Scan(&used)
	if err != nil {
		return "", err
	}
	if used {
		return "", ErrImageInUse
	}
	// Descendants keep their name and instruction, but no longer offer a
	// comparison against a deleted source image.
	if _, err := tx.Exec(`UPDATE generations SET parent_kind='',parent_id=0,parent_batch_id=0 WHERE parent_kind=? AND parent_id=?`, kind, id); err != nil {
		return "", err
	}
	if _, err := tx.Exec("UPDATE "+table+" SET deleted_at=datetime('now'),image_path='',favorite=0 WHERE "+where, args...); err != nil {
		return "", err
	}
	return path, tx.Commit()
}

func (s *GenerationsStore) Delete(id int64) (string, error) { return deleteImage(s.db, id, 0) }
func (s *BatchesStore) DeleteItem(batchID, itemID int64) (string, error) {
	return deleteImage(s.db, itemID, batchID)
}
