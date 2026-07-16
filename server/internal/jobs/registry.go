// Package jobs is an in-memory registry for short-lived async jobs
// (Claude description generation). Jobs are lost on restart by design —
// they live ~60s and the UI polls every 2s (spec §4).
package jobs

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Status string

const (
	Pending Status = "pending"
	Done    Status = "done"
	Failed  Status = "failed"
)

type Job struct {
	ID         string `json:"id"`
	Status     Status `json:"status"`
	Result     string `json:"result,omitempty"`
	Error      string `json:"error,omitempty"`
	DurationMS int64  `json:"duration_ms"`
}

type entry struct {
	job    Job
	cancel context.CancelFunc
}

type Registry struct {
	mu      sync.Mutex
	nextID  int
	jobs    map[string]*entry
	timeout time.Duration
}

func New(timeout time.Duration) *Registry {
	return &Registry{jobs: make(map[string]*entry), timeout: timeout}
}

func (r *Registry) Start(fn func(ctx context.Context) (string, error)) string {
	r.mu.Lock()
	r.nextID++
	id := fmt.Sprintf("job-%d", r.nextID)
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	r.jobs[id] = &entry{job: Job{ID: id, Status: Pending}, cancel: cancel}
	r.mu.Unlock()

	go func() {
		start := time.Now()
		var result string
		var err error
		func() {
			defer func() {
				if p := recover(); p != nil {
					err = fmt.Errorf("job panicked: %v", p)
				}
			}()
			result, err = fn(ctx)
		}()
		cancel()
		r.mu.Lock()
		defer r.mu.Unlock()
		e := r.jobs[id]
		e.job.DurationMS = time.Since(start).Milliseconds()
		if err != nil {
			e.job.Status = Failed
			e.job.Error = err.Error()
		} else {
			e.job.Status = Done
			e.job.Result = result
		}
	}()
	return id
}

func (r *Registry) Get(id string) (Job, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.jobs[id]
	if !ok {
		return Job{}, false
	}
	return e.job, true
}

// Cancel cancels the job's context (killing the CLI subprocess via
// exec.CommandContext). The job transitions to failed via its goroutine.
func (r *Registry) Cancel(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.jobs[id]
	if !ok {
		return false
	}
	e.cancel()
	return true
}
