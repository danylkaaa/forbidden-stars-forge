// Package openai is a thin hand-rolled client for the OpenAI API (spec §4:
// no SDK dependency). M3 needs models list + file upload; M4 adds images.
package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

type Client struct {
	APIKey    string
	BaseURL   string
	RetryBase time.Duration
	http      *http.Client
}

func New(apiKey string) *Client {
	return &Client{
		APIKey:    apiKey,
		BaseURL:   "https://api.openai.com",
		RetryBase: 500 * time.Millisecond,
		http:      &http.Client{},
	}
}

type apiError struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

// do sends the request, retrying 429/5xx up to 3 attempts total (PRD §10).
// body is rebuilt per attempt via makeBody.
func (c *Client) do(ctx context.Context, method, path, contentType string, makeBody func() (io.Reader, error)) ([]byte, error) {
	if c.APIKey == "" {
		return nil, errors.New("OpenAI API key not set — add it in Settings")
	}
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(c.RetryBase << (attempt - 1)):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		body, err := makeBody()
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, body)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return data, nil
		}
		var ae apiError
		_ = json.Unmarshal(data, &ae)
		msg := ae.Error.Message
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		lastErr = fmt.Errorf("openai: %s (request id %s)", msg, resp.Header.Get("x-request-id"))
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			continue // retryable
		}
		return nil, lastErr
	}
	return nil, lastErr
}

func (c *Client) ListModels(ctx context.Context) (int, error) {
	data, err := c.do(ctx, http.MethodGet, "/v1/models", "", func() (io.Reader, error) { return nil, nil })
	if err != nil {
		return 0, err
	}
	var out struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return 0, fmt.Errorf("openai: bad models response: %w", err)
	}
	return len(out.Data), nil
}

// UploadFile uploads via the Files API and returns the file id.
// The file bytes are read once up front so retries can rebuild the body.
func (c *Client) UploadFile(ctx context.Context, filename, purpose string, data io.Reader) (string, error) {
	fileBytes, err := io.ReadAll(data)
	if err != nil {
		return "", err
	}
	// Fix the boundary once so every rebuild (each retry attempt calls
	// makeBody again) produces a body matching the Content-Type header set
	// below. multipart.NewWriter picks a new random boundary per instance,
	// so without pinning it here, a retried request's body boundary would
	// drift from the header captured on the priming call.
	boundary := multipart.NewWriter(nil).Boundary()
	contentType := "multipart/form-data; boundary=" + boundary
	makeBody := func() (io.Reader, error) {
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		if err := w.SetBoundary(boundary); err != nil {
			return nil, err
		}
		if err := w.WriteField("purpose", purpose); err != nil {
			return nil, err
		}
		fw, err := w.CreateFormFile("file", filename)
		if err != nil {
			return nil, err
		}
		if _, err := fw.Write(fileBytes); err != nil {
			return nil, err
		}
		if err := w.Close(); err != nil {
			return nil, err
		}
		return &buf, nil
	}
	respData, err := c.do(ctx, http.MethodPost, "/v1/files", contentType, makeBody)
	if err != nil {
		return "", err
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respData, &out); err != nil || out.ID == "" {
		return "", fmt.Errorf("openai: bad files response: %w", err)
	}
	return out.ID, nil
}
