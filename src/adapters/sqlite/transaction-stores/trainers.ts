import type { Database } from "bun:sqlite"
import type { UsageTransactionStores } from "../../../application/ports/game-transaction.js"

export function createTrainerTransactionStore(
  database: Database,
): UsageTransactionStores["trainers"] {
  return {
    find: () =>
      database
        .query<{ readonly id: string; readonly regionId: string; readonly locationId: string }, []>(
          "SELECT id, current_region_id AS regionId, current_location_id AS locationId FROM trainers LIMIT 1",
        )
        .get() ?? null,
    findById: (trainerId) =>
      database
        .query<
          { readonly id: string; readonly regionId: string; readonly locationId: string },
          [string]
        >(
          "SELECT id, current_region_id AS regionId, current_location_id AS locationId FROM trainers WHERE id = ?1",
        )
        .get(trainerId) ?? null,
  }
}
