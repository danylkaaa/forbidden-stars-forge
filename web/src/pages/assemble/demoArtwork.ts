import { useState } from 'react'
import spaceMarines from '../../images/demo/sm.jpg?url'
import tyranids from '../../images/demo/tyranids.jpg?url'
import sisters from '../../images/demo/sisters.jpg?url'
import necrons from '../../images/demo/necrons.jpg?url'

export const DEMO_ARTWORK = [spaceMarines, tyranids, sisters, necrons] as const

// Pick once per preview so editing text or layout doesn't shuffle the art.
export function useDemoArtwork() {
  const [url] = useState(() => DEMO_ARTWORK[Math.floor(Math.random() * DEMO_ARTWORK.length)])
  return url
}
