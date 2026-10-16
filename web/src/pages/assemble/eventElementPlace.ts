// Where the element sits on an event card when it is not moved: centred, on the strip between the
// tactic/scheme banner and the text panel (shares of the card).
export const EVENT_ELEMENT_HOME = { x: 0.5, y: 0.615 }
// An element ready to draw: its picture, its offset from home (shares of the card) and its width (a share of the card).
export type EventElementInput = { url: string; x: number; y: number; scale: number }
