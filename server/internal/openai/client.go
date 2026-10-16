// Package openai is a thin hand-rolled client for the OpenAI API (spec §4:
// no SDK dependency). M3 needs models list + file upload; M4 adds images.
package openai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"sort"
	"strings"
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
	ids, err := c.modelIDs(ctx)
	return len(ids), err
}

// ListImageModels returns the sorted ids of the GPT Image models this key
// can use (gpt-image-*, chatgpt-image-*), for the Settings model picker.
func (c *Client) ListImageModels(ctx context.Context) ([]string, error) {
	ids, err := c.modelIDs(ctx)
	if err != nil {
		return nil, err
	}
	out := []string{}
	for _, id := range ids {
		if strings.HasPrefix(id, "gpt-image-") || strings.HasPrefix(id, "chatgpt-image-") {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out, nil
}

func (c *Client) modelIDs(ctx context.Context) ([]string, error) {
	data, err := c.do(ctx, http.MethodGet, "/v1/models", "", func() (io.Reader, error) { return nil, nil })
	if err != nil {
		return nil, err
	}
	var out struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("openai: bad models response: %w", err)
	}
	ids := make([]string, len(out.Data))
	for i, m := range out.Data {
		ids[i] = m.ID
	}
	return ids, nil
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

type ImageEditRequest struct {
	Model             string
	FileID            string // input image as an uploaded file…
	ImageURL          string // …or as a URL / base64 data URL (used when FileID is empty)
	ReferenceImageURL string // optional second image, used as a visual reference
	MaskURL           string // optional mask (PNG with alpha) as a URL / data URL
	Prompt            string
	Size              string
	Quality           string
	InputFidelity     string
	Background        string // transparent | opaque | auto
}

// usesV2 reports whether model is a gpt-image-2 family model (incl. 2.5
// and dated snapshots). These always process inputs at high fidelity, so
// input_fidelity must be omitted.
func usesV2(model string) bool {
	return strings.HasPrefix(model, "gpt-image-2")
}

// withSize sets the image size; an empty one is left out, so the model follows the template ("auto"),
// instead of sending an empty size that OpenAI rejects.
func withSize(body map[string]any, size string) {
	if size != "" {
		body["size"] = size
	}
}

// EditBody is the JSON body for POST /v1/images/edits, shared by the
// direct call. Uses the `images` array of file
// references; output is always PNG so a transparent background works.
// Moderation is always "low": grimdark Warhammer subjects (skulls, war,
// gore) trip the default "auto" filter.
func EditBody(req ImageEditRequest) map[string]any {
	images := []map[string]string{imageRef(req)}
	if req.ReferenceImageURL != "" {
		images = append(images, map[string]string{"image_url": req.ReferenceImageURL})
	}
	body := map[string]any{
		"model":         req.Model,
		"images":        images,
		"prompt":        req.Prompt,
		"quality":       req.Quality,
		"output_format": "png",
		"moderation":    "low",
		"n":             1,
	}
	withSize(body, req.Size)
	if req.InputFidelity != "" && !usesV2(req.Model) {
		body["input_fidelity"] = req.InputFidelity
	}
	if req.Background != "" {
		body["background"] = req.Background
	}
	if req.MaskURL != "" {
		body["mask"] = map[string]string{"image_url": req.MaskURL}
	}
	return body
}

func imageRef(req ImageEditRequest) map[string]string {
	if req.FileID != "" {
		return map[string]string{"file_id": req.FileID}
	}
	return map[string]string{"image_url": req.ImageURL}
}

type ImageEditResult struct {
	PNG             []byte
	InputTokens     int64
	TextInputTokens int64 // text share of InputTokens
	OutputTokens    int64
}

// GenerateBody is the JSON body for POST /v1/images/generations: the same
// settings as an edit, but with no input image.
func GenerateBody(req ImageEditRequest) map[string]any {
	body := map[string]any{
		"model":         req.Model,
		"prompt":        req.Prompt,
		"quality":       req.Quality,
		"output_format": "png",
		"moderation":    "low",
		"n":             1,
	}
	withSize(body, req.Size)
	if req.Background != "" {
		body["background"] = req.Background
	}
	return body
}

// NoInput reports whether a request has no image to edit: the picture is made from the prompt alone.
func (r ImageEditRequest) NoInput() bool {
	return r.FileID == "" && r.ImageURL == "" && r.ReferenceImageURL == ""
}

// EditImage calls POST /v1/images/edits referencing an uploaded template
// by file_id (see EditBody) and decodes the b64 PNG.
func (c *Client) EditImage(ctx context.Context, req ImageEditRequest) (ImageEditResult, error) {
	path, body := "/v1/images/edits", EditBody(req)
	switch {
	case req.NoInput():
		path, body = "/v1/images/generations", GenerateBody(req)
	case req.FileID == "" && req.ImageURL == "":
		// No template, but a reference picture (a front for a back): that picture is what gets edited.
		req.ImageURL, req.ReferenceImageURL = req.ReferenceImageURL, ""
		body = EditBody(req)
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return ImageEditResult{}, err
	}
	data, err := c.do(ctx, http.MethodPost, path, "application/json",
		func() (io.Reader, error) { return bytes.NewReader(payload), nil })
	if err != nil {
		return ImageEditResult{}, err
	}
	var out struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		Usage struct {
			InputTokens        int64 `json:"input_tokens"`
			OutputTokens       int64 `json:"output_tokens"`
			InputTokensDetails struct {
				TextTokens int64 `json:"text_tokens"`
			} `json:"input_tokens_details"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return ImageEditResult{}, fmt.Errorf("openai: bad images response: %w", err)
	}
	if len(out.Data) == 0 || out.Data[0].B64JSON == "" {
		return ImageEditResult{}, errors.New("openai: empty images response")
	}
	png, err := base64.StdEncoding.DecodeString(out.Data[0].B64JSON)
	if err != nil {
		return ImageEditResult{}, fmt.Errorf("openai: bad image base64: %w", err)
	}
	return ImageEditResult{
		PNG:             png,
		InputTokens:     out.Usage.InputTokens,
		TextInputTokens: out.Usage.InputTokensDetails.TextTokens,
		OutputTokens:    out.Usage.OutputTokens,
	}, nil
}
