package imaging

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"math"
)

// Frac is a rectangle in fractions of an image's width and height.
type Frac struct{ X, Y, W, H float64 }

// PlaceOver paints overlay on base: scaled (keeping its shape) to `height` × the base's height, centred at
// (cx, cy) × the base's size, and cut to the `clip` rectangle (and the base's edges). Returns PNG bytes at the
// base's size.
func PlaceOver(base, overlay []byte, cx, cy, height float64, clip Frac) ([]byte, error) {
	if height <= 0 {
		return nil, errors.New("the placed image needs a height")
	}
	b, err := decode(base, "base")
	if err != nil {
		return nil, err
	}
	o, err := decode(overlay, "placed")
	if err != nil {
		return nil, err
	}
	out, src := toNRGBA(b), toNRGBA(o)
	W, H := out.Bounds().Dx(), out.Bounds().Dy()
	sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
	dh := height * float64(H)
	dw := dh * float64(sw) / float64(sh)
	left, top := cx*float64(W)-dw/2, cy*float64(H)-dh/2
	k := float64(sh) / dh // source pixels per placed pixel
	cx0, cy0 := max(0, int(math.Round(clip.X*float64(W)))), max(0, int(math.Round(clip.Y*float64(H))))
	cx1, cy1 := min(W, int(math.Round((clip.X+clip.W)*float64(W)))), min(H, int(math.Round((clip.Y+clip.H)*float64(H))))
	for y := max(cy0, int(math.Floor(top))); y < min(cy1, int(math.Ceil(top+dh))); y++ {
		for x := max(cx0, int(math.Floor(left))); x < min(cx1, int(math.Ceil(left+dw))); x++ {
			c, ok := area(src, (float64(x)-left)*k, (float64(y)-top)*k, k)
			if ok {
				out.SetNRGBA(x, y, over(out.NRGBAAt(x, y), c))
			}
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// area averages the source pixels under one placed pixel (a k × k square from (sx, sy)), so a large picture
// shrinks smoothly instead of skipping pixels. False when the square lies outside the source.
func area(src *image.NRGBA, sx, sy, k float64) (color.NRGBA, bool) {
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	x0, y0 := int(math.Floor(sx)), int(math.Floor(sy))
	x1, y1 := max(x0+1, int(math.Ceil(sx+k))), max(y0+1, int(math.Ceil(sy+k)))
	x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
	if x0 >= x1 || y0 >= y1 {
		return color.NRGBA{}, false
	}
	var r, g, bl, a, n float64
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			c := src.NRGBAAt(x, y)
			al := float64(c.A)
			r, g, bl, a, n = r+float64(c.R)*al, g+float64(c.G)*al, bl+float64(c.B)*al, a+al, n+1
		}
	}
	if a == 0 {
		return color.NRGBA{}, true
	}
	return color.NRGBA{R: uint8(r / a), G: uint8(g / a), B: uint8(bl / a), A: uint8(a / n)}, true
}

// over blends c over dst (straight alpha).
func over(dst, c color.NRGBA) color.NRGBA {
	sa, da := float64(c.A)/255, float64(dst.A)/255
	oa := sa + da*(1-sa)
	if oa == 0 {
		return color.NRGBA{}
	}
	mix := func(s, d uint8) uint8 { return uint8((float64(s)*sa + float64(d)*da*(1-sa)) / oa) }
	return color.NRGBA{R: mix(c.R, dst.R), G: mix(c.G, dst.G), B: mix(c.B, dst.B), A: uint8(oa * 255)}
}
