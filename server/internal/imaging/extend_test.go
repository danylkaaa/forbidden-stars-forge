package imaging

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestExtendSizeHoldsTheShapeToWhatTheModelAccepts(t *testing.T) {
	for ratio, want := range map[float64]string{1: "1536x1536", 0.683: "1056x1536", 1.437: "1536x1072", 9: "1536x512", 0.05: "512x1536"} {
		if got := ExtendSize(ratio); got != want {
			t.Errorf("ExtendSize(%v) = %s, want %s", ratio, got, want)
		}
	}
}

func TestEnhanceSizeKeepsTheShapeWithMorePixels(t *testing.T) {
	for _, c := range []struct {
		w, h int
		want string
	}{{600, 900, "1360x2048"}, {1000, 1000, "2048x2048"}, {3000, 1000, "2048x688"}, {5000, 1000, "2048x688"}, {0, 0, "2048x2048"}} {
		if got := EnhanceSize(c.w, c.h); got != c.want {
			t.Errorf("EnhanceSize(%d, %d) = %s, want %s", c.w, c.h, got, c.want)
		}
	}
}

func TestAsPNGConvertsJPEGAndKeepsPNG(t *testing.T) {
	var jpg bytes.Buffer
	if err := jpeg.Encode(&jpg, image.NewRGBA(image.Rect(0, 0, 4, 4)), nil); err != nil {
		t.Fatal(err)
	}
	out, err := AsPNG(jpg.Bytes())
	if err != nil || !bytes.HasPrefix(out, []byte("\x89PNG")) {
		t.Fatalf("jpeg -> %v %v", out[:min(4, len(out))], err)
	}
	p := solid(4, 4, color.NRGBA{1, 2, 3, 255})
	if same, _ := AsPNG(p); !bytes.Equal(same, p) {
		t.Fatal("a PNG is returned as it is")
	}
	if _, err := AsPNG([]byte("nope")); err == nil {
		t.Fatal("garbage accepted")
	}
}
