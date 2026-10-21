import { expect, test } from "bun:test"
import { gameplayConfigSchema } from "../../../src/application/contracts/game.js"
import {
  championIndexForRegion,
  locationIndexFor,
  regions,
} from "../../../src/domain/content/catalog.js"
import { locationUnlockThreshold } from "../../../src/domain/exploration/exploration.js"
import { experienceForNextLevel } from "../../../src/domain/progression/catalog.js"
import { tokensPerExperiencePoint } from "../../../src/domain/usage/usage.js"

type Anchor = {
  readonly region: string
  readonly locationId: string
  readonly aceLevel: number
}

// Gym/Kahuna and champion ace levels from the main-story teams. Location IDs
// resolve to the catalog's actual ordered progression points, not duplicated indexes.
const anchors: readonly Anchor[] = [
  { region: "kanto", locationId: "pewter-city", aceLevel: 12 },
  { region: "kanto", locationId: "cerulean-city", aceLevel: 21 },
  { region: "kanto", locationId: "vermilion-city", aceLevel: 24 },
  { region: "kanto", locationId: "celadon-city", aceLevel: 29 },
  { region: "kanto", locationId: "fuchsia-city", aceLevel: 43 },
  { region: "kanto", locationId: "saffron-city", aceLevel: 43 },
  { region: "kanto", locationId: "cinnabar-island", aceLevel: 47 },
  { region: "kanto", locationId: "viridian-city", aceLevel: 50 },
  { region: "kanto", locationId: "indigo-plateau", aceLevel: 65 },
  { region: "johto", locationId: "violet-city", aceLevel: 13 },
  { region: "johto", locationId: "azalea-town", aceLevel: 17 },
  { region: "johto", locationId: "goldenrod-city", aceLevel: 19 },
  { region: "johto", locationId: "ecruteak-city", aceLevel: 25 },
  { region: "johto", locationId: "cianwood-city", aceLevel: 30 },
  { region: "johto", locationId: "olivine-city", aceLevel: 35 },
  { region: "johto", locationId: "mahogany-town", aceLevel: 34 },
  { region: "johto", locationId: "blackthorn-city", aceLevel: 41 },
  { region: "johto", locationId: "johto-indigo-plateau", aceLevel: 50 },
  { region: "hoenn", locationId: "rustboro-city", aceLevel: 14 },
  { region: "hoenn", locationId: "dewford-town", aceLevel: 16 },
  { region: "hoenn", locationId: "mauville-city", aceLevel: 21 },
  { region: "hoenn", locationId: "lavaridge-town", aceLevel: 28 },
  { region: "hoenn", locationId: "petalburg-city", aceLevel: 30 },
  { region: "hoenn", locationId: "fortree-city", aceLevel: 33 },
  { region: "hoenn", locationId: "mossdeep-city", aceLevel: 45 },
  { region: "hoenn", locationId: "sootopolis-city", aceLevel: 46 },
  { region: "hoenn", locationId: "ever-grande-city", aceLevel: 58 },
  { region: "sinnoh", locationId: "oreburgh-city", aceLevel: 14 },
  { region: "sinnoh", locationId: "eterna-city", aceLevel: 22 },
  { region: "sinnoh", locationId: "veilstone-city", aceLevel: 30 },
  { region: "sinnoh", locationId: "pastoria-city", aceLevel: 30 },
  { region: "sinnoh", locationId: "hearthome-city", aceLevel: 32 },
  { region: "sinnoh", locationId: "canalave-city", aceLevel: 39 },
  { region: "sinnoh", locationId: "snowpoint-city", aceLevel: 42 },
  { region: "sinnoh", locationId: "sunyshore-city", aceLevel: 49 },
  { region: "sinnoh", locationId: "victory-road", aceLevel: 66 },
  { region: "unova", locationId: "aspertia-city", aceLevel: 13 },
  { region: "unova", locationId: "virbank-city", aceLevel: 17 },
  { region: "unova", locationId: "castelia-city", aceLevel: 24 },
  { region: "unova", locationId: "nimbasa-city", aceLevel: 30 },
  { region: "unova", locationId: "driftveil-city", aceLevel: 33 },
  { region: "unova", locationId: "mistralton-city", aceLevel: 39 },
  { region: "unova", locationId: "opelucid-city", aceLevel: 48 },
  { region: "unova", locationId: "humilau-city", aceLevel: 51 },
  { region: "unova", locationId: "unova-pokemon-league", aceLevel: 59 },
  { region: "kalos", locationId: "santalune-city", aceLevel: 12 },
  { region: "kalos", locationId: "cyllage-city", aceLevel: 25 },
  { region: "kalos", locationId: "shalour-city", aceLevel: 32 },
  { region: "kalos", locationId: "coumarine-city", aceLevel: 34 },
  { region: "kalos", locationId: "lumiose-city", aceLevel: 37 },
  { region: "kalos", locationId: "laverre-city", aceLevel: 42 },
  { region: "kalos", locationId: "anistar-city", aceLevel: 48 },
  { region: "kalos", locationId: "snowbelle-city", aceLevel: 59 },
  { region: "kalos", locationId: "kalos-pokemon-league", aceLevel: 68 },
  { region: "alola", locationId: "iki-town", aceLevel: 15 },
  { region: "alola", locationId: "konikoni-city", aceLevel: 27 },
  { region: "alola", locationId: "malie-city", aceLevel: 39 },
  { region: "alola", locationId: "seafolk-village", aceLevel: 54 },
  { region: "alola", locationId: "alola-pokemon-league", aceLevel: 60 },
  { region: "galar", locationId: "turffield", aceLevel: 20 },
  { region: "galar", locationId: "hulbury", aceLevel: 24 },
  { region: "galar", locationId: "motostoke", aceLevel: 27 },
  { region: "galar", locationId: "stow-on-side", aceLevel: 36 },
  { region: "galar", locationId: "ballonlea", aceLevel: 36 },
  { region: "galar", locationId: "circhester", aceLevel: 42 },
  { region: "galar", locationId: "spikemuth", aceLevel: 46 },
  { region: "galar", locationId: "hammerlocke", aceLevel: 48 },
  { region: "galar", locationId: "energy-plant", aceLevel: 65 },
  { region: "paldea", locationId: "cortondo", aceLevel: 15 },
  { region: "paldea", locationId: "artazon", aceLevel: 17 },
  { region: "paldea", locationId: "levincia", aceLevel: 24 },
  { region: "paldea", locationId: "cascarrafa", aceLevel: 30 },
  { region: "paldea", locationId: "medali", aceLevel: 36 },
  { region: "paldea", locationId: "montenevera", aceLevel: 42 },
  { region: "paldea", locationId: "alfornada", aceLevel: 45 },
  { region: "paldea", locationId: "glaseado-mountain", aceLevel: 48 },
  { region: "paldea", locationId: "paldea-pokemon-league", aceLevel: 62 },
]

