// Batch API methods (PRD §7.4): submit a purpose:"batch" JSONL file,
// poll its status, cancel it, and download its output/error files.
package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

type BatchStatus struct {
	Status        string `json:"status"`
	RequestCounts struct {
		Completed int `json:"completed"`
		Failed    int `json:"failed"`
		Total     int `json:"total"`
	} `json:"request_counts"`
	OutputFileID string `json:"output_file_id"`
	ErrorFileID  string `json:"error_file_id"`
}

// CreateBatch submits a previously uploaded (purpose:"batch") JSONL file
// against the images/edits endpoint with a 24h completion window.
func (c *Client) CreateBatch(ctx context.Context, fileID string) (string, error) {
	body := map[string]string{
		"input_file_id":     fileID,
		"endpoint":          "/v1/images/edits",
		"completion_window": "24h",
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	data, err := c.do(ctx, http.MethodPost, "/v1/batches", "application/json",
		func() (io.Reader, error) { return bytes.NewReader(payload), nil })
	if err != nil {
		return "", err
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", fmt.Errorf("openai: bad batch create response: %w", err)
	}
	if out.ID == "" {
		return "", errors.New("openai: batch create response missing id")
	}
	return out.ID, nil
}

func (c *Client) GetBatch(ctx context.Context, id string) (BatchStatus, error) {
	data, err := c.do(ctx, http.MethodGet, "/v1/batches/"+id, "", func() (io.Reader, error) { return nil, nil })
	if err != nil {
		return BatchStatus{}, err
	}
	var out BatchStatus
	if err := json.Unmarshal(data, &out); err != nil {
		return BatchStatus{}, fmt.Errorf("openai: bad batch status response: %w", err)
	}
	return out, nil
}

func (c *Client) CancelBatch(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodPost, "/v1/batches/"+id+"/cancel", "", func() (io.Reader, error) { return nil, nil })
	return err
}

// FileContent downloads a file's raw bytes. Batch output/error files are
// JSONL, not the standard {"data": ...} envelope, so this returns bytes
// rather than decoding JSON.
func (c *Client) FileContent(ctx context.Context, fileID string) ([]byte, error) {
	return c.do(ctx, http.MethodGet, "/v1/files/"+fileID+"/content", "", func() (io.Reader, error) { return nil, nil })
}
