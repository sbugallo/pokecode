import { expect, test } from "bun:test"
import type { GameplayConfig, UsageInput } from "../../../src/application/contracts/game.js"
import { createGameFixture, withGameDatabase as withDatabase } from "../../support/game.js"

const config: GameplayConfig = {
  pauseOnPendingChoice: true,
  xpTokensPerPoint: 1_000,
  encounterMinimumTokens: 1,
  encounterMaximumTokens: 1,
  locationUnlockTokens: 2_160_000,
  locationUnlockBaseTokens: 100_000,
  locationUnlockExponent: 1,
  locationUnlockRegionExponent: 0,
}

function usage(messageId: string, inputTokens = 1): UsageInput {
  return {
    sessionId: "encounter-session",
    messageId,
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-15T00:00:00.000Z",
  }
}

function encounterId(state: { readonly pendingEncounter: { readonly id: string } | null }): string {
  const id = state.pendingEncounter?.id
  if (id === undefined) throw new Error("Expected a pending encounter")
  return id
}

test("an ordinary encounter freezes usage until it is run, then allows the next encounter", () => {
  // GIVEN
  const fixture = createGameFixture({ config, random: () => 0 })

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
    })

    // WHEN
    const encountered = fixture.game.recordUsage(usage("first-encounter"))
    const frozen = fixture.game.recordUsage(usage("while-encounter-pending"))
    const ran = fixture.game.runEncounter(encounterId(encountered.state))
    const afterRunning = fixture.game.recordUsage(usage("encounter-after-run"))

    // THEN
    expect(encountered.state.pendingEncounter?.kind).toBe("ordinary")
    expect(frozen.kind).toBe("frozen-discarded")
    expect(ran.kind).toBe("ran")
    expect(ran.state.pendingEncounter).toBeNull()
    expect(fixture.game.collection().pokemon).toHaveLength(1)
    expect(afterRunning.state.pendingEncounter?.kind).toBe("ordinary")
  } finally {
    fixture.dispose()
  }
})

test("encounter overflow is discarded and its threshold survives reopen and running", () => {
  // GIVEN
  const thresholdConfig: GameplayConfig = {
    ...config,
    encounterMinimumTokens: 10,
    encounterMaximumTokens: 10,
  }
  const fixture = createGameFixture({ config: thresholdConfig, random: () => 0 })

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
    })

    // WHEN
    const partial = fixture.game.recordUsage(usage("below-encounter-threshold", 6))
    const beforeReopen = withDatabase(fixture.databasePath, (database) =>
      database
        .query<{ readonly tokenCount: number; readonly threshold: number }, []>(
          "SELECT token_count AS tokenCount, threshold FROM encounter_progress",
        )
        .get(),
    )
    const reopenedGame = fixture.reopen()
    const crossed = reopenedGame.recordUsage(usage("cross-encounter-threshold", 6))
    const afterCrossing = withDatabase(fixture.databasePath, (database) =>
      database
        .query<{ readonly tokenCount: number; readonly threshold: number }, []>(
          "SELECT token_count AS tokenCount, threshold FROM encounter_progress",
        )
        .get(),
    )
    const ran = reopenedGame.runEncounter(encounterId(crossed.state))
    const afterRunning = reopenedGame.recordUsage(usage("after-overflow-reset", 1))
    const remainingProgress = withDatabase(fixture.databasePath, (database) =>
      database
        .query<{ readonly tokenCount: number; readonly threshold: number }, []>(
          "SELECT token_count AS tokenCount, threshold FROM encounter_progress",
        )
        .get(),
    )

    // THEN
    expect(partial.state.pendingEncounter).toBeNull()
    expect(beforeReopen).toEqual({ tokenCount: 6, threshold: 10 })
    expect(crossed.state.pendingEncounter?.kind).toBe("ordinary")
    expect(afterCrossing).toEqual({ tokenCount: 0, threshold: 10 })
    expect(ran.kind).toBe("ran")
    expect(afterRunning.state.pendingEncounter).toBeNull()
    expect(remainingProgress).toEqual({ tokenCount: 1, threshold: 10 })
  } finally {
    fixture.dispose()
  }
})

test("regional roamers are encountered once and remain exhausted after reopening", () => {
  // GIVEN
  const fixture = createGameFixture({ config, random: () => 0, withStarter: false })

  try {
    fixture.game.chooseStarter("johto", "chikorita")
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE owned_pokemon SET level = 40").run()
    })

    // WHEN
    const roamers: string[] = []
    for (const messageId of ["roamer-one", "roamer-two", "roamer-three"]) {
      const encounter = fixture.game.recordUsage(usage(messageId)).state.pendingEncounter
      if (encounter?.kind === "special") roamers.push(String(encounter.speciesId))
      if (encounter !== null) fixture.game.runEncounter(encounter.id)
    }
    const afterReopen = fixture.reopen().recordUsage(usage("after-roamers")).state.pendingEncounter

    // THEN
    expect(new Set(roamers)).toEqual(new Set(["entei", "raikou", "suicune"]))
    expect(afterReopen?.kind).toBe("ordinary")
  } finally {
    fixture.dispose()
  }
})

test("ordinary encounter levels never exceed the highest party level", () => {
  // GIVEN
  const fixture = createGameFixture({ config, random: () => 0.999999 })

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
      database.query<void, []>("UPDATE owned_pokemon SET level = 3").run()
    })

    // WHEN
    const result = fixture.game.recordUsage(usage("level-capped-encounter"))

    // THEN
    expect(result.state.pendingEncounter?.kind).toBe("ordinary")
    expect(result.state.pendingEncounter?.level).toBe(3)
  } finally {
    fixture.dispose()
  }
})

test("ordinary encounters are omitted when every local species is above the party level", () => {
  // GIVEN
  const fixture = createGameFixture({ config, random: () => 0 })

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
      database.query<void, []>("UPDATE owned_pokemon SET level = 1").run()
    })

    // WHEN
    const result = fixture.game.recordUsage(usage("no-eligible-species"))

    // THEN
    expect(result.state.pendingEncounter).toBeNull()
  } finally {
    fixture.dispose()
  }
})

test("captured Pokémon fill the party before later captures remain in the collection", () => {
  // GIVEN
  const fixture = createGameFixture({ config, random: () => 0 })

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'cerulean-cave'").run()
      database.query<void, []>("UPDATE owned_pokemon SET level = 70").run()
    })

    // WHEN
    const special = fixture.game.recordUsage(usage("special-encounter"))
    const firstCapture = fixture.game.catchEncounter(encounterId(special.state))
    for (const index of [1, 2, 3, 4, 5]) {
      const result = fixture.game.recordUsage(usage(`capture-${index}`))
      if (result.state.pendingEncounter !== null)
        fixture.game.catchEncounter(result.state.pendingEncounter.id)
    }
    const fullParty = fixture.game.status()
    const collection = fixture.game.collection()

    // THEN
    expect(special.state.pendingEncounter).toMatchObject({
      kind: "special",
      level: 70,
      shiny: true,
    })
    expect(firstCapture.kind).toBe("caught")
    expect(firstCapture.state.party[1]?.pokemon).toMatchObject({
      speciesId: special.state.pendingEncounter?.speciesId,
      level: 70,
      shiny: true,
    })
    expect(fullParty.party.filter((slot) => slot.pokemon !== null)).toHaveLength(6)
    expect(collection.pokemon).toHaveLength(7)
  } finally {
    fixture.dispose()
  }
})
