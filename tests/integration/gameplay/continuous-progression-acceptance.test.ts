import { expect, test } from "bun:test"
import { gameplayConfigSchema, type UsageInput } from "../../../src/application/contracts/game.js"
import { createGameFixture, withGameDatabase } from "../../support/game.js"

function usage(messageId: string, inputTokens: number): UsageInput {
  return {
    sessionId: "continuous-acceptance",
    messageId,
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-16T00:00:00.000Z",
  }
}

test("unattended progress survives restart, drains safely, and respects a later pause", () => {
  const config = gameplayConfigSchema.parse({
    pauseOnPendingChoice: false,
    encounterMinimumTokens: 1_000,
    encounterMaximumTokens: 1_000,
    locationUnlockBaseTokens: 10_000,
    locationUnlockExponent: 1,
    locationUnlockRegionExponent: 0,
  })
  const fixture = createGameFixture({ config, random: () => 0 })
  try {
    const pokemon = fixture.game.status().party[0]?.pokemon
    if (pokemon === undefined || pokemon === null) throw new Error("Missing starter")
    const choiceId = "10000000-0000-4000-8000-000000000001"
    withGameDatabase(fixture.databasePath, (database) => {
      database.run("UPDATE trainers SET current_location_id = 'kanto-route-1'")
      database.run("UPDATE location_progress SET location_id = 'kanto-route-1'")
      database
        .query<void, [string, string, string]>(
          `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at)
           SELECT ?1, id, 'move', ?2, ?3 FROM trainers`,
        )
        .run(
          choiceId,
          JSON.stringify({ pokemonId: pokemon.id, move: { id: "razor-leaf", name: "Razor Leaf" } }),
          "2026-10-16T00:00:00.000Z",
        )
    })

    const first = fixture.game.recordUsage(usage("coffee", 3_500))
    expect(first.kind).toBe("applied")
    expect(first.state.pendingEncounterCount).toBe(3)
    expect(first.state.party[0]?.pokemon?.experience).toBe(3.5)
    expect(first.state.exploration?.locationUnlockProgress).toBe(3_500)
    expect(first.state.pendingChoices.filter((choice) => choice.kind === "move")).toHaveLength(1)
    const firstEncounter = first.state.pendingEncounter
    if (firstEncounter === null) throw new Error("Missing queued encounter")

    const reopened = fixture.reopen().status()
    expect(reopened.pendingEncounter).toEqual(firstEncounter)
    expect(reopened.pendingEncounterCount).toBe(3)
    expect(fixture.game.recordUsage(usage("coffee", 3_500)).kind).toBe("duplicate")
    expect(fixture.game.recordUsage(usage("second-coffee", 500)).state.pendingEncounterCount).toBe(
      4,
    )

    expect(fixture.game.resolveMoveChoice(choiceId, "razor-leaf").kind).toBe("resolved")
    expect(fixture.game.catchEncounter(firstEncounter.id).kind).toBe("caught")
    const afterCatch = fixture.game.status()
    expect(afterCatch.pendingEncounterCount).toBe(3)
    expect(fixture.game.runEncounter(firstEncounter.id).kind).toBe("no-encounter")
    expect(fixture.game.status().pendingEncounter).toEqual(afterCatch.pendingEncounter)

    config.pauseOnPendingChoice = true
    fixture.reopen()
    const paused = fixture.game.recordUsage(usage("paused", 100_000))
    expect(paused.kind).toBe("frozen-discarded")
    expect(paused.state.pendingEncounterCount).toBe(3)
    expect(paused.state.party[0]?.pokemon?.experience).toBe(4)
    expect(paused.state.exploration?.locationUnlockProgress).toBe(4_000)

    for (let count = 3; count > 0; count -= 1) {
      const head = fixture.game.status().pendingEncounter
      if (head === null) throw new Error("Queue ended early")
      expect(fixture.game.runEncounter(head.id).state.pendingEncounterCount).toBe(count - 1)
    }
    expect(fixture.game.status().pendingChoices).toHaveLength(0)
    expect(fixture.game.recordUsage(usage("paused", 100_000)).kind).toBe("duplicate")
    expect(fixture.game.recordUsage(usage("resumed", 500)).kind).toBe("applied")
    expect(fixture.game.status().party[0]?.pokemon?.experience).toBe(4.5)
  } finally {
    fixture.dispose()
  }
})

