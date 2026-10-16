package imaging

import (
	"bytes"
	"errors"
	"image"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"math"
)

// CropToRatio crops an image around its centre to a width / height ratio, keeping as much of it as it can: the
// height is cut when the image is too tall for the ratio, the width when it is too wide. An image that already has
// the ratio (to a pixel) is returned as it is.
func CropToRatio(imagePNG []byte, ratio float64) ([]byte, error) {
	if ratio <= 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
		return nil, errors.New("invalid ratio")
	}
	src, _, err := image.Decode(bytes.NewReader(imagePNG))
	if err != nil {
		return nil, err
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w == 0 || h == 0 {
		return nil, errors.New("empty image")
	}
	var cw, ch int
	if float64(w)/float64(h) < ratio { // too tall: keep the full width
		cw, ch = w, int(math.Round(float64(w)/ratio))
	} else { // too wide: keep the full height
		cw, ch = int(math.Round(float64(h)*ratio)), h
	}
	if cw < 1 {
		cw = 1
	}
	if ch < 1 {
		ch = 1
	}
	if cw == w && ch == h {
		return imagePNG, nil
	}
	x0, y0 := b.Min.X+(w-cw)/2, b.Min.Y+(h-ch)/2
	out := image.NewNRGBA(image.Rect(0, 0, cw, ch))
	draw.Draw(out, out.Bounds(), src, image.Pt(x0, y0), draw.Src)
	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
