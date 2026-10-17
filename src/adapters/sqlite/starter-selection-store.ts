import type { Database } from "bun:sqlite"
import type {
  StarterCreationCommand,
  StarterGameState,
  StarterIdGenerator,
  StarterSelectionStore,
} from "../../application/ports/starter-selection-store.js"
import { pokemonIdSchema, trainerIdSchema } from "../../domain/shared/identifiers.js"

export function createSqliteStarterSelectionStore<TState extends StarterGameState>(
  database: Database,
  readState: () => TState,
): StarterSelectionStore<TState> {
  const createStarterAtomically = (
    selection: StarterCreationCommand,
    createIds: StarterIdGenerator,
  ): boolean => {
    const select = database.transaction(() => {
      const existing = database
        .query<{ readonly id: string }, []>("SELECT id FROM trainers LIMIT 1")
        .get()
      if (existing !== null) return false
      const ids = createIds()
      const trainerId = trainerIdSchema.parse(ids.trainerId)
      const pokemonId = pokemonIdSchema.parse(ids.pokemonId)
      database
        .query<void, [string, string, string, string]>(
          "INSERT INTO trainers (id, current_region_id, current_location_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .run(trainerId, selection.regionId, selection.locationId, selection.selectedAt)
      database
        .query<void, [string, string]>(
          "INSERT INTO region_progress (trainer_id, region_id) VALUES (?1, ?2)",
        )
        .run(trainerId, selection.regionId)
      database
        .query<void, [string, string]>(
          "INSERT INTO location_progress (trainer_id, location_id) VALUES (?1, ?2)",
        )
        .run(trainerId, selection.locationId)
      database
        .query<void, [string]>(
          "INSERT INTO location_unlock_progress (trainer_id, token_count) VALUES (?1, 0)",
        )
        .run(trainerId)
      database
        .query<
          void,
          [
            string,
            string,
            string,
            string,
            number,
            number,
            string,
            string,
            string,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
          ]
        >(
          `INSERT INTO owned_pokemon (
            id, trainer_id, species_id, name, level, experience, ability, nature, gender, shiny,
            hp_iv, attack_iv, defense_iv, special_attack_iv, special_defense_iv, speed_iv,
            hp_ev, attack_ev, defense_ev, special_attack_ev, special_defense_ev, speed_ev
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
            ?17, ?18, ?19, ?20, ?21, ?22)`,
        )
        .run(
          pokemonId,
          trainerId,
          selection.speciesId,
          selection.name,
          selection.level,
          selection.experience,
          selection.ability,
          selection.nature,
          selection.gender,
          Number(selection.shiny),
          selection.ivs.hp,
          selection.ivs.attack,
          selection.ivs.defense,
          selection.ivs.specialAttack,
          selection.ivs.specialDefense,
          selection.ivs.speed,
          selection.evs.hp,
          selection.evs.attack,
          selection.evs.defense,
          selection.evs.specialAttack,
          selection.evs.specialDefense,
          selection.evs.speed,
        )
      database
        .query<void, [string, number, string]>(
          "INSERT INTO party_slots (trainer_id, position, pokemon_id) VALUES (?1, ?2, ?3)",
        )
        .run(trainerId, 1, pokemonId)
      database
        .query<void, [string, string]>(
          "INSERT INTO pokedex_entries (trainer_id, species_id, seen, caught) VALUES (?1, ?2, 1, 1)",
        )
        .run(trainerId, selection.speciesId)
      for (const position of [2, 3, 4, 5, 6]) {
        database
          .query<void, [string, number]>(
            "INSERT INTO party_slots (trainer_id, position, pokemon_id) VALUES (?1, ?2, NULL)",
          )
          .run(trainerId, position)
      }
      for (const [index, move] of selection.moves.entries()) {
        database
          .query<void, [string, number, string, string]>(
            "INSERT INTO pokemon_moves (pokemon_id, position, move_id, move_name) VALUES (?1, ?2, ?3, ?4)",
          )
          .run(pokemonId, index + 1, move.id, move.name)
      }
      return true
    })
    return select.immediate()
  }

  return { readState, createStarterAtomically }
}
