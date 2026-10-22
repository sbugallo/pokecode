import { expect, test } from "bun:test"
import type { UsageInput } from "../../../src/application/contracts/game.js"
import { experienceForNextLevel, progressionFor } from "../../../src/domain/progression/catalog.js"
import { tokensPerExperiencePoint } from "../../../src/domain/usage/usage.js"
import { createGameFixture, withGameDatabase as withDatabase } from "../../support/game.js"

const config = {
  pauseOnPendingChoice: true,
  encounterMinimumTokens: 1_000_000_000,
  encounterMaximumTokens: 1_000_000_000,
  locationUnlockBaseTokens: 1_000_000_000,
  locationUnlockExponent: 1,
  locationUnlockRegionExponent: 0,
}

function usage(messageId: string, tokenCount: number): UsageInput {
  return {
    sessionId: "progression-session",
    messageId,
    inputTokens: tokenCount,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-15T00:00:00.000Z",
  }
}

function tokensForExperienceBetween(
  speciesId: string,
  startLevel: number,
  finalLevel: number,
): number {
  let amount = 0
  for (let level = startLevel; level < finalLevel; level += 1) {
    amount += experienceForNextLevel(progressionFor(speciesId).growthRate, level)
  }
  return amount * tokensPerExperiencePoint
}

test("multi-level progression applies evolution and learns each eligible move", () => {
  // GIVEN
  const fixture = createGameFixture({ config })

  try {
    // WHEN
    const result = fixture.game.recordUsage(
      usage("reach-level-sixteen", tokensForExperienceBetween("bulbasaur", 5, 16)),
    )

    // THEN
    expect(result.state.party[0]?.pokemon).toMatchObject({
      speciesId: "ivysaur",
      name: "Ivysaur",
      level: 16,
      experience: 0,
      moves: [
        { id: "growl", name: "Growl" },
        { id: "tackle", name: "Tackle" },
        { id: "vine-whip", name: "Vine Whip" },
        { id: "poison-powder", name: "Poison Powder" },
      ],
    })
    expect(result.state.pendingChoices).toHaveLength(0)
  } finally {
    fixture.dispose()
  }
})

test("a full move set can decline the offered move without changing known moves", () => {
  // GIVEN
  const fixture = createGameFixture({ config })

  try {
    fixture.game.recordUsage(usage("reach-sixteen", tokensForExperienceBetween("bulbasaur", 5, 16)))

    // WHEN
    const learned = fixture.game.recordUsage(
      usage("reach-twenty-two", tokensForExperienceBetween("ivysaur", 16, 22)),
    )
    const choice = learned.state.pendingChoices.find((pending) => pending.kind === "move")
    if (choice === undefined) throw new Error("Expected a move choice")
    const resolved = fixture.game.resolveMoveChoice(choice.id, "razor-leaf")

    // THEN
    expect(learned.state.party[0]?.pokemon?.level).toBe(22)
    expect(resolved.kind).toBe("resolved")
    expect(resolved.state.party[0]?.pokemon?.moves.map((move) => move.id)).not.toContain(
      "razor-leaf",
    )
    expect(resolved.state.pendingChoices.map((pending) => pending.id)).not.toContain(choice.id)
  } finally {
    fixture.dispose()
  }
})

test("choosing a known move replaces that slot with the newly learned move", () => {
  // GIVEN
  const fixture = createGameFixture({ config })

  try {
    fixture.game.recordUsage(usage("reach-sixteen", tokensForExperienceBetween("bulbasaur", 5, 16)))
    const learned = fixture.game.recordUsage(
      usage("reach-twenty-two", tokensForExperienceBetween("ivysaur", 16, 22)),
    )
    const choice = learned.state.pendingChoices.find((pending) => pending.kind === "move")
    if (choice === undefined) throw new Error("Expected a move choice")

    // WHEN
    const resolved = fixture.game.resolveMoveChoice(choice.id, "tackle")

    // THEN
    expect(learned.state.party[0]?.pokemon?.level).toBe(22)
    expect(resolved.kind).toBe("resolved")
    expect(resolved.state.party[0]?.pokemon?.moves.map((move) => move.id)).toEqual([
      "growl",
      "razor-leaf",
      "vine-whip",
      "poison-powder",
    ])
  } finally {
    fixture.dispose()
  }
})

test("a level-triggered Eevee evolution choice survives reopening and resolves durably", () => {
  // GIVEN
  const fixture = createGameFixture({ config, random: () => 0 })

  try {
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected a starter")
    withDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>(
          "UPDATE owned_pokemon SET species_id = 'eevee', name = 'Eevee', level = 24, experience = 0 WHERE id = ?1",
        )
        .run(pokemonId)
    })

    // WHEN
    const queued = fixture.game.recordUsage(
      usage("eevee-evolution", tokensForExperienceBetween("eevee", 24, 25)),
    )
    const evolutionChoice = queued.state.pendingChoices.find(
      (choice) => choice.kind === "evolution",
    )
    if (evolutionChoice === undefined)
      throw new Error("Expected a level-triggered evolution choice")
    const reopenedGame = fixture.reopen()
    const persistedChoice = reopenedGame
      .status()
      .pendingChoices.find((choice) => choice.id === evolutionChoice.id)
    if (persistedChoice === undefined)
      throw new Error("Expected the evolution choice after reopening")
    const persistedPayload = JSON.parse(persistedChoice.payload) as {
      readonly pokemonId: string
      readonly options: readonly { readonly speciesId: string; readonly name: string }[]
    }
    const resolution = reopenedGame.resolveEvolutionChoice(evolutionChoice.id, "jolteon")
    const durableState = fixture.reopen().status()

    // THEN
    expect(persistedPayload.pokemonId).toBe(pokemonId)
    expect(persistedPayload.options.some((option) => option.speciesId === "jolteon")).toBe(true)
    expect(persistedPayload.options.length).toBeGreaterThan(1)
    expect(resolution.kind).toBe("resolved")
    expect(resolution.state.pendingChoices.map((choice) => choice.id)).not.toContain(
      evolutionChoice.id,
    )
    expect(String(durableState.party[0]?.pokemon?.speciesId)).toBe("jolteon")
    expect(durableState.pendingChoices.map((choice) => choice.id)).not.toContain(evolutionChoice.id)
  } finally {
    fixture.dispose()
  }
})
