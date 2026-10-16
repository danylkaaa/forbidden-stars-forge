package imaging

import (
	"bytes"
	"image/color"
	"image/png"
	"testing"
)

func TestCropToRatioKeepsTheCentreAtTheRequestedShape(t *testing.T) {
	size := func(data []byte) (int, int) {
		img, err := png.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		return img.Bounds().Dx(), img.Bounds().Dy()
	}
	wide := solid(300, 100, color.NRGBA{10, 20, 30, 255}) // 3:1
	out, err := CropToRatio(wide, 5)                      // wider than the image: the height is cut
	if err != nil {
		t.Fatal(err)
	}
	if w, h := size(out); w != 300 || h != 60 {
		t.Fatalf("5:1 from 3:1 = %d x %d, want 300 x 60", w, h)
	}
	if out, _ := CropToRatio(wide, 3); !bytes.Equal(out, wide) {
		t.Fatal("an image that has the ratio is left as it is")
	}
	if out, _ := CropToRatio(wide, 1.5); true {
		if w, h := size(out); w != 150 || h != 100 {
			t.Fatalf("1.5:1 from 3:1 = %d x %d, want 150 x 100", w, h)
		}
	}
	if _, err := CropToRatio(wide, 0); err == nil {
		t.Fatal("a zero ratio was accepted")
	}
}
