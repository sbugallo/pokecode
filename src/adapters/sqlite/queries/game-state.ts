import type { Database } from "bun:sqlite"
import { type GameState, gameStateSchema } from "../../../application/contracts/game.js"
import { locationsForRegion, regions } from "../../../domain/content/catalog.js"
import { speciesIdSchema } from "../../../domain/shared/identifiers.js"
import { type PokemonRow, pokemonFromRow } from "../pokemon-mapper.js"

type PartyRow = PokemonRow & { readonly position: number }

type PendingEncounterRow = {
  readonly id: string
  readonly kind: "ordinary" | "special"
  readonly speciesId: string
  readonly name: string
  readonly level: number
  readonly gender: "male" | "female" | "genderless"
  readonly shiny: number
  readonly spriteUrl: string
  readonly ability: string
}

export function createSqliteGameStateQuery(
  database: Database,
): (locationUnlockThreshold: number) => GameState {
  return (locationUnlockThreshold) => {
    const trainer = database
      .query<{ readonly id: string; readonly regionId: string; readonly locationId: string }, []>(
        "SELECT id, current_region_id AS regionId, current_location_id AS locationId FROM trainers LIMIT 1",
      )
      .get()
    if (trainer === null) {
      return gameStateSchema.parse({
        phase: "onboarding",
        message: "Choose a starter from any supported main-game region.",
        region: null,
        location: null,
        party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
        pendingChoices: [],
        exploration: null,
      })
    }

    const partyRows = database
      .query<PartyRow, [string]>(
        `SELECT
          party_slots.position,
          owned_pokemon.id,
          owned_pokemon.species_id AS speciesId,
          owned_pokemon.name,
          owned_pokemon.gender,
          owned_pokemon.level,
          owned_pokemon.experience,
          owned_pokemon.ability,
          owned_pokemon.nature,
          owned_pokemon.shiny,
          owned_pokemon.hp_iv AS hpIv,
          owned_pokemon.attack_iv AS attackIv,
          owned_pokemon.defense_iv AS defenseIv,
          owned_pokemon.special_attack_iv AS specialAttackIv,
          owned_pokemon.special_defense_iv AS specialDefenseIv,
          owned_pokemon.speed_iv AS speedIv
        FROM party_slots
        JOIN owned_pokemon ON owned_pokemon.id = party_slots.pokemon_id
        WHERE party_slots.trainer_id = ?1`,
      )
      .all(trainer.id)
    const pokemonByPosition = new Map(
      partyRows.map((row) => {
        const moves = database
          .query<
            { readonly id: string; readonly name: string; readonly position: number },
            [string]
          >(
            "SELECT move_id AS id, move_name AS name, position FROM pokemon_moves WHERE pokemon_id = ?1 ORDER BY position",
          )
          .all(row.id)
        return [row.position, pokemonFromRow(row, moves)] as const
      }),
    )
    const pendingChoices = database
      .query<{ readonly id: string; readonly kind: string; readonly payload: string }, [string]>(
        `SELECT id, kind, payload FROM pending_choices
         WHERE trainer_id = ?1
         ORDER BY
           CASE kind WHEN 'starter' THEN 0 WHEN 'move' THEN 1 WHEN 'evolution' THEN 2 WHEN 'catch' THEN 3 WHEN 'region' THEN 4 ELSE 5 END,
            COALESCE((
              SELECT party_slots.position
              FROM party_slots
              WHERE party_slots.trainer_id = pending_choices.trainer_id
                AND party_slots.pokemon_id = CASE
                  WHEN json_valid(pending_choices.payload)
                  THEN json_extract(pending_choices.payload, '$.pokemonId')
                END
            ), 7),
            created_at,
            insertion_order,
            rowid`,
      )
      .all(trainer.id)
    const encounterRow = database
      .query<PendingEncounterRow, [string]>(
        `SELECT id, kind, species_id AS speciesId, name, level, gender, shiny,
          sprite_url AS spriteUrl, ability FROM pending_encounters
         WHERE trainer_id = ?1 ORDER BY created_at, insertion_order, rowid LIMIT 1`,
      )
      .get(trainer.id)
    const pendingEncounterCount =
      database
        .query<{ readonly count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM pending_encounters WHERE trainer_id = ?1",
        )
        .get(trainer.id)?.count ?? 0
    const pendingEncounter =
      encounterRow === null
        ? null
        : {
            id: encounterRow.id,
            kind: encounterRow.kind,
            speciesId: speciesIdSchema.parse(encounterRow.speciesId),
            name: encounterRow.name,
            level: encounterRow.level,
            gender: encounterRow.gender,
            shiny: encounterRow.shiny === 1,
            spriteUrl: encounterRow.spriteUrl,
            caught:
              database
                .query<{ readonly caught: number }, [string, string]>(
                  "SELECT caught FROM pokedex_entries WHERE trainer_id = ?1 AND species_id = ?2",
                )
                .get(trainer.id, encounterRow.speciesId)?.caught === 1,
          }
    const choicePokemonRows = database
      .query<PokemonRow, [string]>(
        `SELECT owned_pokemon.id, owned_pokemon.species_id AS speciesId, owned_pokemon.name,
          owned_pokemon.gender, owned_pokemon.level, owned_pokemon.experience, owned_pokemon.ability,
          owned_pokemon.nature, owned_pokemon.shiny, owned_pokemon.hp_iv AS hpIv,
          owned_pokemon.attack_iv AS attackIv, owned_pokemon.defense_iv AS defenseIv,
          owned_pokemon.special_attack_iv AS specialAttackIv,
          owned_pokemon.special_defense_iv AS specialDefenseIv, owned_pokemon.speed_iv AS speedIv,
          MIN(pending_choices.insertion_order) AS firstChoiceOrder
         FROM pending_choices
         JOIN owned_pokemon ON owned_pokemon.trainer_id = pending_choices.trainer_id
           AND owned_pokemon.id = CASE
             WHEN json_valid(pending_choices.payload)
             THEN json_extract(pending_choices.payload, '$.pokemonId')
           END
         WHERE pending_choices.trainer_id = ?1 AND pending_choices.kind IN ('move', 'evolution')
         GROUP BY owned_pokemon.id
         ORDER BY firstChoiceOrder, owned_pokemon.id`,
      )
      .all(trainer.id)
    const choicePokemon = choicePokemonRows.map((row) => {
      const moves = database
        .query<{ readonly id: string; readonly name: string; readonly position: number }, [string]>(
          "SELECT move_id AS id, move_name AS name, position FROM pokemon_moves WHERE pokemon_id = ?1 ORDER BY position",
        )
        .all(row.id)
      return pokemonFromRow(row, moves)
    })
    const unlockedLocationIds = new Set(
      database
        .query<{ readonly locationId: string }, [string]>(
          "SELECT location_id AS locationId FROM location_progress WHERE trainer_id = ?1 AND unlocked = 1",
        )
        .all(trainer.id)
        .map((location) => location.locationId),
    )
    const progress = database
      .query<{ readonly tokenCount: number }, [string]>(
        "SELECT token_count AS tokenCount FROM location_unlock_progress WHERE trainer_id = ?1",
      )
      .get(trainer.id)
    const regionProgress = database
      .query<{ readonly regionId: string; readonly completed: number }, [string]>(
        "SELECT region_id AS regionId, completed FROM region_progress WHERE trainer_id = ?1",
      )
      .all(trainer.id)
    const progressByRegion = new Map(regionProgress.map((region) => [region.regionId, region]))
    return gameStateSchema.parse({
      phase: "active",
      message: `Your ${trainer.regionId} adventure begins at ${trainer.locationId}.`,
      region: trainer.regionId,
      location: trainer.locationId,
      party: [1, 2, 3, 4, 5, 6].map((position) => ({
        position,
        pokemon: pokemonByPosition.get(position) ?? null,
      })),
      pendingChoices,
      pendingEncounterCount,
      choicePokemon,
      pendingEncounter,
      exploration: {
        regions: regions().map((region) => ({
          ...region,
          visited: progressByRegion.has(region.id),
          completed: progressByRegion.get(region.id)?.completed === 1,
          locations: progressByRegion.has(region.id)
            ? locationsForRegion(region.id).map((location) => ({
                id: location.id,
                name: location.name,
                unlocked: unlockedLocationIds.has(location.id),
                encounterless: location.encounterless,
              }))
            : [],
        })),
        locations: locationsForRegion(trainer.regionId).map((location) => ({
          id: location.id,
          name: location.name,
          unlocked: unlockedLocationIds.has(location.id),
          encounterless: location.encounterless,
        })),
        locationUnlockProgress: progress?.tokenCount ?? 0,
        locationUnlockThreshold,
        regionComplete: progressByRegion.get(trainer.regionId)?.completed === 1,
      },
    })
  }
}
