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

// ExtendSize is the size to ask the model for so that a picture has a width / height ratio: the longer side is
// ExtendLongEdge, both sides are divisible by 16, and the shape is held to 1:3 – 3:1, which the model accepts.
func ExtendSize(ratio float64) string {
	ratio = math.Min(3, math.Max(1.0/3, ratio))
	step := func(v float64) int { return max(16, int(math.Round(v/16))*16) }
	if ratio >= 1 {
		return fmt.Sprintf("%dx%d", ExtendLongEdge, step(ExtendLongEdge/ratio))
	}
	return fmt.Sprintf("%dx%d", step(ExtendLongEdge*ratio), ExtendLongEdge)
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
