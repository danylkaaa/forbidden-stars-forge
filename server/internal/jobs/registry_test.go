package jobs

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func waitTerminal(t *testing.T, r *Registry, id string) Job {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		j, ok := r.Get(id)
		if !ok {
			t.Fatalf("job %s vanished", id)
		}
		if j.Status != Pending {
			return j
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("job never reached terminal status")
	return Job{}
}

func TestJobSucceeds(t *testing.T) {
	r := New(time.Second)
	id := r.Start(func(ctx context.Context) (string, error) { return "result text", nil })

	if j, ok := r.Get(id); !ok || (j.Status != Pending && j.Status != Done) {
		t.Fatalf("immediately after start: %+v ok=%v", j, ok)
	}
	j := waitTerminal(t, r, id)
	if j.Status != Done || j.Result != "result text" || j.Error != "" {
		t.Fatalf("job = %+v", j)
	}
	if j.DurationMS < 0 {
		t.Fatalf("duration = %d", j.DurationMS)
	}
}

func TestJobFails(t *testing.T) {
	r := New(time.Second)
	id := r.Start(func(ctx context.Context) (string, error) { return "", errors.New("cli exploded") })
	j := waitTerminal(t, r, id)
	if j.Status != Failed || j.Error != "cli exploded" {
		t.Fatalf("job = %+v", j)
	}
}

func TestJobTimeout(t *testing.T) {
	r := New(50 * time.Millisecond)
	id := r.Start(func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	j := waitTerminal(t, r, id)
	if j.Status != Failed {
		t.Fatalf("job = %+v", j)
	}
}

func TestCancel(t *testing.T) {
	r := New(time.Minute)
	id := r.Start(func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	if !r.Cancel(id) {
		t.Fatal("cancel returned false")
	}
	j := waitTerminal(t, r, id)
	if j.Status != Failed {
		t.Fatalf("job = %+v", j)
	}
	if r.Cancel("job-999") {
		t.Fatal("cancel of unknown id returned true")
	}
}

func TestJobPanicIsRecovered(t *testing.T) {
	r := New(time.Second)
	id := r.Start(func(ctx context.Context) (string, error) {
		panic("boom")
	})
	j := waitTerminal(t, r, id)
	if j.Status != Failed {
		t.Fatalf("job = %+v", j)
	}
	if !strings.Contains(j.Error, "boom") {
		t.Fatalf("error = %q, want it to contain %q", j.Error, "boom")
	}
}

func TestGetUnknown(t *testing.T) {
	r := New(time.Second)
	if _, ok := r.Get("nope"); ok {
		t.Fatal("unknown id returned ok")
	}
}
