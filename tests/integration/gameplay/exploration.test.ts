import { expect, test } from "bun:test"
import type { UsageInput } from "../../../src/application/contracts/game.js"
import { locationsForRegion, regions } from "../../../src/domain/content/catalog.js"
import { createGameFixture, withGameDatabase } from "../../support/game.js"

const quietEncounterConfig = {
  pauseOnPendingChoice: true,
  xpTokensPerPoint: 10,
  encounterMinimumTokens: 100_000,
  encounterMaximumTokens: 100_000,
  locationUnlockTokens: 10,
}

function usage(messageId: string, tokens: number): UsageInput {
  return {
    sessionId: "exploration-session",
    messageId,
    inputTokens: tokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-15T00:00:00.000Z",
  }
}

test("location progress unlocks one location at a time and only at the current location", () => {
  // GIVEN
  const fixture = createGameFixture({ config: quietEncounterConfig })
  const locations = locationsForRegion("kanto")

  try {
    // WHEN
    const firstUnlock = fixture.game.recordUsage(usage("unlock-first", 25))
    const progressAtOldLocation = fixture.game.recordUsage(usage("old-location", 10))
    const nextLocation = locations[1]
    if (nextLocation === undefined) throw new Error("Expected a second Kanto location")
    const travel = fixture.game.travelTo(nextLocation.id)
    const secondUnlock = fixture.game.recordUsage(usage("unlock-second", 10))

    // THEN
    expect(firstUnlock.state.exploration?.locations[1]).toMatchObject({
      id: nextLocation.id,
      unlocked: true,
    })
    expect(firstUnlock.state.exploration?.locationUnlockProgress).toBe(0)
    expect(progressAtOldLocation.state.exploration?.locationUnlockProgress).toBe(0)
    expect(travel.kind).toBe("teleported")
    expect(secondUnlock.state.exploration?.locations[2]?.unlocked).toBe(true)
  } finally {
    fixture.dispose()
  }
})

test("region completion stays pending until a new region is unlocked", () => {
  // GIVEN
  const fixture = createGameFixture({
    config: { ...quietEncounterConfig, locationUnlockTokens: 1 },
  })
  const locations = locationsForRegion("kanto")

  try {
    // WHEN
    for (const [index] of locations.entries()) {
      fixture.game.recordUsage(usage(`complete-location-${index}`, 1))
      const nextLocation = locations[index + 1]
      if (nextLocation !== undefined) fixture.game.travelTo(nextLocation.id)
    }
    const completed = fixture.game.status()
    const dismissed = fixture.game.dismissNextRegionChoice()
    const revisited = fixture.game.travelTo(locations[0]?.id ?? "")
    const frozen = fixture.game.recordUsage(usage("pending-region", 1))
    const reopened = fixture.game.reopenNextRegionChoice()
    const reopenedAgain = fixture.game.reopenNextRegionChoice()
    const traveled = fixture.game.travelToRegion("johto")

    // THEN
    expect(completed.exploration?.regionComplete).toBe(true)
    expect(completed.pendingChoices.map((choice) => choice.kind)).toContain("region")
    expect(dismissed.pendingChoices.map((choice) => choice.kind)).toContain("region")
    expect(revisited.state.pendingChoices.map((choice) => choice.kind)).toContain("region")
    expect(frozen.kind).toBe("frozen-discarded")
    expect(reopened.pendingChoices.map((choice) => choice.kind)).toContain("region")
    expect(reopenedAgain.pendingChoices.filter((choice) => choice.kind === "region")).toHaveLength(
      1,
    )
    expect(traveled.kind).toBe("traveled")
    expect(traveled.state.region).toBe("johto")
    expect(traveled.state.location).toBe(String(locationsForRegion("johto")[0]?.id))
    expect(traveled.state.pendingChoices.map((choice) => choice.kind)).not.toContain("region")
  } finally {
    fixture.dispose()
  }
})

