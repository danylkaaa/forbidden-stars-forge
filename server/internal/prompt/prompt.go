// Package prompt holds the prompt templates (PRD §8) in one place so the
// wording is easy to iterate on.
package prompt

import (
	"fmt"
	"strings"
)

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

// Message is one turn of a description-editing conversation. Role is
// "user" (instructions or pasted reference text) or "assistant" (a
// proposed description).
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

const factionDescriptionChatTemplate = `You are helping design a homemade expansion for the board game Forbidden Stars
(Warhammer 40K universe). You maintain an English description of the visual
aesthetic of the following faction, used in AI image-generation prompts.

Faction name: %s
Expansion (DLC): %s
Primary color: %s
Texture / material: %s

The primary color and texture are separate fields sent next to this
description, so the description covers the rest of the style: secondary
colors and accents, iconography, mood, and distinctive visual motifs. Stay
consistent with the primary color and texture, but don't just restate them.

%s

Conversation so far (the user's instructions and pasted reference material,
and your previous proposals):
%s

Apply the user's latest instructions. %s Keep it roughly 60-120 words unless
the user asks otherwise. Output only the full description
text, no preamble, no commentary, no markdown.`

// FactionDescriptionChat builds a prompt for editing (or, with no current
// description, writing) a faction description from a conversation. The
// claude CLI is stateless, so the full history is replayed every turn.
func FactionDescriptionChat(name, dlc, primaryColor, texture, current string, msgs []Message) string {
	var base, rule string
	if strings.TrimSpace(current) != "" {
		base = "Current description (the user's starting point):\n<<<\n" + current + "\n>>>"
		rule = "Edit the description rather than rewriting it from scratch: keep the wording\nand details the user did not ask to change."
	} else {
		base = "There is no description yet."
		rule = "Write a new description."
	}
	return fmt.Sprintf(factionDescriptionChatTemplate, name, dlc, orNone(primaryColor), orNone(texture),
		base, conversation(msgs, "description"), rule)
}

// conversation renders chat turns for replay; assistant turns are labeled
// as the proposed <what>.
func conversation(msgs []Message, what string) string {
	var conv strings.Builder
	for _, m := range msgs {
		who := "User"
		if m.Role == "assistant" {
			who = "You (proposed " + what + ")"
		}
		content := strings.TrimSpace(m.Content)
		if content == "" {
			content = "(no specific instructions — improve it)"
		}
		fmt.Fprintf(&conv, "[%s]:\n<<<\n%s\n>>>\n\n", who, content)
	}
	return strings.TrimRight(conv.String(), "\n")
}

const cardTypeFieldChatTemplate = `You are helping write prompts for an AI image-editing model (OpenAI GPT Image)
that turns a card template image into finished card art for a homemade
expansion of the board game Forbidden Stars (Warhammer 40K universe).

For every faction, the prompt sent to the image model (together with the
template image) is assembled as Markdown sections like this:
---
%s
---

Your text goes inside its own section, so do not add section headers.

Card type name: %s
Card type description: %s
Card type constraints: %s

You are editing the card type's %s. %s

%s

Conversation so far (the user's instructions and pasted reference material,
and your previous proposals):
%s

Apply the user's latest instructions. %s The text must work for every faction
(no faction-specific details). Output only the full %s text, no preamble, no
commentary, no markdown.`

var cardTypeFieldGuidance = map[string]string{
	"description": "The description says what this card type is and what its art should depict overall.",
	"constraints": "The constraints are precise imperative instructions to the image model about how to\ntreat the template: regions/masks to fill or keep, colors used as markers, what must\nstay untouched, transparency, and what must not be added.",
}

// CardTypeFieldChat builds a prompt for editing a card type's description
// or constraints from a conversation, replayed in full every turn.
func CardTypeFieldChat(field, name, description, constraints string, msgs []Message) string {
	current := description
	if field == "constraints" {
		current = constraints
	}
	var base, rule string
	if strings.TrimSpace(current) != "" {
		base = "Current " + field + " (the user's starting point):\n<<<\n" + current + "\n>>>"
		rule = "Edit it rather than rewriting it from scratch: keep the wording\nand details the user did not ask to change."
	} else {
		base = "There is no " + field + " yet."
		rule = "Write a new " + field + "."
	}
	return fmt.Sprintf(cardTypeFieldChatTemplate, assembledPromptShape, name, orNone(description), orNone(constraints),
		field, cardTypeFieldGuidance[field], base, conversation(msgs, field), rule, field)
}

const imagePromptChatTemplate = `You are helping refine a prompt for an AI image-editing model (OpenAI GPT Image)
that turns a card template image into finished card art for a homemade
expansion of the board game Forbidden Stars (Warhammer 40K universe). The
template image is sent alongside the prompt.

The prompt is Markdown with sections (## Description, ## Constraints,
## Faction, ## Primary color, ## Texture, ## Faction style, ## Rendering). Keep that structure unless the
user asks to change it.

Current prompt (the user's starting point):
<<<
%s
>>>

Conversation so far (the user's instructions and pasted reference material,
and your previous proposals):
%s

Apply the user's latest instructions. Edit the prompt rather than rewriting it
from scratch: keep the wording and details the user did not ask to change.
Output only the full prompt text, no preamble, no commentary, and no code
fences.`

// ImagePromptChat builds a prompt for editing a full image-edit prompt
// (Test Generation's prompt override) from a conversation.
func ImagePromptChat(current string, msgs []Message) string {
	return fmt.Sprintf(imagePromptChatTemplate, current, conversation(msgs, "prompt"))
}

func orNone(s string) string {
	if strings.TrimSpace(s) == "" {
		return "(none)"
	}
	return s
}

const imageEditIntro = "Edit the provided card template image into finished card art."

const imageEditRendering = `- Photorealistic style.
- Keep all important elements at least 6 mm from the image edges; background
  artwork must extend to the full bleed edge.
- Do not add any text or lettering.`

// FactionStyle is the faction part of the image prompt.
type FactionStyle struct {
	Name         string
	PrimaryColor string
	Texture      string
	Description  string // the rest of the style
}

// ImageEdit assembles the per-card prompt (PRD §8.2) as Markdown sections
// so the image model can tell the parts apart. Empty sections are omitted.
func ImageEdit(cardTypeDescription, constraints string, f FactionStyle) string {
	var b strings.Builder
	b.WriteString(imageEditIntro)
	section := func(title, body string) {
		if body = strings.TrimSpace(body); body != "" {
			fmt.Fprintf(&b, "\n\n## %s\n%s", title, body)
		}
	}
	section("Description", cardTypeDescription)
	section("Constraints", constraints)
	section("Faction", f.Name)
	section("Primary color", f.PrimaryColor)
	section("Texture", f.Texture)
	section("Faction style", f.Description)
	section("Rendering", imageEditRendering)
	return b.String()
}

// assembledPromptShape shows Claude the real ImageEdit layout (so the two
// can't drift apart) with placeholders for the variable parts.
var assembledPromptShape = ImageEdit("{description}", "{constraints}", FactionStyle{
	Name: "{faction name}", PrimaryColor: "{faction primary color}", Texture: "{faction texture}",
	Description: "{faction-specific style description}",
})

// AreaEdit is the prompt for editing a painted area of an existing image:
// the image's original prompt for context, plus the requested change.
func AreaEdit(originalPrompt, instruction string) string {
	return strings.TrimSpace(originalPrompt) + `

## Edit
` + strings.TrimSpace(instruction) + `

Change only the masked (transparent) area of the provided image. Keep
everything outside it exactly as it is: same layout, colors, lighting and
details. Blend the edited area seamlessly into its surroundings.`
}
