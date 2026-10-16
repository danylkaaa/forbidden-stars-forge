package imaging

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestHideMaskedMakesCoveredPixelsTransparent(t *testing.T) {
	src := solid(4, 2, color.NRGBA{200, 100, 50, 255})
	// A half-size mask: the left column opaque (hidden), the right one clear.
	m := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	m.SetNRGBA(0, 0, color.NRGBA{0, 0, 0, 255})
	var mb bytes.Buffer
	png.Encode(&mb, m)
	out, err := HideMasked(src, mb.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	img, _ := png.Decode(bytes.NewReader(out))
	if b := img.Bounds(); b.Dx() != 4 || b.Dy() != 2 {
		t.Fatalf("size %v", b)
	}
	for _, c := range []struct {
		x     int
		alpha uint8
	}{{0, 0}, {1, 0}, {2, 255}, {3, 255}} {
		got := color.NRGBAModel.Convert(img.At(c.x, 0)).(color.NRGBA)
		if got.A != c.alpha {
			t.Fatalf("x=%d alpha %d, want %d", c.x, got.A, c.alpha)
		}
		if c.alpha == 255 && (got.R != 200 || got.G != 100 || got.B != 50) {
			t.Fatalf("colour changed: %+v", got)
		}
	}
	if _, err := HideMasked([]byte("nope"), mb.Bytes()); err == nil {
		t.Fatal("bad image accepted")
	}
}
