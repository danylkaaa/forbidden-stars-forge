package imaging

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/png"
	"math"
)

// ExtendLongEdge is the longer side of the picture the model is asked for when an artwork is extended; with a shape
// up to 3:1 it has at least the 655,360 pixels the model needs.
const ExtendLongEdge = 1536

// EnhanceLongEdge is the longer side of the picture an artwork is enhanced into: larger than the extended ones, as
// the aim is more resolution.
const EnhanceLongEdge = 2048

// SizeFor is the size to ask the model for so that a picture has a width / height ratio with the given longer side:
// both sides are divisible by 16, and the shape is held to 1:3 – 3:1, which the model accepts.
func SizeFor(ratio float64, long int) string {
	ratio = math.Min(3, math.Max(1.0/3, ratio))
	step := func(v float64) int { return max(16, int(math.Round(v/16))*16) }
	if ratio >= 1 {
		return fmt.Sprintf("%dx%d", long, step(float64(long)/ratio))
	}
	return fmt.Sprintf("%dx%d", step(float64(long)*ratio), long)
}

// ExtendSize is the size for an extended picture of a ratio.
func ExtendSize(ratio float64) string { return SizeFor(ratio, ExtendLongEdge) }

// EnhanceSize is the size for an enhanced copy of a picture w x h: the same shape, with more pixels.
func EnhanceSize(w, h int) string {
	if w <= 0 || h <= 0 {
		return SizeFor(1, EnhanceLongEdge)
	}
	return SizeFor(float64(w)/float64(h), EnhanceLongEdge)
}

// AsPNG returns an image (PNG or JPEG) as PNG bytes, the format the model is sent.
func AsPNG(data []byte) ([]byte, error) {
	img, kind, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	if kind == "png" {
		return data, nil
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, errors.New("could not convert the image")
	}
	return buf.Bytes(), nil
}
