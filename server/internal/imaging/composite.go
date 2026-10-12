// Package imaging post-processes area edits.
package imaging

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/png"
)

// ProtectUnmasked keeps the original pixels outside the edited area.
// GPT Image models treat the mask as guidance and may repaint (or subtly
// shift) the rest of the image, so the edit result is blended back:
// out = edited·w + original·(1−w), where w is 1 inside the mask's
// transparent ("edit here") area, 0 outside, with a soft edge of
// featherPx pixels. All three images must have the same size.
func ProtectUnmasked(original, edited, mask []byte, featherPx int) ([]byte, error) {
	orig, err := decode(original, "original")
	if err != nil {
		return nil, err
	}
	ed, err := decode(edited, "edited")
	if err != nil {
		return nil, err
	}
	m, err := decode(mask, "mask")
	if err != nil {
		return nil, err
	}
	b := orig.Bounds()
	if ed.Bounds().Size() != b.Size() || m.Bounds().Size() != b.Size() {
		return nil, fmt.Errorf("size mismatch: original %v, edited %v, mask %v", b.Size(), ed.Bounds().Size(), m.Bounds().Size())
	}
	w, h := b.Dx(), b.Dy()

	// Edit weight per pixel: transparent mask = 1.
	weight := make([]float32, w*h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			_, _, _, a := m.At(m.Bounds().Min.X+x, m.Bounds().Min.Y+y).RGBA()
			weight[y*w+x] = 1 - float32(a)/0xffff
		}
	}
	weight = feather(weight, w, h, featherPx)

	out := image.NewNRGBA(image.Rect(0, 0, w, h))
	oN := toNRGBA(orig)
	eN := toNRGBA(ed)
	for i := 0; i < w*h; i++ {
		k := weight[i]
		for c := 0; c < 4; c++ {
			o := float32(oN.Pix[i*4+c])
			e := float32(eN.Pix[i*4+c])
			out.Pix[i*4+c] = uint8(e*k + o*(1-k) + 0.5)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Size returns an encoded image's dimensions.
func Size(data []byte) (int, int, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0, err
	}
	return cfg.Width, cfg.Height, nil
}

func decode(data []byte, what string) (image.Image, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode %s image: %w", what, err)
	}
	return img, nil
}

func toNRGBA(img image.Image) *image.NRGBA {
	if n, ok := img.(*image.NRGBA); ok && n.Bounds().Min == (image.Point{}) {
		return n
	}
	b := img.Bounds()
	n := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(n, n.Bounds(), img, b.Min, draw.Src)
	return n
}

// feather softens the weight edges with a separable box blur.
func feather(src []float32, w, h, r int) []float32 {
	if r <= 0 {
		return src
	}
	tmp := make([]float32, len(src))
	dst := make([]float32, len(src))
	n := float32(2*r + 1)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var sum float32
			for d := -r; d <= r; d++ {
				sum += src[y*w+clamp(x+d, w)]
			}
			tmp[y*w+x] = sum / n
		}
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var sum float32
			for d := -r; d <= r; d++ {
				sum += tmp[clamp(y+d, h)*w+x]
			}
			dst[y*w+x] = sum / n
		}
	}
	return dst
}

func clamp(v, n int) int {
	if v < 0 {
		return 0
	}
	if v >= n {
		return n - 1
	}
	return v
}