test("the default unlock curve tracks all 77 regional ace-level anchors", () => {
  const config = gameplayConfigSchema.parse({})
  const absoluteDeltas: number[] = []

  expect(anchors).toHaveLength(77)
  for (const region of regions()) {
    const championIndex = championIndexForRegion(region.id)
    if (championIndex === null) throw new Error(`Missing champion index for ${region.id}`)
    const regionAnchors = anchors.filter((anchor) => anchor.region === region.id)
    expect(
      regionAnchors.some(
        (anchor) => locationIndexFor(region.id, anchor.locationId) === championIndex,
      ),
    ).toBe(true)

    let lastIndex = 0
    let level = 5
    let experience = 0
    for (const anchor of regionAnchors) {
      const catalogIndex = locationIndexFor(region.id, anchor.locationId)
      if (catalogIndex === null) throw new Error(`Unknown anchor location ${anchor.locationId}`)
      const effectiveIndex = Math.max(lastIndex, catalogIndex)
      while (lastIndex < effectiveIndex) {
        const threshold = locationUnlockThreshold({
          index: lastIndex,
          championIndex,
          curve: {
            baseTokens: config.locationUnlockBaseTokens,
            exponent: config.locationUnlockExponent,
            regionExponent: config.locationUnlockRegionExponent,
          },
        })
        experience += threshold / tokensPerExperiencePoint
        while (level < 100) {
          const cost = experienceForNextLevel("medium-slow", level)
          if (experience < cost) break
          experience -= cost
          level += 1
        }
        lastIndex += 1
      }
      absoluteDeltas.push(Math.abs(level - anchor.aceLevel))
    }
  }

  const meanAbsoluteDelta =
    absoluteDeltas.reduce((sum, delta) => sum + delta, 0) / absoluteDeltas.length
  expect(meanAbsoluteDelta).toBeLessThanOrEqual(4)
  expect(Math.max(...absoluteDeltas)).toBeLessThanOrEqual(16)
})
