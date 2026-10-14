package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"cardforge/internal/api"
	"cardforge/internal/store"
)

//go:embed all:webdist
var webFS embed.FS

func main() {
	dbPath := os.Getenv("CARDFORGE_DB")
	if dbPath == "" {
		dbPath = "./data/cardforge.db"
	}
	db, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if err := store.NewCardTypesStore(db).EnsureBuiltins(); err != nil {
		log.Fatalf("seed card types: %v", err)
	}
	if err := store.NewSubtypesStore(db).EnsureBuiltins(); err != nil {
		log.Fatalf("seed subtypes: %v", err)
	}

	dist, err := fs.Sub(webFS, "webdist")
	if err != nil {
		log.Fatalf("webdist: %v", err)
	}

	dataDir := os.Getenv("CARDFORGE_DATA")
	if dataDir == "" {
		dataDir = "./data"
	}
	if n, err := api.RemoveOrphanArtwork(db, dataDir); err != nil {
		log.Printf("remove orphan artwork: %v", err)
	} else if n > 0 {
		log.Printf("removed %d orphan card artwork files", n)
	}
	if err := api.EnsureBackTemplates(db, dataDir); err != nil {
		log.Fatalf("seed card back templates: %v", err)
	}
	r := api.NewRouter(db, dist, dataDir)
	log.Println("cardforge listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
