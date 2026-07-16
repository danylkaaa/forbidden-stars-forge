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
