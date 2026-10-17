import type { Database } from "bun:sqlite"
import type {
  CommandTransactionStores,
  PartyProgressPokemon,
  UsageTransactionStores,
} from "../../../application/ports/game-transaction.js"
import { localizedPokemonName } from "../../../domain/content/catalog.js"

export function createPokemonTransactionStore(database: Database): {
  readonly usage: UsageTransactionStores["pokemon"]
  readonly commands: CommandTransactionStores["pokemon"]
} {
  return {
    usage: {
      addPartyExperience: (trainerId, amount) => {
        database
          .query<void, [number, string]>(
            `UPDATE owned_pokemon
            SET experience = experience + ?1
            WHERE level < 100
              AND id IN (
                SELECT pokemon_id
                FROM party_slots
                WHERE trainer_id = ?2 AND pokemon_id IS NOT NULL
              )`,
          )
          .run(amount, trainerId)
      },
      party: (trainerId) =>
        database
          .query<PartyProgressPokemon, [string]>(
            `SELECT owned_pokemon.id, owned_pokemon.species_id AS speciesId, owned_pokemon.gender, owned_pokemon.level, owned_pokemon.experience
            FROM party_slots
            JOIN owned_pokemon ON owned_pokemon.id = party_slots.pokemon_id
            WHERE party_slots.trainer_id = ?1
            ORDER BY party_slots.position`,
          )
          .all(trainerId),
      offPartyWithExperience: (trainerId) =>
        database
          .query<PartyProgressPokemon, [string]>(
            `SELECT id, species_id AS speciesId, gender, level, experience
             FROM owned_pokemon
             WHERE trainer_id = ?1 AND experience > 0 AND level < 100
               AND NOT EXISTS (
                 SELECT 1 FROM party_slots
                 WHERE party_slots.trainer_id = ?1
                   AND party_slots.pokemon_id = owned_pokemon.id
               )
             ORDER BY id`,
          )
          .all(trainerId),
      findOwned: (trainerId, pokemonId) =>
        database
          .query<PartyProgressPokemon, [string, string]>(
            `SELECT id, species_id AS speciesId, gender, level, experience
             FROM owned_pokemon WHERE trainer_id = ?1 AND id = ?2`,
          )
          .get(trainerId, pokemonId) ?? null,
      setLevel: (pokemonId, level, experience) => {
        database
          .query<void, [number, number, string]>(
            "UPDATE owned_pokemon SET level = ?1, experience = ?2 WHERE id = ?3",
          )
          .run(level, experience, pokemonId)
      },
      evolve: (pokemonId, speciesId, name) => {
        const previous = database
          .query<{ speciesId: string }, [string]>(
            "SELECT species_id AS speciesId FROM owned_pokemon WHERE id = ?1",
          )
          .get(pokemonId)
        const previousName =
          previous === null
            ? ""
            : localizedPokemonName(previous.speciesId, "en", previous.speciesId)
        database
          .query<void, [string, string, string, string]>(
            "UPDATE owned_pokemon SET species_id = ?1, name = CASE WHEN name = ?4 THEN ?2 ELSE name END WHERE id = ?3",
          )
          .run(speciesId, name, pokemonId, previousName)
      },
      moves: (pokemonId) =>
        database
          .query<
            { readonly position: number; readonly id: string; readonly name: string },
            [string]
          >(
            "SELECT position, move_id AS id, move_name AS name FROM pokemon_moves WHERE pokemon_id = ?1 ORDER BY position",
          )
          .all(pokemonId),
      learnMove: (pokemonId, position, move) => {
        database
          .query<void, [string, number, string, string]>(
            "INSERT INTO pokemon_moves (pokemon_id, position, move_id, move_name) VALUES (?1, ?2, ?3, ?4)",
          )
          .run(pokemonId, position, move.id, move.name)
      },
      markSeen: (trainerId, speciesId) => {
        database
          .query<void, [string, string]>(
            `INSERT INTO pokedex_entries (trainer_id, species_id, seen, caught)
            VALUES (?1, ?2, 1, 0)
            ON CONFLICT(trainer_id, species_id) DO UPDATE SET seen = 1`,
          )
          .run(trainerId, speciesId)
      },
    },
    commands: {
      rename: (trainerId, pokemonId, name) => {
        database
          .query<void, [string, string, string]>(
            "UPDATE owned_pokemon SET name = ?3 WHERE trainer_id = ?1 AND id = ?2",
          )
          .run(trainerId, pokemonId, name)
      },
      release: (trainerId, pokemonId) => {
        database
          .query<void, [string, string]>(
            "DELETE FROM pending_choices WHERE trainer_id = ?1 AND kind IN ('move', 'evolution') AND json_extract(payload, '$.pokemonId') = ?2",
          )
          .run(trainerId, pokemonId)
        database
          .query<void, [string, string]>(
            "UPDATE party_slots SET pokemon_id = NULL WHERE trainer_id = ?1 AND pokemon_id = ?2",
          )
          .run(trainerId, pokemonId)
        database
          .query<void, [string]>("DELETE FROM pokemon_moves WHERE pokemon_id = ?1")
          .run(pokemonId)
        database
          .query<void, [string, string]>(
            "DELETE FROM owned_pokemon WHERE trainer_id = ?1 AND id = ?2",
          )
          .run(trainerId, pokemonId)
      },
      insertStarter: ({ id, trainerId, starter }) => {
        database
          .query<
            void,
            [string, string, string, string, number, string, string, string, number, ...number[]]
          >(
            `INSERT INTO owned_pokemon (
              id, trainer_id, species_id, name, level, ability, nature, gender, shiny,
              hp_iv, attack_iv, defense_iv, special_attack_iv, special_defense_iv, speed_iv
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
          )
          .run(
            id,
            trainerId,
            starter.speciesId,
            starter.name,
            starter.level,
            starter.ability,
            starter.nature,
            starter.gender,
            Number(starter.shiny),
            starter.ivs.hp,
            starter.ivs.attack,
            starter.ivs.defense,
            starter.ivs.specialAttack,
            starter.ivs.specialDefense,
            starter.ivs.speed,
          )
        for (const [index, move] of starter.moves.entries()) {
          database
            .query<void, [string, number, string, string]>(
              "INSERT INTO pokemon_moves (pokemon_id, position, move_id, move_name) VALUES (?1, ?2, ?3, ?4)",
            )
            .run(id, index + 1, move.id, move.name)
        }
      },
      ownedCount: (trainerId, pokemonIds) => {
        if (pokemonIds.length === 0) return 0
        return (
          database
            .query<{ readonly count: number }, [string, ...string[]]>(
              `SELECT COUNT(*) AS count FROM owned_pokemon WHERE trainer_id = ?1 AND id IN (${pokemonIds.map((_, index) => `?${index + 2}`).join(", ")})`,
            )
            .get(trainerId, ...pokemonIds)?.count ?? 0
        )
      },
      replaceParty: (trainerId, pokemonIds) => {
        database
          .query<void, [string]>("UPDATE party_slots SET pokemon_id = NULL WHERE trainer_id = ?1")
          .run(trainerId)
        for (const [index, pokemonId] of pokemonIds.entries()) {
          database
            .query<void, [string, string, number]>(
              "UPDATE party_slots SET pokemon_id = ?1 WHERE trainer_id = ?2 AND position = ?3",
            )
            .run(pokemonId, trainerId, index + 1)
        }
      },
      insertCaptured: ({ id, trainerId, encounter, nature, ivs, moves }) => {
        database
          .query<
            void,
            [string, string, string, string, number, string, string, string, number, ...number[]]
          >(
            `INSERT INTO owned_pokemon (
              id, trainer_id, species_id, name, level, ability, nature, gender, shiny,
              hp_iv, attack_iv, defense_iv, special_attack_iv, special_defense_iv, speed_iv
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
          )
          .run(
            id,
            trainerId,
            encounter.speciesId,
            encounter.name,
            encounter.level,
            encounter.ability,
            nature,
            encounter.gender,
            Number(encounter.shiny),
            ...ivs,
          )
        for (const [index, move] of moves.entries()) {
          database
            .query<void, [string, number, string, string]>(
              "INSERT INTO pokemon_moves (pokemon_id, position, move_id, move_name) VALUES (?1, ?2, ?3, ?4)",
            )
            .run(id, index + 1, move.id, move.name)
        }
      },
      markCaught: (trainerId, speciesId) => {
        database
          .query<void, [string, string]>(
            `INSERT INTO pokedex_entries (trainer_id, species_id, seen, caught)
               VALUES (?1, ?2, 1, 1)
               ON CONFLICT(trainer_id, species_id) DO UPDATE SET seen = 1, caught = 1`,
          )
          .run(trainerId, speciesId)
      },
      firstEmptyPartyPosition: (trainerId) =>
        database
          .query<{ readonly position: number }, [string]>(
            "SELECT position FROM party_slots WHERE trainer_id = ?1 AND pokemon_id IS NULL ORDER BY position LIMIT 1",
          )
          .get(trainerId)?.position ?? null,
      assignPartyPosition: (trainerId, pokemonId, position) => {
        database
          .query<void, [string, string, number]>(
            "UPDATE party_slots SET pokemon_id = ?1 WHERE trainer_id = ?2 AND position = ?3",
          )
          .run(pokemonId, trainerId, position)
      },
      replaceMove: (pokemonId, position, move) => {
        database
          .query<void, [string, string, string, number]>(
            "UPDATE pokemon_moves SET move_id = ?1, move_name = ?2 WHERE pokemon_id = ?3 AND position = ?4",
          )
          .run(move.id, move.name, pokemonId, position)
      },
      level: (pokemonId) =>
        database
          .query<{ readonly level: number }, [string]>(
            "SELECT level FROM owned_pokemon WHERE id = ?1",
          )
          .get(pokemonId)?.level ?? null,
    },
  }
}
