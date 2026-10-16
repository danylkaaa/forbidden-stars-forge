import { FIELDS, UPGRADE_TYPES, type Category, type CardInput } from './model'
import { SYMBOL_CATALOG } from '../assemble/model'
import type { Faction } from '../factions/api'
export function exampleImport(factionId: number): { cards: CardInput[] } {
  return { cards: [
    { faction_id: factionId, name: 'Fire Superiority', category: 'combat', starting: true, level: 0, resource_cost: 0, shields: 1, guns: 2, eagles: 0, upper_text: 'Upper effect text', units: ['Skitarii', 'Light Cruiser'], unit_text: 'Rout 1 enemy unit. Gain (M).' },
    { faction_id: factionId, name: 'Regroup', category: 'schema', subtype: 'tactic', action: 'move_horizontal', text: 'Move within your area.' },
    { faction_id: factionId, name: 'Reinforcements', category: 'upgrade', upgrade_type: 'deploy', level: 1, resource_cost: 2, text: 'Upgrade text', limitation: 'Limit one per area.' },
  ] }
}
export function readUTF8(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(reader.result as ArrayBuffer)) }
      catch { reject(new Error('File must contain valid UTF-8 text')) }
    }
    reader.readAsArrayBuffer(file)
  })
}

// What each field means on the printed card.
const FIELD_HELP: Record<string, string> = {
  level: 'the card\'s level, shown in the level badge (0 to 3)',
  resource_cost: 'the resource price printed in the price badge',
  shields: 'how many shield icons the card shows (a count)',
  guns: 'how many boltgun icons the card shows (a count)',
  eagles: 'how many morale icons the card shows (a count)',
  upper_text: 'the rules text in the upper panel: the main effects, usually written as keyword-led sentences',
  units: 'the unit names the lower text is about, one entry per name, e.g. ["Skitarii", "Light Cruiser"]; they are printed joined with "/" in italics, followed by " : " (a space, a colon, a space) and the unit text',
  unit_text: 'the lower panel\'s rules text for those units, without the names or the colon',
  subtype: 'whether the card is a "schema" or a "tactic"',
  action: 'the movement the card gives: rotate_clockwise, rotate_counterclockwise, move_vertical, move_horizontal or move_everywhere',
  text: 'the card\'s rules text',
  upgrade_type: 'the order the upgrade belongs to (printed as its order icon)',
  limitation: 'an optional bottom line restricting the upgrade, e.g. "Limit one per area."; leave the key out when there is none',
}
const CATEGORY_HELP: Record<Category, string> = {
  combat: 'a unit combat card. Add "starting": true for a faction\'s starting card (it has no level or price and shows the faction logo instead; then level and resource_cost must be 0 or left out).',
  schema: 'a schema or tactic card with one movement action.',
  upgrade: 'an upgrade card tied to one of the orders.',
}

// A prompt to give an AI together with source material (rules text, a card list, a photo): it asks for a JSON
// file this dialog accepts, explaining every field, the text markup and the symbol tokens, and listing the factions.
export function importPrompt(factions: Pick<Faction, 'id' | 'name'>[]): string {
  const typeOf = (f: typeof FIELDS[Category][number]) => f.options ? `one of ${f.options.map(o => `"${o}"`).join(', ')}` : f.kind === 'number' ? 'integer >= 0' : f.kind === 'list' ? 'array of strings, [] when none; no name may be empty or contain "/"' : 'string (may be empty)'
  const fields = (category: Category) => FIELDS[category]
    .map(f => `  - ${f.key}${f.optional ? ' (optional)' : ''}: ${typeOf(f)}. ${FIELD_HELP[f.key] ?? ''}`).join('\n')
  return `Convert the cards I give you into one JSON file for a card-library import. Reply with only the JSON, no commentary.

Format: {"cards": [ ... ]}. Every card is an object with these fields, and no others:
  - faction_id: integer, the ID of the card's faction from the "Factions" list below
  - name: non-empty string; the card's title (combat titles are printed in capitals)
  - category: "combat", "schema" or "upgrade"
plus the fields of its category:

combat is ${CATEGORY_HELP.combat}
${fields('combat')}
  - starting (optional boolean): true for a starting card.
schema is ${CATEGORY_HELP.schema}
${fields('schema')}
upgrade is ${CATEGORY_HELP.upgrade}
${fields('upgrade')}
  (upgrade_type values: ${UPGRADE_TYPES.join(', ')})

Rules for values: numbers are JSON numbers, never strings. Required text fields are strings, "" when empty, never null. An optional field is left out when it has no value.

Text markup, usable in upper_text, unit_text, text and limitation:
  - *word* or **word**: italic (both forms are italic; keywords such as **Battle:** are written this way)
  - __word__: bold. Nest them to combine: *__both__*
  - Symbol tokens, written exactly as shown, are replaced by icons:
${SYMBOL_CATALOG.map(s => `      ${s.token}  ${s.label}`).join('\n')}
    Parentheses give the plain icon, square brackets the icon in a box. Morale is always drawn boxed: (M) and [M] are the same icon.
  - Everything else is printed as written. Do not use markdown headings, lists or line-break tricks.
Use the tokens wherever the source shows a boltgun, shield, morale or dice symbol or spells out "[B]", "[S]", "[M]". Keep the card text exactly as written in the source: do not translate, reword or shorten it.

Splitting a combat card's lower text: "Skitarii/Light Cruiser: Force your opponent to lose 1 [B]." becomes units ["Skitarii", "Light Cruiser"] and unit_text "Force your opponent to lose 1 [B]." Text without a "names:" prefix has units [] and the whole text as unit_text.

Factions. faction_id must be the number on the right of "faction_id =", chosen by the faction's name (match names ignoring case); never use the name itself or a made-up number:
${factions.map(f => `  - faction_id = ${f.id}  (${f.name})`).join('\n') || '  (no factions exist yet: create them first)'}
If a card names a faction that is not in this list, do not guess: leave that card out and say which faction is missing after the JSON.

Example:
${JSON.stringify(exampleImport(factions[0]?.id ?? 1), null, 2)}

Cards to convert:
`
}
