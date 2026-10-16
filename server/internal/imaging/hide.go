package imaging

import (
	"bytes"
	"errors"
	"image"
	_ "image/jpeg" // uploaded images may be JPEG
	"image/png"
)

// HideMasked makes the parts of an image that a mask covers transparent. The mask's opaque pixels are hidden,
// transparent ones kept, and partly transparent ones fade the image out by their opacity. The mask may have a
// different size from the image (the same shape, scaled); the result is a PNG the size of the image.
func HideMasked(imagePNG, maskPNG []byte) ([]byte, error) {
	src, _, err := image.Decode(bytes.NewReader(imagePNG))
	if err != nil {
		return nil, err
	}
	mask, err := png.Decode(bytes.NewReader(maskPNG))
	if err != nil {
		return nil, err
	}
	b, mb := src.Bounds(), mask.Bounds()
	if b.Empty() || mb.Empty() {
		return nil, errors.New("empty image")
	}
	w, h := b.Dx(), b.Dy()
	out := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		my := mb.Min.Y + y*mb.Dy()/h
		for x := 0; x < w; x++ {
			mx := mb.Min.X + x*mb.Dx()/w
			r, g, bl, a := src.At(b.Min.X+x, b.Min.Y+y).RGBA()
			_, _, _, ma := mask.At(mx, my).RGBA()
			keep := 0xffff - ma // 0..65535
			if a == 0 {
				continue
			}
			i := out.PixOffset(x, y)
			out.Pix[i], out.Pix[i+1], out.Pix[i+2] = uint8(r*0xffff/a>>8), uint8(g*0xffff/a>>8), uint8(bl*0xffff/a>>8)
			out.Pix[i+3] = uint8(uint64(a) * uint64(keep) / 0xffff >> 8)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
