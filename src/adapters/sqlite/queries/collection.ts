import type { Database } from "bun:sqlite"
import type { PokemonCollection, PokemonDex } from "../../../application/contracts/game.js"
import { nationalDex, regionalFormIdsForSpecies } from "../../../domain/content/catalog.js"
import { speciesIdSchema } from "../../../domain/shared/identifiers.js"
import { type PokemonRow, pokemonFromRow } from "../pokemon-mapper.js"

export function createSqliteCollectionQueries(database: Database) {
  const list = (trainerId: string): PokemonCollection => ({
    pokemon: database
      .query<PokemonRow, [string]>(
        `SELECT id, species_id AS speciesId, name, gender, level, experience, ability, nature, shiny,
          hp_iv AS hpIv, attack_iv AS attackIv, defense_iv AS defenseIv,
          special_attack_iv AS specialAttackIv, special_defense_iv AS specialDefenseIv,
          speed_iv AS speedIv
        FROM owned_pokemon WHERE trainer_id = ?1 ORDER BY rowid`,
      )
      .all(trainerId)
      .map((row) => {
        const moves = database
          .query<
            { readonly id: string; readonly name: string; readonly position: number },
            [string]
          >(
            "SELECT move_id AS id, move_name AS name, position FROM pokemon_moves WHERE pokemon_id = ?1 ORDER BY position",
          )
          .all(row.id)
        return pokemonFromRow(row, moves)
      }),
  })

  const dex = (trainerId: string | null): PokemonDex => {
    const discoveries = new Map(
      trainerId === null
        ? []
        : database
            .query<{ readonly speciesId: string; readonly caught: number }, [string]>(
              "SELECT species_id AS speciesId, caught FROM pokedex_entries WHERE trainer_id = ?1",
            )
            .all(trainerId)
            .map((entry) => [entry.speciesId, entry.caught] as const),
    )
    return {
      discoveries: [...discoveries].map(([speciesId, caught]) => ({
        speciesId: speciesIdSchema.parse(speciesId),
        status: caught === 1 ? ("caught" as const) : ("seen" as const),
      })),
      pokemon: nationalDex().map((pokemon) => {
        const statusForSpeciesAndForms = [
          pokemon.speciesId,
          ...regionalFormIdsForSpecies(pokemon.speciesId),
        ].map((speciesId) => discoveries.get(speciesId))
        const caught = statusForSpeciesAndForms.includes(1)
          ? 1
          : statusForSpeciesAndForms.includes(0)
            ? 0
            : undefined
        return {
          ...pokemon,
          status:
            caught === 1
              ? ("caught" as const)
              : caught === 0
                ? ("seen" as const)
                : ("unknown" as const),
        }
      }),
    }
  }

  return { list, dex }
}

export function trainerIdForQueries(database: Database): string | null {
  return (
    database.query<{ readonly id: string }, []>("SELECT id FROM trainers LIMIT 1").get()?.id ?? null
  )
}