test("location travel revisits regions without resetting unlocks or frontier progress", () => {
  const fixture = createGameFixture({ config: quietEncounterConfig })
  try {
    withGameDatabase(fixture.databasePath, (db) =>
      db.run("UPDATE region_progress SET completed = 1"),
    )
    const johto = fixture.game.travelToRegion("johto")
    expect(johto.kind).toBe("traveled")
    expect(fixture.game.chooseStarter("johto", "chikorita").kind).toBe("selected")
    const firstJohto = String(locationsForRegion("johto")[0]?.id)
    const secondJohto = String(locationsForRegion("johto")[1]?.id)
    fixture.game.recordUsage(usage("johto-progress", 4))
    const kanto = fixture.game.travelTo("pallet-town")
    expect(kanto.kind).toBe("teleported")
    expect(kanto.state.region).toBe("kanto")
    expect(kanto.state.exploration?.regionComplete).toBe(true)
    expect(
      kanto.state.exploration?.regions
        .filter((region) => region.visited)
        .map((region) => region.id),
    ).toEqual(["kanto", "johto"])
    expect(fixture.game.travelTo(String(locationsForRegion("hoenn")[0]?.id)).kind).toBe(
      "locked-location",
    )
    expect(fixture.game.travelToRegion("johto").kind).toBe("already-visited")
    fixture.game.recordUsage(usage("revisit-usage", 3))
    expect(fixture.game.status().exploration?.locationUnlockProgress).toBe(4)
    const returned = fixture.game.travelTo(firstJohto)
    expect(returned.state.region).toBe("johto")
    expect(returned.state.exploration?.regionComplete).toBe(false)
    const unlocked = fixture.game.recordUsage(usage("johto-finish-progress", 6))
    expect(
      unlocked.state.exploration?.locations.find((location) => location.id === secondJohto)
        ?.unlocked,
    ).toBe(true)
    expect(unlocked.state.exploration?.locationUnlockProgress).toBe(0)
    fixture.reopen()
    expect(fixture.game.travelTo("pallet-town").state.region).toBe("kanto")
    expect(fixture.game.travelTo(secondJohto).state.region).toBe("johto")
  } finally {
    fixture.dispose()
  }
})

test("completing the last region leaves no region choice and gameplay continues", () => {
  const fixture = createGameFixture({ config: quietEncounterConfig })
  try {
    const finalLocation = String(locationsForRegion("paldea").at(-1)?.id)
    withGameDatabase(fixture.databasePath, (db) => {
      const trainerId = db.query<{ id: string }, []>("SELECT id FROM trainers").get()?.id
      if (trainerId === undefined) throw new Error("Expected trainer")
      for (const region of regions()) {
        db.run(
          "INSERT INTO region_progress (trainer_id,region_id,completed) VALUES (?,?,?) ON CONFLICT(trainer_id,region_id) DO UPDATE SET completed=excluded.completed",
          [trainerId, region.id, region.id === "paldea" ? 0 : 1],
        )
      }
      db.run("INSERT INTO location_progress (trainer_id,location_id) VALUES (?,?)", [
        trainerId,
        finalLocation,
      ])
      db.run("UPDATE trainers SET current_region_id='paldea',current_location_id=?", [
        finalLocation,
      ])
    })
    const result = fixture.game.recordUsage(usage("complete-final-region", 1))
    expect(result.kind).toBe("applied")
    expect(result.state.exploration?.regions).toHaveLength(9)
    expect(result.state.exploration?.regions.every((region) => region.completed)).toBe(true)
    expect(result.state.pendingChoices).toEqual([])
    expect(fixture.game.reopenNextRegionChoice().pendingChoices).toEqual([])
    expect(fixture.game.recordUsage(usage("after-all-complete", 1)).kind).toBe("applied")
    fixture.reopen()
    expect(fixture.game.status().pendingChoices).toEqual([])
    expect(fixture.game.travelTo("pallet-town").state.region).toBe("kanto")
  } finally {
    fixture.dispose()
  }
})
