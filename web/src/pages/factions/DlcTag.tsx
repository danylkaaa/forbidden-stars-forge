import { Tag } from '../../components/Tag'
import type { DLC } from './dlc'

const variantByDlc = {
  'Galaxy in Flames': 'solid-accent',
  'Symphony of War': 'outline-accent',
  'Darkest Dawn': 'neutral',
} as const

export function DlcTag({ dlc }: { dlc: DLC }) {
  return <Tag variant={variantByDlc[dlc]}>{dlc}</Tag>
}
