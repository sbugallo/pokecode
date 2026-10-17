import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { createGameFixture } from "../../support/game.js"

const completedAt = "2026-10-15T00:00:00.000Z"

function usage(messageId: string, inputTokens: number) {
  return {
    sessionId: "atomic-session",
    messageId,
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt,
  }
}

function databaseFacts(path: string) {
  const database = new Database(path)
  try {
    return {
      receipts: database
        .query("SELECT * FROM token_receipts ORDER BY session_id, message_id")
        .all(),
      pokemon: database.query("SELECT * FROM owned_pokemon ORDER BY id").all(),
      moves: database.query("SELECT * FROM pokemon_moves ORDER BY pokemon_id, position").all(),
      choices: database.query("SELECT * FROM pending_choices ORDER BY id").all(),
      locations: database
        .query("SELECT * FROM location_progress ORDER BY trainer_id, location_id")
        .all(),
      unlockProgress: database.query("SELECT * FROM location_unlock_progress").all(),
      regions: database.query("SELECT * FROM region_progress ORDER BY trainer_id, region_id").all(),
      encounters: database.query("SELECT * FROM pending_encounters").all(),
      encounterProgress: database.query("SELECT * FROM encounter_progress").all(),
      specials: database.query("SELECT * FROM triggered_special_encounters").all(),
      pokedex: database
        .query("SELECT * FROM pokedex_entries ORDER BY trainer_id, species_id")
        .all(),
    }
  } finally {
    database.close()
  }
}

function installTrigger(path: string, sql: string): void {
  const database = new Database(path)
  try {
    database.run(sql)
  } finally {
    database.close()
  }
}

function dropTrigger(path: string, name: string): void {
  const database = new Database(path)
  try {
    database.run(`DROP TRIGGER ${name}`)
  } finally {
    database.close()
  }
}

function setTrainerLocation(path: string, locationId: string, level?: number): void {
  const database = new Database(path)
  try {
    database.query<void, [string]>("UPDATE trainers SET current_location_id = ?1").run(locationId)
    database.query<void, [string]>("UPDATE location_progress SET location_id = ?1").run(locationId)
    if (level !== undefined)
      database.query<void, [number]>("UPDATE owned_pokemon SET level = ?1").run(level)
  } finally {
    database.close()
  }
}

