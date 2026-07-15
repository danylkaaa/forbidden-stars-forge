package main

import (
	"log"
	"net/http"

	"cardforge/internal/api"
)

func main() {
	r := api.NewRouter(nil, nil)
	log.Println("cardforge listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
