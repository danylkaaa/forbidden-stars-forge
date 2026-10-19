import bastion from '../../images/base/bastion.png?url'
import city from '../../images/base/city.png?url'
import factory from '../../images/base/factory.png?url'
import forge from '../../images/base/forge.png?url'
import gear from '../../images/base/gear.png?url'
import health from '../../images/base/health.png?url'
import morale from '../../images/base/morale.png?url'
import forgeToken from '../../images/base/forge token.png?url'
import reinforce from '../../images/base/reinforce.png?url'
import power from '../../images/base/power.png?url'
import level from '../../images/base/level.png?url'
import torch from '../../images/base/CL-torch.png?url'
import banner from '../../images/base/CL-banner.png?url'
import light from '../../images/base/light.png?url'
import texture from '../../images/base/texture.png?url'
import ring from '../../images/base/unit-border.png?url'

// Icons shipped with the app. A shared icon uploaded in the editor replaces
// one.
export const BUNDLED_ICONS: Record<string, string> = { bastion, city, factory, forge, gear, health, morale, reinforce, 'forge-token': forgeToken, dice: power, tech: level }

// Artwork of the card's designed elements (torches, light bars, level banners, circle rings and the paper texture).
export const DESIGN_ASSETS = { torch, banner, light, texture, ring } as const
