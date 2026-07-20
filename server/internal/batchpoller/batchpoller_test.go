package batchpoller

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"cardforge/internal/openai"
	"cardforge/internal/store"
)

func pollerFixtures(t *testing.T) (*Poller, *store.BatchesStore, string, int64, int64) {
	t.Helper()
	dataDir := t.TempDir()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	fs := store.NewFactionsStore(db)
	cs := store.NewCardTypesStore(db)
	f, _ := fs.Create("Tau Empire", "d", "Galaxy in Flames", "manual")
	ct, _ := cs.Create("combat", "", "", "")
	bs := store.NewBatchesStore(db)
	settings := store.NewSettingsStore(db)
	return New(bs, settings, dataDir, nil), bs, dataDir, f.ID, ct.ID
}

func withFakeClient(p *Poller, baseURL string) {
	p.Client = func() (*openai.Client, error) {
		c := openai.New("sk-test")
		c.BaseURL = baseURL
		return c, nil
	}
}

func TestMapStatus(t *testing.T) {
	cases := map[string]string{
		"validating": "in_progress", "in_progress": "in_progress", "finalizing": "in_progress",
		"completed": "completed", "failed": "failed", "expired": "failed",
		"cancelling": "cancelled", "cancelled": "cancelled",
	}
	for in, want := range cases {
		if got := mapStatus(in); got != want {
			t.Errorf("mapStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPollUpdatesInProgressStatusAndCounts(t *testing.T) {
	p, bs, _, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"validating","request_counts":{"completed":0,"failed":0,"total":1}}`))
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status != "in_progress" {
		t.Fatalf("status: %s", got.Status)
	}
	counts, ok := p.Counts(b.ID)
	if !ok || counts.Total != 1 {
		t.Fatalf("counts: %+v ok=%v", counts, ok)
	}
}

func TestPollCompletesDownloadsAndMarksItemsDone(t *testing.T) {
	p, bs, dataDir, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	png := base64.StdEncoding.EncodeToString([]byte("PNGDATA"))
	outputLine := `{"custom_id":"tau_empire__combat","response":{"body":{"data":[{"b64_json":"` + png + `"}],"usage":{"input_tokens":100,"output_tokens":400}}}}` + "\n"

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/batches/batch_openai_1":
			w.Write([]byte(`{"status":"completed","request_counts":{"completed":1,"failed":0,"total":1},"output_file_id":"file-out"}`))
		case "/v1/files/file-out/content":
			w.Write([]byte(outputLine))
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status != "completed" || got.CompletedAt == "" || got.OutputPath == "" {
		t.Fatalf("batch: %+v", got)
	}
	wantCost := (100.0/1e6*10.0 + 400.0/1e6*40.0) * 0.5 // gpt-image-2 seed price × 50% batch discount
	if diff := got.TotalCostUSD - wantCost; diff > 1e-9 || diff < -1e-9 {
		t.Fatalf("total cost: got %v want %v", got.TotalCostUSD, wantCost)
	}
	items, _ := bs.Items(b.ID)
	if items[0].Status != "done" || items[0].ImagePath == "" || items[0].CostUSD <= 0 {
		t.Fatalf("item: %+v", items[0])
	}
	saved, err := os.ReadFile(filepath.Join(dataDir, items[0].ImagePath))
	if err != nil || string(saved) != "PNGDATA" {
		t.Fatalf("saved image: %v %q", err, saved)
	}
}

func TestPollHandlesErrorFile(t *testing.T) {
	p, bs, _, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/batches/batch_openai_1":
			w.Write([]byte(`{"status":"completed","request_counts":{"completed":0,"failed":1,"total":1},"error_file_id":"file-err"}`))
		case "/v1/files/file-err/content":
			w.Write([]byte(`{"custom_id":"tau_empire__combat","error":{"message":"content policy violation"}}` + "\n"))
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status != "completed" || got.TotalCostUSD != 0 {
		t.Fatalf("batch: %+v", got)
	}
	items, _ := bs.Items(b.ID)
	if items[0].Status != "failed" || items[0].Error != "content policy violation" {
		t.Fatalf("item: %+v", items[0])
	}
}

func TestCountsUnknownBatchReturnsFalse(t *testing.T) {
	p, _, _, _, _ := pollerFixtures(t)
	if _, ok := p.Counts(999); ok {
		t.Fatal("expected ok=false for unknown batch")
	}
}

func TestPollDoesNotCompleteWhenErrorFileDownloadFails(t *testing.T) {
	p, bs, _, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/batches/batch_openai_1":
			w.Write([]byte(`{"status":"completed","request_counts":{"completed":0,"failed":1,"total":1},"error_file_id":"file-err"}`))
		case "/v1/files/file-err/content":
			w.WriteHeader(http.StatusInternalServerError)
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status == "completed" {
		t.Fatalf("batch flipped to completed despite failed error-file download: %+v", got)
	}
	items, _ := bs.Items(b.ID)
	if items[0].Status != "pending" {
		t.Fatalf("item should remain pending for retry, got: %+v", items[0])
	}
}

func TestPollDoesNotCompleteWhenOutputLineIsMalformed(t *testing.T) {
	p, bs, _, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/batches/batch_openai_1":
			w.Write([]byte(`{"status":"completed","request_counts":{"completed":1,"failed":0,"total":1},"output_file_id":"file-out"}`))
		case "/v1/files/file-out/content":
			w.Write([]byte("not valid json\n"))
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status == "completed" {
		t.Fatalf("batch flipped to completed despite an unparseable output line: %+v", got)
	}
	items, _ := bs.Items(b.ID)
	if items[0].Status != "pending" {
		t.Fatalf("item should remain pending for retry, got: %+v", items[0])
	}
}
