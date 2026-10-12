package claude

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fakeBinary(t *testing.T, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "fake-claude")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRunReturnsTrimmedStdout(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `echo "  generated text  "`)}
	out, err := r.Run(context.Background(), "prompt")
	if err != nil {
		t.Fatal(err)
	}
	if out != "generated text" {
		t.Fatalf("out = %q", out)
	}
}

func TestRunPassesPromptAsDashPArg(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `[ "$1" = "-p" ] && echo "$2" || exit 1`)}
	out, err := r.Run(context.Background(), "hello world")
	if err != nil {
		t.Fatal(err)
	}
	if out != "hello world" {
		t.Fatalf("out = %q", out)
	}
}

func TestRunSurfacesStderrOnFailure(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `echo "boom detail" >&2; exit 1`)}
	_, err := r.Run(context.Background(), "prompt")
	if err == nil || !strings.Contains(err.Error(), "boom detail") {
		t.Fatalf("err = %v, want stderr excerpt", err)
	}
}

func TestRunMissingBinary(t *testing.T) {
	r := &Runner{Binary: "/nonexistent/claude-binary"}
	_, err := r.Run(context.Background(), "prompt")
	if err == nil || !strings.Contains(err.Error(), "claude CLI not found") {
		t.Fatalf("err = %v", err)
	}
}

func TestRunTimeout(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `sleep 5`)}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, err := r.Run(ctx, "prompt")
	if err == nil || !strings.Contains(err.Error(), "timed out or was cancelled") {
		t.Fatalf("err = %v", err)
	}
}

// TestRunTimeoutWithGrandchild guards against exec.CommandContext's default
// cancellation behavior, which only SIGKILLs the direct child. If that child
// spawns a background grandchild that inherits the stdout/stderr pipes, the
// grandchild can keep those pipes open indefinitely, and cmd.Run() would
// block past the context deadline waiting for them to close. Run must kill
// the whole process group (and fall back to cmd.WaitDelay) so it always
// returns promptly with a timeout error.
func TestRunTimeoutWithGrandchild(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, "sleep 30 &\nwait")}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, err := r.Run(ctx, "prompt")
	elapsed := time.Since(start)

	if err == nil || !strings.Contains(err.Error(), "timed out or was cancelled") {
		t.Fatalf("err = %v, want timeout error", err)
	}
	if elapsed > 5*time.Second {
		t.Fatalf("Run took %v, want < 5s (grandchild likely kept pipes open past deadline)", elapsed)
	}
}

func TestArgsAddModelAndEffortWhenSet(t *testing.T) {
	if got := fmt.Sprint((&Runner{}).args("hi")); got != "[-p hi]" {
		t.Fatalf("defaults: %s", got)
	}
	got := fmt.Sprint((&Runner{Model: "opus", Effort: "high"}).args("hi"))
	if got != "[-p hi --model opus --effort high]" {
		t.Fatalf("args: %s", got)
	}
}
