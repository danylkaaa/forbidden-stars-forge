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
	p := ImageEdit("frontline warriors", "fill the crimson zone; keep banner", FactionStyle{
		Name: "Tau Empire", PrimaryColor: "ochre", Texture: "matte ceramic plating", Description: "blue-grey plating",
	})
	want := `Edit the provided card template image into finished card art.

## Description
frontline warriors

## Constraints
fill the crimson zone; keep banner

## Faction
Tau Empire

## Primary color
ochre

## Texture
matte ceramic plating

## Faction style
blue-grey plating

## Rendering
- Photorealistic style.
- Keep all important elements at least 6 mm from the image edges; background
  artwork must extend to the full bleed edge.
- Do not add any text or lettering.`
	if p != want {
		t.Fatalf("prompt:\n%s", p)
	}
}

func TestImageEditOmitsEmptySections(t *testing.T) {
	p := ImageEdit("  ", "", FactionStyle{Name: "Tau Empire", Description: "blue-grey plating"})
	if strings.Contains(p, "## Description") || strings.Contains(p, "## Constraints") || strings.Contains(p, "## Card type") ||
		strings.Contains(p, "## Primary color") || strings.Contains(p, "## Texture") ||
		!strings.Contains(p, "## Faction\nTau Empire") || !strings.Contains(p, "## Faction style\nblue-grey plating") {
		t.Fatalf("prompt:\n%s", p)
	}
}

func TestFactionDescriptionChatEditsCurrentAndReplaysHistory(t *testing.T) {
	p := FactionDescriptionChat("Sisters", "Symphony of War", "deep black", "polished ceramite", "Gothic black and crimson.", []Message{
		{Role: "user", Content: "Pasted lore: they burn heretics."},
		{Role: "assistant", Content: "Gothic black, crimson, and flame."},
		{Role: "user", Content: "Less fire, more gold."},
	})
	for _, want := range []string{
		"Faction name: Sisters",
		"Primary color: deep black",
		"Texture / material: polished ceramite",
		"Current description (the user's starting point):\n<<<\nGothic black and crimson.\n>>>",
		"rather than rewriting it from scratch",
		"[User]:\n<<<\nPasted lore: they burn heretics.\n>>>",
		"[You (proposed description)]:\n<<<\nGothic black, crimson, and flame.\n>>>",
		"[User]:\n<<<\nLess fire, more gold.\n>>>",
		"Output only the full description",
	} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
}

func TestFactionDescriptionChatWithoutCurrentWritesNew(t *testing.T) {
	p := FactionDescriptionChat("Orks", "Galaxy in Flames", "", "", "  ", []Message{{Role: "user", Content: ""}})
	if !strings.Contains(p, "There is no description yet.") || !strings.Contains(p, "Write a new description.") ||
		!strings.Contains(p, "(no specific instructions") {
		t.Fatalf("prompt:\n%s", p)
	}
}

func TestCardTypeFieldChatEditsChosenField(t *testing.T) {
	p := CardTypeFieldChat("constraints", "combat", "Battle-card frame.", "Keep the window transparent.", []Message{
		{Role: "user", Content: "Mention the green mask."},
	})
	for _, want := range []string{
		"Card type name: combat",
		"Card type description: Battle-card frame.",
		"You are editing the card type's constraints.",
		"## Constraints\n{constraints}", // shows Claude the real assembled layout
		"Current constraints (the user's starting point):\n<<<\nKeep the window transparent.\n>>>",
		"[User]:\n<<<\nMention the green mask.\n>>>",
		"Output only the full constraints text",
	} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
	if p := CardTypeFieldChat("description", "combat", "", "", nil); !strings.Contains(p, "There is no description yet.") ||
		!strings.Contains(p, "Card type constraints: (none)") {
		t.Fatalf("empty description prompt:\n%s", p)
	}
}

func TestImagePromptChatEditsCurrentPrompt(t *testing.T) {
	p := ImagePromptChat("## Faction\nTau", []Message{{Role: "user", Content: "More rim light."}})
	for _, want := range []string{
		"Current prompt (the user's starting point):\n<<<\n## Faction\nTau\n>>>",
		"[User]:\n<<<\nMore rim light.\n>>>",
		"Keep that structure",
		"Output only the full prompt text",
	} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
}
