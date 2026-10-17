import type { Database } from "bun:sqlite"
import type {
  CommandTransactionStores,
  PendingEncounterSnapshot,
  UsageTransactionStores,
} from "../../../application/ports/game-transaction.js"
import { nextQueueOrder } from "./queue-order.js"

export function createEncounterTransactionStore(database: Database): {
  readonly usage: UsageTransactionStores["encounters"]
  readonly commands: CommandTransactionStores["encounters"]
} {
  return {
    usage: {
      hasPending: (trainerId) =>
        database
          .query<{ readonly id: string }, [string]>(
            "SELECT id FROM pending_encounters WHERE trainer_id = ?1",
          )
          .get(trainerId) !== null,
      progress: (trainerId) =>
        database
          .query<{ readonly tokenCount: number; readonly threshold: number }, [string]>(
            "SELECT token_count AS tokenCount, threshold FROM encounter_progress WHERE trainer_id = ?1",
          )
          .get(trainerId) ?? null,
      saveProgress: (trainerId, tokenCount, threshold) => {
        database
          .query<void, [string, number, number]>(
            `INSERT INTO encounter_progress (trainer_id, token_count, threshold)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(trainer_id) DO UPDATE SET token_count = excluded.token_count, threshold = excluded.threshold`,
          )
          .run(trainerId, tokenCount, threshold)
      },
      maximumPartyLevel: (trainerId) =>
        database
          .query<{ readonly level: number }, [string]>(
            `SELECT COALESCE(MAX(owned_pokemon.level), 1) AS level
            FROM party_slots
            JOIN owned_pokemon ON owned_pokemon.id = party_slots.pokemon_id
            WHERE party_slots.trainer_id = ?1`,
          )
          .get(trainerId)?.level ?? 1,
      triggeredSpecialIds: (trainerId) =>
        new Set(
          database
            .query<{ readonly specialEncounterId: string }, [string]>(
              "SELECT special_encounter_id AS specialEncounterId FROM triggered_special_encounters WHERE trainer_id = ?1",
            )
            .all(trainerId)
            .map((row) => row.specialEncounterId),
        ),
      markSpecialTriggered: (trainerId, specialEncounterId, triggeredAt) => {
        database
          .query<void, [string, string, string]>(
            `INSERT INTO triggered_special_encounters (trainer_id, special_encounter_id, triggered_at)
            VALUES (?1, ?2, ?3)`,
          )
          .run(trainerId, specialEncounterId, triggeredAt)
      },
      insertPending: (encounter) => {
        const insertionOrder = nextQueueOrder(database, encounter.trainerId, "encounter")
        database
          .query<
            void,
            [
              string,
              string,
              string,
              string,
              string,
              string | null,
              number,
              string,
              number,
              string,
              string,
              string,
              number,
            ]
          >(
            `INSERT INTO pending_encounters (
              id, trainer_id, kind, species_id, name, special_encounter_id, level, gender, shiny, sprite_url, ability, created_at, insertion_order
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
          )
          .run(
            encounter.id,
            encounter.trainerId,
            encounter.kind,
            encounter.speciesId,
            encounter.name,
            encounter.specialEncounterId,
            encounter.level,
            encounter.gender,
            Number(encounter.shiny),
            encounter.spriteUrl,
            encounter.ability,
            encounter.createdAt,
            insertionOrder,
          )
      },
    },
    commands: {
      pending: (trainerId, encounterId) => {
        const row = database
          .query<
            Omit<PendingEncounterSnapshot, "shiny"> & { readonly shiny: number },
            [string, string]
          >(
            `SELECT id, kind, species_id AS speciesId, name, level, gender, shiny,
              sprite_url AS spriteUrl, ability FROM pending_encounters WHERE trainer_id = ?1 AND id = ?2`,
          )
          .get(trainerId, encounterId)
        return row === null ? null : { ...row, shiny: row.shiny === 1 }
      },
      clearPending: (trainerId, encounterId) => {
        database
          .query<void, [string, string]>(
            "DELETE FROM pending_encounters WHERE trainer_id = ?1 AND id = ?2",
          )
          .run(trainerId, encounterId)
      },
    },
  }
}
