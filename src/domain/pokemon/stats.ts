import { pokemonCatalog } from "../content/catalogs/pokemon-catalog.js"
import { regionalFormsCatalog } from "../content/catalogs/regional-forms-catalog.js"
import type { PokemonInstance } from "./model.js"
import { pokemonNatureModifiers } from "./nature.js"
import type { Ivs } from "./types.js"

export type PokemonStats = Readonly<Ivs>
type BaseStats = readonly [number, number, number, number, number, number]

type NatureStat = Exclude<keyof PokemonStats, "hp">

const baseStatsBySpecies = new Map(
  [...pokemonCatalog, ...regionalFormsCatalog].map((pokemon) => [
    pokemon.id,
    asBaseStats(pokemon.id, pokemon.baseStats),
  ]),
)

function asBaseStats(speciesId: string, values: readonly number[]): BaseStats {
  if (values.length !== 6 || values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new RangeError(`Invalid base stats for Pokemon: ${speciesId}`)
  }
  return values as unknown as BaseStats
}

/** Uses canonical species ID and persisted English nature, never localized display names. */
export function pokemonStats(pokemon: PokemonInstance): PokemonStats {
  const base = baseStatsBySpecies.get(pokemon.speciesId)
  const nature = pokemonNatureModifiers(pokemon.nature)
  if (base === undefined) throw new RangeError(`Unknown Pokemon species: ${pokemon.speciesId}`)

  const scaled = (stat: keyof PokemonStats, value: number): number =>
    Math.floor(
      ((2 * value + pokemon.ivs[stat] + Math.floor(pokemon.evs[stat] / 4)) * pokemon.level) / 100,
    )
  const nonHp = (stat: NatureStat, value: number): number => {
    const percent = stat === nature.increased ? 110 : stat === nature.decreased ? 90 : 100
    // Integer percentages avoid floating-point rounding at exact stat boundaries.
    return Math.floor(((scaled(stat, value) + 5) * percent) / 100)
  }

  return {
    hp: pokemon.speciesId === "shedinja" ? 1 : scaled("hp", base[0]) + pokemon.level + 10,
    attack: nonHp("attack", base[1]),
    defense: nonHp("defense", base[2]),
    specialAttack: nonHp("specialAttack", base[3]),
    specialDefense: nonHp("specialDefense", base[4]),
    speed: nonHp("speed", base[5]),
  }
}