describe("usage transaction atomicity", () => {
  test("rolls back receipt, levels, moves and choices after a later write fails, then retries once", () => {
    // GIVEN
    const fixture = createGameFixture({
      config: {
        pauseOnPendingChoice: true,
        xpTokensPerPoint: 1,
        encounterMinimumTokens: 100_000,
        encounterMaximumTokens: 100_000,
        locationUnlockTokens: 100_000,
      },
    })
    try {
      const before = databaseFacts(fixture.databasePath)
      installTrigger(
        fixture.databasePath,
        `CREATE TRIGGER fail_usage_experience BEFORE UPDATE ON location_unlock_progress
         BEGIN SELECT RAISE(ABORT, 'failure during usage'); END`,
      )

      // WHEN
      expect(() => fixture.game.recordUsage(usage("retry-after-failure", 20_000))).toThrow(
        "failure during usage",
      )

      // THEN
      expect(databaseFacts(fixture.databasePath)).toEqual(before)
      dropTrigger(fixture.databasePath, "fail_usage_experience")
      const retry = fixture.game.recordUsage(usage("retry-after-failure", 20_000))
      expect(retry.kind).toBe("applied")
      expect(retry.state.party[0]?.pokemon?.level).toBeGreaterThan(5)
      expect(retry.state.pendingChoices.length).toBeGreaterThan(0)
      const committed = databaseFacts(fixture.databasePath)
      expect(committed.receipts).toHaveLength(1)
      expect(committed.moves).not.toEqual(before.moves)
      expect(fixture.game.recordUsage(usage("retry-after-failure", 20_000)).kind).toBe("duplicate")
      expect(databaseFacts(fixture.databasePath)).toEqual(committed)
    } finally {
      fixture.dispose()
    }
  })

  test("rolls back a special encounter and its trigger marker, then retries the encounter once", () => {
    // GIVEN
    const fixture = createGameFixture({
      config: {
        pauseOnPendingChoice: true,
        xpTokensPerPoint: 1_000,
        encounterMinimumTokens: 1,
        encounterMaximumTokens: 1,
        locationUnlockTokens: 100_000,
      },
      random: () => 0,
    })
    try {
      setTrainerLocation(fixture.databasePath, "cerulean-cave", 70)
      const before = databaseFacts(fixture.databasePath)
      installTrigger(
        fixture.databasePath,
        `CREATE TRIGGER fail_special_usage BEFORE INSERT ON encounter_progress
         BEGIN SELECT RAISE(ABORT, 'failure after special encounter'); END`,
      )
      const input = usage("special-retry", 200_000)

      // WHEN
      expect(() => fixture.game.recordUsage(input)).toThrow("failure after special encounter")

      // THEN
      expect(databaseFacts(fixture.databasePath)).toEqual(before)
      dropTrigger(fixture.databasePath, "fail_special_usage")
      const retry = fixture.game.recordUsage(input)
      expect(retry.kind).toBe("applied")
      expect(retry.state.pendingEncounter).toMatchObject({ kind: "special", speciesId: "mewtwo" })
      const database = new Database(fixture.databasePath)
      try {
        expect(
          database
            .query<{ readonly specialEncounterId: string }, []>(
              "SELECT special_encounter_id AS specialEncounterId FROM triggered_special_encounters",
            )
            .get()?.specialEncounterId,
        ).toBe("kanto-cerulean-cave-mewtwo")
      } finally {
        database.close()
      }
      const committed = databaseFacts(fixture.databasePath)
      expect(fixture.game.recordUsage(input).kind).toBe("duplicate")
      expect(databaseFacts(fixture.databasePath)).toEqual(committed)
    } finally {
      fixture.dispose()
    }
  })

  test("rolls back region completion and its typed choice when a later encounter write fails", () => {
    // GIVEN
    const fixture = createGameFixture({
      config: {
        pauseOnPendingChoice: true,
        xpTokensPerPoint: 1_000_000,
        encounterMinimumTokens: 1,
        encounterMaximumTokens: 1,
        locationUnlockTokens: 100_000,
      },
      random: () => 0,
    })
    try {
      setTrainerLocation(fixture.databasePath, "faraway-island")
      const before = databaseFacts(fixture.databasePath)
      installTrigger(
        fixture.databasePath,
        `CREATE TRIGGER fail_region_usage BEFORE INSERT ON encounter_progress
         BEGIN SELECT RAISE(ABORT, 'failure after region completion'); END`,
      )
      const input = usage("region-retry", 1)

      // WHEN
      expect(() => fixture.game.recordUsage(input)).toThrow("failure after region completion")

      // THEN
      expect(databaseFacts(fixture.databasePath)).toEqual(before)
      dropTrigger(fixture.databasePath, "fail_region_usage")
      const retry = fixture.game.recordUsage(input)
      expect(retry.kind).toBe("applied")
      expect(retry.state.exploration?.regionComplete).toBe(true)
      expect(retry.state.pendingChoices.some((choice) => choice.kind === "region")).toBe(true)
      const database = new Database(fixture.databasePath)
      try {
        expect(
          database
            .query<{ readonly payload: string }, []>(
              "SELECT payload FROM pending_choices WHERE kind = 'region'",
            )
            .get()?.payload,
        ).toBe('{"region":"kanto"}')
      } finally {
        database.close()
      }
      const committed = databaseFacts(fixture.databasePath)
      expect(fixture.game.recordUsage(input).kind).toBe("duplicate")
      expect(databaseFacts(fixture.databasePath)).toEqual(committed)
    } finally {
      fixture.dispose()
    }
  })

  test("leaves no partial receipt when SQLite rejects a writer lock, then records after release", () => {
    // GIVEN
    const fixture = createGameFixture()
    const holder = new Database(fixture.databasePath)
    try {
      const before = databaseFacts(fixture.databasePath)
      holder.run("BEGIN IMMEDIATE")

      // WHEN
      expect(() => fixture.game.recordUsage(usage("locked-retry", 10))).toThrow(/locked|busy/i)

      // THEN
      expect(databaseFacts(fixture.databasePath)).toEqual(before)
      holder.run("ROLLBACK")
      const retry = fixture.game.recordUsage(usage("locked-retry", 10))
      expect(retry.kind).toBe("applied")
      const committed = databaseFacts(fixture.databasePath)
      expect(fixture.game.recordUsage(usage("locked-retry", 10)).kind).toBe("duplicate")
      expect(databaseFacts(fixture.databasePath)).toEqual(committed)
    } finally {
      try {
        holder.run("ROLLBACK")
      } catch {
        // The successful path already released the transaction.
      }
      holder.close()
      fixture.dispose()
    }
  })
})
