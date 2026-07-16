// Package claude shells out to the locally installed claude CLI.
package claude

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

type Runner struct {
	Binary string // path or name of the claude binary; empty means "claude"
}

func (r *Runner) Run(ctx context.Context, prompt string) (string, error) {
	bin := r.Binary
	if bin == "" {
		bin = "claude"
	}
	if _, err := exec.LookPath(bin); err != nil {
		return "", fmt.Errorf("claude CLI not found (%q) — set path in Settings", bin)
	}

	cmd := exec.CommandContext(ctx, bin, "-p", prompt)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Run the child in its own process group so that on cancellation we can
	// kill any grandchildren it spawns (e.g. a subprocess that inherits the
	// stdout/stderr pipes), not just the direct child. Without this, a
	// lingering grandchild holding the pipes open can block cmd.Run() past
	// the context deadline, breaking the timeout/cancellation guarantee.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process != nil {
			return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		return nil
	}
	// Backstop: ensure Wait() always returns even if the pipes are somehow
	// still held open after the process group is killed.
	cmd.WaitDelay = 5 * time.Second

	err := cmd.Run()
	if err != nil {
		if ctxErr := ctx.Err(); errors.Is(ctxErr, context.DeadlineExceeded) || errors.Is(ctxErr, context.Canceled) {
			return "", fmt.Errorf("claude CLI timed out or was cancelled")
		}
		excerpt := strings.TrimSpace(stderr.String())
		if len(excerpt) > 300 {
			excerpt = excerpt[:300]
		}
		if excerpt == "" {
			excerpt = err.Error()
		}
		return "", fmt.Errorf("claude CLI failed: %s", excerpt)
	}
	return strings.TrimSpace(stdout.String()), nil
}
