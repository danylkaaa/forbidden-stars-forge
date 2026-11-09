package imaging

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func filled(w, h int, c color.NRGBA) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = c.R, c.G, c.B, c.A
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

func TestAPlacedImageIsScaledToItsHeightAndCentredWhereAsked(t *testing.T) {
	blue, red := color.NRGBA{0, 0, 255, 255}, color.NRGBA{255, 0, 0, 255}
	// A 100 × 50 base; a 40 × 80 red picture placed half the base's height tall (25 px, so 12.5 wide) at x = 0.25.
	whole := Frac{0, 0, 1, 1}
	out, err := PlaceOver(filled(100, 50, blue), filled(40, 80, red), 0.25, 0.5, 0.5, whole)
	if err != nil {
		t.Fatal(err)
	}
	img, _ := png.Decode(bytes.NewReader(out))
	if img.Bounds().Dx() != 100 || img.Bounds().Dy() != 50 {
		t.Fatalf("size %v", img.Bounds())
	}
	at := func(x, y int) color.NRGBA { return color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA) }
	if at(25, 25) != red || at(25, 15) != red {
		t.Fatalf("inside: %v %v", at(25, 25), at(25, 15))
	}
	if at(25, 5) != blue || at(40, 25) != blue || at(10, 25) != blue {
		t.Fatalf("outside: %v %v %v", at(25, 5), at(40, 25), at(10, 25))
	}
	// Placed partly off the base: cut, no error.
	if _, err := PlaceOver(filled(100, 50, blue), filled(40, 80, red), 0, 0, 2, whole); err != nil {
		t.Fatal(err)
	}
	// Cut to a box: the left half of the base only.
	out, _ = PlaceOver(filled(100, 50, blue), filled(400, 200, red), 0.5, 0.5, 1, Frac{0, 0, 0.5, 1})
	img, _ = png.Decode(bytes.NewReader(out))
	if at(25, 25) != red || at(49, 25) != red || at(50, 25) != blue || at(75, 25) != blue {
		t.Fatalf("clipped: %v %v %v %v", at(25, 25), at(49, 25), at(50, 25), at(75, 25))
	}
}
