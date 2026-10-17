import { expect, test } from "bun:test"
import type { GameplayConfig, UsageInput } from "../../../src/application/contracts/game.js"
import { createGameFixture, withGameDatabase as withDatabase } from "../../support/game.js"

const config: GameplayConfig = {
  pauseOnPendingChoice: true,
  xpTokensPerPoint: 10,
  encounterMinimumTokens: 1,
  encounterMaximumTokens: 1,
  locationUnlockTokens: 100_000,
}

function usage(messageId: string): UsageInput {
  return {
    sessionId: "party-session",
    messageId,
    inputTokens: 1,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-15T00:00:00.000Z",
  }
}

test("party order drives export, and removed party members remain owned in the PC", () => {
  // GIVEN
  const fixture = createGameFixture({ config, random: () => 0 })

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
    })
    fixture.game.recordUsage(usage("find-pidgey"))
    const encounterId = fixture.game.status().pendingEncounter?.id
    if (encounterId === undefined) throw new Error("Expected a pending encounter")
    fixture.game.catchEncounter(encounterId)
    const collection = fixture.game.collection().pokemon
    const starter = collection.find((pokemon) => String(pokemon.speciesId) === "bulbasaur")
    const caught = collection.find((pokemon) => String(pokemon.speciesId) === "pidgey")
    if (starter === undefined || caught === undefined) throw new Error("Expected starter and catch")

    // WHEN
    const reordered = fixture.game.replaceParty([caught.id, starter.id])
    const reorderedExport = fixture.game.exportTeam()
    const removed = fixture.game.replaceParty([starter.id])
    const partyAfterRemoval = fixture.game
      .status()
      .party.flatMap((slot) => (slot.pokemon === null ? [] : [slot.pokemon]))
    const collectionAfterRemoval = fixture.game.collection().pokemon
    const exportAfterRemoval = fixture.game.exportTeam()

    // THEN
    expect(reordered.kind).toBe("replaced")
    expect(
      reordered.state.party.flatMap((slot) => (slot.pokemon ? [String(slot.pokemon.id)] : [])),
    ).toEqual([String(caught.id), String(starter.id)])
    expect(reorderedExport.kind).toBe("exported")
    expect(reorderedExport.text).toContain(caught.name)
    expect(reorderedExport.text).toContain(starter.name)
    expect(reorderedExport.text.indexOf(caught.name)).toBeLessThan(
      reorderedExport.text.indexOf(starter.name),
    )
    expect(removed.kind).toBe("replaced")
    expect(partyAfterRemoval.map((pokemon) => String(pokemon.id))).toEqual([String(starter.id)])
    expect(collectionAfterRemoval.map((pokemon) => String(pokemon.id))).toContain(String(caught.id))
    expect(exportAfterRemoval.kind).toBe("exported")
    expect(exportAfterRemoval.text).toContain(starter.name)
    expect(exportAfterRemoval.text).not.toContain(caught.name)
  } finally {
    fixture.dispose()
  }
})

test("an onboarding game exports an inactive empty team", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false })

  try {
    // WHEN
    const exported = fixture.game.exportTeam()

    // THEN
    expect(exported).toEqual({ kind: "inactive", text: "" })
  } finally {
    fixture.dispose()
  }
})
