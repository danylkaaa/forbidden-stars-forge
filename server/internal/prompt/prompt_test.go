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
