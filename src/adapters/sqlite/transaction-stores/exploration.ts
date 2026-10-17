import type { Database } from "bun:sqlite"
import type {
  CommandTransactionStores,
  UsageTransactionStores,
} from "../../../application/ports/game-transaction.js"

export function createExplorationTransactionStore(database: Database): {
  readonly usage: UsageTransactionStores["exploration"]
  readonly commands: CommandTransactionStores["exploration"]
} {
  return {
    usage: {
      visitedRegionIds: (trainerId) =>
        database
          .query<{ readonly regionId: string }, [string]>(
            "SELECT region_id AS regionId FROM region_progress WHERE trainer_id = ?1",
          )
          .all(trainerId)
          .map((region) => region.regionId),
      latestUnlockedLocation: (trainerId) =>
        database
          .query<{ readonly locationId: string }, [string]>(
            "SELECT location_id AS locationId FROM location_progress WHERE trainer_id = ?1 AND unlocked = 1 ORDER BY rowid DESC LIMIT 1",
          )
          .get(trainerId)?.locationId ?? null,
      unlockTokenCount: (trainerId) =>
        database
          .query<{ readonly tokenCount: number }, [string]>(
            "SELECT token_count AS tokenCount FROM location_unlock_progress WHERE trainer_id = ?1",
          )
          .get(trainerId)?.tokenCount ?? 0,
      setUnlockTokenCount: (trainerId, tokenCount) => {
        database
          .query<void, [number, string]>(
            "UPDATE location_unlock_progress SET token_count = ?1 WHERE trainer_id = ?2",
          )
          .run(tokenCount, trainerId)
      },
      unlockLocation: (trainerId, locationId) => {
        database
          .query<void, [string, string]>(
            "INSERT INTO location_progress (trainer_id, location_id) VALUES (?1, ?2)",
          )
          .run(trainerId, locationId)
      },
      completeRegion: (trainerId, regionId) =>
        database
          .query<void, [string, string]>(
            "UPDATE region_progress SET completed = 1 WHERE trainer_id = ?1 AND region_id = ?2 AND completed = 0",
          )
          .run(trainerId, regionId).changes > 0,
    },
    commands: {
      locationUnlocked: (trainerId, locationId) =>
        database
          .query<{ readonly locationId: string }, [string, string]>(
            "SELECT location_id AS locationId FROM location_progress WHERE trainer_id = ?1 AND location_id = ?2 AND unlocked = 1",
          )
          .get(trainerId, locationId) !== null,
      regionCompleted: (trainerId, regionId) =>
        database
          .query<{ readonly completed: number }, [string, string]>(
            "SELECT completed FROM region_progress WHERE trainer_id = ?1 AND region_id = ?2",
          )
          .get(trainerId, regionId)?.completed === 1,
      regionVisited: (trainerId, regionId) =>
        database
          .query<{ readonly regionId: string }, [string, string]>(
            "SELECT region_id AS regionId FROM region_progress WHERE trainer_id = ?1 AND region_id = ?2",
          )
          .get(trainerId, regionId) !== null,
      travelToLocation: (trainerId, regionId, locationId) => {
        database
          .query<void, [string, string, string]>(
            "UPDATE trainers SET current_region_id = ?1, current_location_id = ?2 WHERE id = ?3",
          )
          .run(regionId, locationId, trainerId)
      },
      initializeRegion: (trainerId, regionId, locationId) => {
        database
          .query<void, [string, string]>(
            "INSERT INTO region_progress (trainer_id, region_id) VALUES (?1, ?2)",
          )
          .run(trainerId, regionId)
        database
          .query<void, [string, string]>(
            "INSERT INTO location_progress (trainer_id, location_id) VALUES (?1, ?2)",
          )
          .run(trainerId, locationId)
        database
          .query<void, [string, string, string]>(
            "UPDATE trainers SET current_region_id = ?1, current_location_id = ?2 WHERE id = ?3",
          )
          .run(regionId, locationId, trainerId)
        database
          .query<void, [string]>(
            "UPDATE location_unlock_progress SET token_count = 0 WHERE trainer_id = ?1",
          )
          .run(trainerId)
      },
      setRegionDismissed: (trainerId, regionId, dismissed) => {
        database
          .query<void, [number, string, string]>(
            "UPDATE region_progress SET next_region_dismissed = ?1 WHERE trainer_id = ?2 AND region_id = ?3",
          )
          .run(Number(dismissed), trainerId, regionId)
      },
    },
  }
}
