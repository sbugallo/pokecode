import type { Database } from "bun:sqlite"
import type { UsageTransactionStores } from "../../../application/ports/game-transaction.js"

export function createReceiptStore(database: Database): UsageTransactionStores["receipts"] {
  return {
    claim: ({ id, trainerId, usage, tokenCount }) =>
      database
        .query<void, [string, string | null, string, string, number, string]>(
          `INSERT OR IGNORE INTO token_receipts (
            id, trainer_id, session_id, message_id, token_count, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .run(id, trainerId, usage.sessionId, usage.messageId, tokenCount, usage.completedAt)
        .changes > 0,
  }
}
