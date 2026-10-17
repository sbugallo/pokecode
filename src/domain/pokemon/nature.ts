import { naturesCatalog } from "../content/catalogs/natures-catalog.js"
import type { Ivs } from "./types.js"

type NatureStat = Exclude<keyof Ivs, "hp">
type NatureModifiers = {
  readonly increased: NatureStat | null
  readonly decreased: NatureStat | null
}

const statNames = {
  attack: "attack",
  defense: "defense",
  "special-attack": "specialAttack",
  "special-defense": "specialDefense",
  speed: "speed",
} as const satisfies Record<string, NatureStat>

const modifiersByNature = new Map<string, NatureModifiers>(
  naturesCatalog.map((nature) => [
    nature.localization.en,
    {
      increased: nature.statIncreased === null ? null : statNames[nature.statIncreased],
      decreased: nature.statDecreased === null ? null : statNames[nature.statDecreased],
    },
  ]),
)

/** Resolves the persisted English nature, independently of the display language. */
export function pokemonNatureModifiers(nature: string): NatureModifiers {
  const modifiers = modifiersByNature.get(nature)
  if (modifiers === undefined) throw new RangeError(`Unknown canonical Pokemon nature: ${nature}`)
  return modifiers
}
