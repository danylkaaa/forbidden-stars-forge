package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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
	if n, err := store.NewGenerationsStore(db).FailInterrupted(); err != nil {
		log.Fatalf("fail interrupted generations: %v", err)
	} else if n > 0 {
		log.Printf("marked %d generation(s) interrupted by the restart as failed", n)
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
	srv := &http.Server{Addr: ":8080", Handler: r}
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	log.Println("cardforge listening on :8080")

	// On Ctrl+C (or SIGTERM) new requests stop, but images being generated are waited for: OpenAI answers on the
	// open connection only, so a run cut off here is lost. A second Ctrl+C quits at once.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	<-ctx.Done()
	stop()
	log.Println("stopping: finishing images in progress (Ctrl+C again to quit now)")
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
	if !api.WaitForRuns(200 * time.Second) {
		log.Println("stopping: gave up waiting for images in progress")
	}
}
