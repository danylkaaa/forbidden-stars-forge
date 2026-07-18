// Package prompt holds the prompt templates (PRD §8) in one place so the
// wording is easy to iterate on.
package prompt

import "fmt"

const factionDescriptionTemplate = `You are helping design a homemade expansion for the board game Forbidden Stars
(Warhammer 40K universe). Write an English description of the visual aesthetic
of the following faction for use in AI image-generation prompts.

Faction name: %s
Expansion (DLC): %s

Describe: color palette, materials and textures, iconography, mood, and
distinctive visual motifs. 80-140 words. Output only the description text,
no preamble, no markdown.`

func FactionDescription(name, dlc string) string {
	return fmt.Sprintf(factionDescriptionTemplate, name, dlc)
}

const imageEditTemplate = `Edit this card template image. %s

Card type: %s — %s

Faction aesthetic: %s

Photorealistic style. Keep all important elements at least 6 mm from the
image edges; background artwork must extend to the full bleed edge.
Do not add any text or lettering.`

// ImageEdit assembles the per-card prompt (PRD §8.2).
func ImageEdit(cardTypeName, cardTypeDescription, constraints, factionDescription string) string {
	return fmt.Sprintf(imageEditTemplate, constraints, cardTypeName, cardTypeDescription, factionDescription)
}
