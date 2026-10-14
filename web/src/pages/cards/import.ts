import type { CardInput } from './model'
export function exampleImport(factionId: number): { cards: CardInput[] } {
  return { cards: [
    { faction_id: factionId, name: 'Огневое превосходство', category: 'combat', starting: true, level: 0, resource_cost: 0, shields: 1, guns: 2, eagles: 0, upper_text: 'Верхний эффект', lower_text: '' },
    { faction_id: factionId, name: 'Перегруппировка', category: 'schema', subtype: 'tactic', action: 'move_horizontal', text: 'Переместите в своём поле.' },
    { faction_id: factionId, name: 'Подкрепление', category: 'upgrade', upgrade_type: 'deploy', level: 1, resource_cost: 2, text: 'Текст улучшения' },
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
