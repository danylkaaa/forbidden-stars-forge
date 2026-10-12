// Package jsonl builds the §8.3 batch request file: one JSON object per
// line, one line per faction × card-type pair.
package jsonl

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"cardforge/internal/openai"
)

// MaxLines is the hard cap on a single batch (PRD §8.3).
const MaxLines = 1000

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify lowercases, collapses non-alphanumeric runs to a single
// underscore, and trims leading/trailing underscores.
func Slugify(s string) string {
	return strings.Trim(nonAlnum.ReplaceAllString(strings.ToLower(s), "_"), "_")
}

type Item struct {
	FactionID    int64
	FactionName  string
	CardTypeID   int64
	CardTypeName string
	FileID       string
	Prompt       string
}

type Line struct {
	CustomID   string
	FactionID  int64
	CardTypeID int64
}

// Build assembles the JSONL text and the per-line metadata batches.Store
// needs to create matching batch_items rows. custom_id is normally
// slug(faction)__slug(cardtype); if two pairs slugify identically, later
// ones get a "-N" suffix so custom_id stays unique per batch.
// params carries the shared request settings; FileID and Prompt come from
// each item.
func Build(items []Item, params openai.ImageEditRequest) (string, []Line, error) {
	if len(items) == 0 {
		return "", nil, fmt.Errorf("no items to batch")
	}
	if len(items) > MaxLines {
		return "", nil, fmt.Errorf("batch would have %d lines — max is %d", len(items), MaxLines)
	}
	seen := make(map[string]int)
	lines := make([]Line, 0, len(items))
	var sb strings.Builder
	for _, it := range items {
		base := Slugify(it.FactionName) + "__" + Slugify(it.CardTypeName)
		customID := base
		if n, ok := seen[base]; ok {
			n++
			seen[base] = n
			customID = fmt.Sprintf("%s-%d", base, n)
		} else {
			seen[base] = 0
		}
		req := params
		req.FileID, req.Prompt = it.FileID, it.Prompt
		raw, err := json.Marshal(map[string]any{
			"custom_id": customID,
			"method":    "POST",
			"url":       "/v1/images/edits",
			"body":      openai.EditBody(req),
		})
		if err != nil {
			return "", nil, err
		}
		sb.Write(raw)
		sb.WriteByte('\n')
		lines = append(lines, Line{CustomID: customID, FactionID: it.FactionID, CardTypeID: it.CardTypeID})
	}
	return sb.String(), lines, nil
}
