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

	dist, err := fs.Sub(webFS, "webdist")
	if err != nil {
		log.Fatalf("webdist: %v", err)
	}

	r := api.NewRouter(db, dist)
	log.Println("cardforge listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