test("a failure on a later encounter rolls back the entire multi-encounter receipt", () => {
  const fixture = createGameFixture({
    config: gameplayConfigSchema.parse({
      pauseOnPendingChoice: false,
      encounterMinimumTokens: 1_000,
      encounterMaximumTokens: 1_000,
      locationUnlockBaseTokens: 10_000,
      locationUnlockExponent: 1,
      locationUnlockRegionExponent: 0,
    }),
    random: () => 0,
  })
  try {
    withGameDatabase(fixture.databasePath, (database) => {
      database.run("UPDATE trainers SET current_location_id = 'kanto-route-1'")
      database.run("UPDATE location_progress SET location_id = 'kanto-route-1'")
      database.run(`
        CREATE TRIGGER fail_second_encounter BEFORE INSERT ON pending_encounters
        WHEN (SELECT COUNT(*) FROM pending_encounters) = 1
        BEGIN SELECT RAISE(ABORT, 'second encounter failed'); END
      `)
    })
    const before = fixture.game.status()
    expect(() => fixture.game.recordUsage(usage("atomic-coffee", 3_500))).toThrow(
      "second encounter failed",
    )
    expect(fixture.game.status()).toEqual(before)
    withGameDatabase(fixture.databasePath, (database) => {
      expect(database.query("SELECT * FROM token_receipts").all()).toHaveLength(0)
      expect(database.query("SELECT * FROM encounter_progress").all()).toHaveLength(0)
      expect(database.query("SELECT * FROM pending_encounters").all()).toHaveLength(0)
      expect(database.query("SELECT * FROM pending_choices").all()).toHaveLength(0)
      database.run("DROP TRIGGER fail_second_encounter")
    })
    const retry = fixture.game.recordUsage(usage("atomic-coffee", 3_500))
    expect(retry.kind).toBe("applied")
    expect(retry.state.pendingEncounterCount).toBe(3)
    expect(retry.state.party[0]?.pokemon?.experience).toBe(3.5)
    expect(retry.state.exploration?.locationUnlockProgress).toBe(3_500)
    expect(fixture.game.recordUsage(usage("atomic-coffee", 3_500)).kind).toBe("duplicate")
    expect(fixture.reopen().status().pendingEncounterCount).toBe(3)
  } finally {
    fixture.dispose()
  }
})

test("a substantial backlog has one encounter projection and survives travel without rerolls", () => {
  const fixture = createGameFixture({
    config: gameplayConfigSchema.parse({
      pauseOnPendingChoice: false,
      encounterMinimumTokens: 1,
      encounterMaximumTokens: 1,
    }),
    random: () => 0,
  })
  try {
    withGameDatabase(fixture.databasePath, (database) => {
      database.run("UPDATE trainers SET current_location_id = 'kanto-route-1'")
    })
    const queued = fixture.game.recordUsage(usage("long-backlog", 128)).state
    expect(queued.pendingEncounterCount).toBe(128)
    expect(queued.pendingChoices.filter((choice) => choice.kind === "catch")).toHaveLength(128)
    expect(
      Object.keys(queued)
        .filter((key) => key.startsWith("pendingEncounter"))
        .sort(),
    ).toEqual(["pendingEncounter", "pendingEncounterCount"])
    const persisted = withGameDatabase(fixture.databasePath, (database) =>
      database.query("SELECT * FROM pending_encounters ORDER BY rowid").all(),
    )
    expect(persisted).toHaveLength(128)
    const originalLocation = fixture.game
      .status()
      .exploration?.locations.find((location) => location.unlocked)
    if (originalLocation === undefined) throw new Error("Missing unlocked location")
    expect(fixture.game.travelTo(originalLocation.id).kind).toBe("teleported")
    withGameDatabase(fixture.databasePath, (database) => {
      database.run("UPDATE owned_pokemon SET level = 80")
    })
    expect(fixture.reopen().status().pendingEncounter).toEqual(queued.pendingEncounter)
    expect(
      withGameDatabase(fixture.databasePath, (database) =>
        database.query("SELECT * FROM pending_encounters ORDER BY rowid").all(),
      ),
    ).toEqual(persisted)
  } finally {
    fixture.dispose()
  }
})
