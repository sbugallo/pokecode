import type { Database } from "bun:sqlite"
import type { PokemonInstance } from "../../domain/pokemon/model.js"
import type { Move } from "../../domain/pokemon/types.js"
import { pokemonGenderSchema } from "../../domain/pokemon/types.js"
import { pokemonIdSchema, speciesIdSchema } from "../../domain/shared/identifiers.js"

export type PokemonRow = {
  readonly id: string
  readonly speciesId: string
  readonly name: string
  readonly gender: string
  readonly level: number
  readonly experience: number
  readonly ability: string
  readonly nature: string
  readonly shiny: number
  readonly hpIv: number
  readonly attackIv: number
  readonly defenseIv: number
  readonly specialAttackIv: number
  readonly specialDefenseIv: number
  readonly speedIv: number
}

export function toPokemon(row: PokemonRow, database: Database): PokemonInstance {
  const moves = database
    .query<Move & { readonly position: number }, [string]>(
      "SELECT position, move_id AS id, move_name AS name FROM pokemon_moves WHERE pokemon_id = ?1 ORDER BY position",
    )
    .all(row.id)
    .map(({ id, name }) => ({ id, name }))
  return pokemonFromRow(row, moves)
}

export function pokemonFromRow(row: PokemonRow, moves: readonly Move[]): PokemonInstance {
  return {
    id: pokemonIdSchema.parse(row.id),
    speciesId: speciesIdSchema.parse(row.speciesId),
    name: row.name,
    gender: pokemonGenderSchema.parse(row.gender),
    level: row.level,
    experience: row.experience,
    ability: row.ability,
    nature: row.nature,
    shiny: row.shiny === 1,
    ivs: {
      hp: row.hpIv,
      attack: row.attackIv,
      defense: row.defenseIv,
      specialAttack: row.specialAttackIv,
      specialDefense: row.specialDefenseIv,
      speed: row.speedIv,
    },
    evs: {
      hp: 0,
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    },
    // SQL rows can include `position`; the application model exposes only Move fields.
    moves: moves.map(({ id, name }) => ({ id, name })),
  }
}
