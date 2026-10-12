package imaging

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func solid(w, h int, c color.NRGBA) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < w*h; i++ {
		img.Pix[i*4], img.Pix[i*4+1], img.Pix[i*4+2], img.Pix[i*4+3] = c.R, c.G, c.B, c.A
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

// maskLeftHalf: transparent (edit) on x < w/2, opaque elsewhere.
func maskLeftHalf(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			a := uint8(255)
			if x < w/2 {
				a = 0
			}
			img.SetNRGBA(x, y, color.NRGBA{0, 0, 0, a})
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

func TestProtectUnmaskedKeepsOriginalOutsideMask(t *testing.T) {
	red, blue := color.NRGBA{255, 0, 0, 255}, color.NRGBA{0, 0, 255, 255}
	out, err := ProtectUnmasked(solid(40, 10, red), solid(40, 10, blue), maskLeftHalf(40, 10), 2)
	if err != nil {
		t.Fatal(err)
	}
	img, _ := png.Decode(bytes.NewReader(out))
	at := func(x int) color.NRGBA { return color.NRGBAModel.Convert(img.At(x, 5)).(color.NRGBA) }
	if at(2) != blue {
		t.Fatalf("inside mask should be the edit: %v", at(2))
	}
	if at(37) != red {
		t.Fatalf("outside mask should be the original: %v", at(37))
	}
	if mid := at(20); mid.R == 0 || mid.B == 0 {
		t.Fatalf("edge should be feathered (blend): %v", mid)
	}
}

func TestProtectUnmaskedRejectsSizeMismatch(t *testing.T) {
	c := color.NRGBA{1, 2, 3, 255}
	if _, err := ProtectUnmasked(solid(10, 10, c), solid(12, 10, c), maskLeftHalf(10, 10), 1); err == nil {
		t.Fatal("expected size mismatch error")
	}
}
