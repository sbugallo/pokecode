import type { Database } from "bun:sqlite"
import type {
  CommandTransactionStores,
  UsageTransactionStores,
} from "../../../application/ports/game-transaction.js"
import { decodeChoicePayload, encodeChoicePayload } from "../../../domain/choices/choices.js"
import { nextQueueOrder } from "./queue-order.js"

export function createChoiceTransactionStore(database: Database): {
  readonly usage: UsageTransactionStores["choices"]
  readonly commands: CommandTransactionStores["choices"]
} {
  return {
    usage: {
      hasPending: (trainerId) =>
        (database
          .query<{ readonly count: number }, [string]>(
            "SELECT COUNT(*) AS count FROM pending_choices WHERE trainer_id = ?1",
          )
          .get(trainerId)?.count ?? 0) > 0,
      hasPokemonChoice: (trainerId, pokemonId, kind, moveId) =>
        database
          .query<{ readonly id: string }, [string, string, string, string | null]>(
            `SELECT id FROM pending_choices
             WHERE trainer_id = ?1 AND kind = ?3
               AND CASE WHEN json_valid(payload) THEN json_extract(payload, '$.pokemonId') END = ?2
               AND (?4 IS NULL OR CASE WHEN json_valid(payload) THEN json_extract(payload, '$.move.id') END = ?4)
             LIMIT 1`,
          )
          .get(trainerId, pokemonId, kind, moveId ?? null) !== null,
      insert: ({ id, trainerId, createdAt, ...choice }) => {
        const insertionOrder = nextQueueOrder(database, trainerId, "choice")
        database
          .query<void, [string, string, string, string, string, number]>(
            "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at, insertion_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
          )
          .run(id, trainerId, choice.kind, encodeChoicePayload(choice), createdAt, insertionOrder)
      },
    },
    commands: {
      find: (trainerId, choiceId, kind) => {
        const row = database
          .query<
            { readonly id: string; readonly kind: string; readonly payload: string },
            [string, string, string]
          >(
            "SELECT id, kind, payload FROM pending_choices WHERE trainer_id = ?1 AND id = ?2 AND kind = ?3",
          )
          .get(trainerId, choiceId, kind)
        if (row === null) return null
        const choice = decodeChoicePayload(row.kind, row.payload)
        return choice === null ? null : { ...choice, id: row.id }
      },
      hasKind: (trainerId, kind) =>
        database
          .query<{ readonly id: string }, [string, string]>(
            "SELECT id FROM pending_choices WHERE trainer_id = ?1 AND kind = ?2 LIMIT 1",
          )
          .get(trainerId, kind) !== null,
      delete: (choiceId) => {
        database.query<void, [string]>("DELETE FROM pending_choices WHERE id = ?1").run(choiceId)
      },
      deleteKind: (trainerId, kind) => {
        database
          .query<void, [string, string]>(
            "DELETE FROM pending_choices WHERE trainer_id = ?1 AND kind = ?2",
          )
          .run(trainerId, kind)
      },
      deleteCatch: (trainerId, encounterId) => {
        database
          .query<void, [string, string]>(
            `DELETE FROM pending_choices
             WHERE trainer_id = ?1 AND kind = 'catch'
               AND CASE WHEN json_valid(payload) THEN json_extract(payload, '$.encounterId') END = ?2`,
          )
          .run(trainerId, encounterId)
      },
    },
  }
}
