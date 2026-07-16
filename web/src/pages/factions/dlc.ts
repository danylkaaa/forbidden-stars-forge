export const DLC_VALUES = ['Galaxy in Flames', 'Symphony of War', 'Darkest Dawn'] as const
export type DLC = (typeof DLC_VALUES)[number]
