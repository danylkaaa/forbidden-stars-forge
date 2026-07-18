package prompt

import (
	"strings"
	"testing"
)

func TestFactionDescriptionInterpolates(t *testing.T) {
	p := FactionDescription("Tau Empire", "Galaxy in Flames")
	for _, want := range []string{
		"Faction name: Tau Empire",
		"Expansion (DLC): Galaxy in Flames",
		"Forbidden Stars",
		"80-140 words",
		"no preamble, no markdown",
	} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
}

func TestImageEditInterpolates(t *testing.T) {
	p := ImageEdit("combat", "frontline warriors", "fill the crimson zone; keep banner", "blue-grey plating")
	for _, want := range []string{
		"Edit this card template image. fill the crimson zone; keep banner",
		"Card type: combat — frontline warriors",
		"Faction aesthetic: blue-grey plating",
		"Photorealistic style",
		"at least 6 mm",
		"Do not add any text or lettering.",
	} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
}
