import { expect, test } from "bun:test"
import type { GameplayConfig, UsageInput } from "../../../src/application/contracts/game.js"
import { experienceForNextLevel, progressionFor } from "../../../src/domain/progression/catalog.js"
import { tokensPerExperiencePoint } from "../../../src/domain/usage/usage.js"
import { createGameFixture, withGameDatabase } from "../../support/game.js"

const continuousConfig: GameplayConfig = {
  pauseOnPendingChoice: false,
  xpTokensPerPoint: 1_000,
  encounterMinimumTokens: 10,
  encounterMaximumTokens: 10,
  locationUnlockTokens: 2_160_000,
  locationUnlockBaseTokens: 100_000_000,
  locationUnlockExponent: 1,
  locationUnlockRegionExponent: 0,
}

const pausedProgressionConfig: GameplayConfig = {
  ...continuousConfig,
  pauseOnPendingChoice: true,
  encounterMinimumTokens: 100_000_000,
  encounterMaximumTokens: 100_000_000,
}

function usage(messageId: string, inputTokens: number): UsageInput {
  return {
    sessionId: "continuous-gameplay",
    messageId,
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-16T00:00:00.000Z",
  }
}

function tokensForExperienceBetween(speciesId: string, from: number, to: number): number {
  let total = 0
  for (let level = from; level < to; level += 1) {
    total += experienceForNextLevel(progressionFor(speciesId).growthRate, level)
  }
  return total * tokensPerExperiencePoint
}

function queuePausedEeveeBranch(fixture: ReturnType<typeof createGameFixture>): {
  readonly pokemonId: string
  readonly branchChoiceId: string
} {
  const pokemonId = fixture.game.status().party[0]?.pokemon?.id
  if (pokemonId === undefined) throw new Error("Expected starter")
  withGameDatabase(fixture.databasePath, (database) => {
    database
      .query<void, [string]>(
        "UPDATE owned_pokemon SET species_id = 'eevee', name = 'Eevee', level = 24, experience = 0 WHERE id = ?1",
      )
      .run(pokemonId)
    database.query<void, [string]>("DELETE FROM pokemon_moves WHERE pokemon_id = ?1").run(pokemonId)
  })
  const queued = fixture.game.recordUsage(
    usage("paused-eevee-branch", tokensForExperienceBetween("eevee", 24, 27)),
  )
  const branch = queued.state.pendingChoices.find((choice) => choice.kind === "evolution")
  if (branch === undefined) throw new Error("Expected a pending Eevee branch")
  return { pokemonId, branchChoiceId: branch.id }
}

function moveChoice(
  fixture: ReturnType<typeof createGameFixture>,
  pokemonId: string,
  id: string,
): void {
  withGameDatabase(fixture.databasePath, (database) => {
    database
      .query<void, [string, string]>(
        `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at)
         SELECT ?1, id, 'move', ?2, '2026-10-16T00:00:00.000Z' FROM trainers`,
      )
      .run(id, JSON.stringify({ pokemonId, move: { id: "tackle", name: "Tackle" } }))
  })
}

function queueCatch(fixture: ReturnType<typeof createGameFixture>, encounterId: string): void {
  withGameDatabase(fixture.databasePath, (database) => {
    database
      .query<void, [string]>(
        `INSERT INTO pending_encounters (
           id, trainer_id, kind, species_id, name, level, sprite_url, ability, gender,
           shiny, special_encounter_id, created_at, insertion_order
         )
         SELECT ?1, id, 'ordinary', 'pidgey', 'Pidgey', 2,
           'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/16.png',
           'Keen Eye', 'male', 0, NULL, '2026-10-16T00:00:00.000Z', 1
         FROM trainers`,
      )
      .run(encounterId)
    database
      .query<void, [string, string]>(
        `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at)
         SELECT ?1, id, 'catch', ?2, '2026-10-16T00:00:00.000Z' FROM trainers`,
      )
      .run("00000000-0000-4000-8000-000000000332", JSON.stringify({ encounterId }))
  })
}

function pendingEncounterIds(databasePath: string): readonly string[] {
  return withGameDatabase(databasePath, (database) =>
    database
      .query<{ readonly id: string }, []>(
        "SELECT id FROM pending_encounters ORDER BY insertion_order",
      )
      .all()
      .map(({ id }) => id),
  )
}

test("continuous mode consumes every encounter threshold and stale IDs never resolve another", () => {
  let draws = 0
  const fixture = createGameFixture({
    config: continuousConfig,
    random: () => {
      draws += 1
      return 0
    },
  })
  try {
    withGameDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
    })

    const generated = fixture.game.recordUsage(usage("cross-three-thresholds", 35))
    const ids = pendingEncounterIds(fixture.databasePath)
    const firstId = ids[0]
    const thirdId = ids[2]
    if (firstId === undefined || thirdId === undefined)
      throw new Error("Expected three queued encounters")
    expect(generated.kind).toBe("applied")
    expect(generated.state.pendingEncounterCount).toBe(3)
    expect(ids).toHaveLength(3)
    expect(generated.state.pendingEncounter?.id).toBe(firstId)

    const progress = withGameDatabase(fixture.databasePath, (database) =>
      database
        .query<{ readonly tokenCount: number; readonly threshold: number }, []>(
          "SELECT token_count AS tokenCount, threshold FROM encounter_progress",
        )
        .get(),
    )
    expect(progress).toEqual({ tokenCount: 5, threshold: 10 })

    const unrelated = ids[1]
    if (unrelated === undefined) throw new Error("Expected a second encounter")
    const ran = fixture.game.runEncounter(unrelated)
    const drawsAfterResolve = draws
    const repeated = fixture.game.catchEncounter(unrelated)
    const foreign = fixture.game.runEncounter("00000000-0000-4000-8000-000000000099")
    const foreignCatch = fixture.game.catchEncounter("00000000-0000-4000-8000-000000000098")

    expect(ran.kind).toBe("ran")
    expect(ran.state.pendingEncounter?.id).toBe(firstId)
    expect(ran.state.pendingEncounterCount).toBe(2)
    expect(repeated.kind).toBe("no-encounter")
    expect(foreign.kind).toBe("no-encounter")
    expect(foreignCatch.kind).toBe("no-encounter")
    expect(draws).toBe(drawsAfterResolve)
    expect(pendingEncounterIds(fixture.databasePath)).toEqual([firstId, thirdId])
  } finally {
    fixture.dispose()
  }
})

test("continuous opportunities with no eligible species are consumed and retain the remainder", () => {
  const fixture = createGameFixture({ config: continuousConfig, random: () => 0 })
  try {
    withGameDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
      database.query<void, []>("UPDATE owned_pokemon SET level = 1").run()
    })

    const result = fixture.game.recordUsage(usage("consume-ineligible-opportunities", 35))
    const progress = withGameDatabase(fixture.databasePath, (database) =>
      database
        .query<{ readonly tokenCount: number; readonly threshold: number }, []>(
          "SELECT token_count AS tokenCount, threshold FROM encounter_progress",
        )
        .get(),
    )

    expect(result.kind).toBe("applied")
    expect(result.state.pendingEncounterCount).toBe(0)
    expect(progress).toEqual({ tokenCount: 5, threshold: 10 })
  } finally {
    fixture.dispose()
  }
})

test("encounter queues survive reopen and switching to pause mode freezes only new usage", () => {
  const fixture = createGameFixture({ config: continuousConfig, random: () => 0 })
  try {
    withGameDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
    })
    const beforeRestart = fixture.game.recordUsage(usage("queue-before-restart", 25))
    const ids = pendingEncounterIds(fixture.databasePath)
    expect(beforeRestart.state.pendingEncounterCount).toBe(2)

    const pauseConfig: GameplayConfig = { ...continuousConfig, pauseOnPendingChoice: true }
    const reopened = fixture.reopen(pauseConfig)
    const afterRestart = reopened.status()
    const frozen = reopened.recordUsage(usage("queue-after-mode-switch", 20))

    expect(afterRestart.pendingEncounterCount).toBe(2)
    expect(afterRestart.pendingEncounter?.id).toBe(ids[0])
    expect(frozen.kind).toBe("frozen-discarded")
    expect(frozen.state.pendingEncounterCount).toBe(2)
    for (const id of ids) expect(reopened.runEncounter(id).kind).toBe("ran")
    expect(reopened.status().pendingEncounterCount).toBe(0)
    const continuousAgain = fixture.reopen(continuousConfig)
    expect(continuousAgain.recordUsage(usage("queue-after-mode-switch", 20)).kind).toBe("duplicate")
    expect(continuousAgain.recordUsage(usage("after-queue-drained", 1)).kind).toBe("applied")
  } finally {
    fixture.dispose()
  }
})

test("continuous encounter opportunities atomically exhaust specials only once", () => {
  const fixture = createGameFixture({
    config: { ...continuousConfig, encounterMinimumTokens: 1, encounterMaximumTokens: 1 },
    random: () => 0,
    withStarter: false,
  })
  try {
    fixture.game.chooseStarter("johto", "chikorita")
    withGameDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE owned_pokemon SET level = 40").run()
    })

    const result = fixture.game.recordUsage(usage("several-roamer-opportunities", 5))
    const triggered = withGameDatabase(fixture.databasePath, (database) =>
      database
        .query<{ readonly specialEncounterId: string }, []>(
          "SELECT special_encounter_id AS specialEncounterId FROM triggered_special_encounters ORDER BY special_encounter_id",
        )
        .all()
        .map(({ specialEncounterId }) => specialEncounterId),
    )
    fixture.reopen()
    fixture.game.recordUsage(usage("after-special-reopen", 1))
    const triggeredAfterReopen = withGameDatabase(
      fixture.databasePath,
      (database) =>
        database
          .query<{ readonly count: number }, []>(
            "SELECT COUNT(*) AS count FROM triggered_special_encounters",
          )
          .get()?.count,
    )

    expect(result.kind).toBe("applied")
    expect(triggered).toEqual(["johto-entei", "johto-raikou", "johto-suicune"])
    expect(triggeredAfterReopen).toBe(3)
  } finally {
    fixture.dispose()
  }
})

test("branching evolution defers only its Pokémon and resumes saved XP despite other choices", () => {
  const fixture = createGameFixture({
    config: {
      ...continuousConfig,
      encounterMinimumTokens: 100_000_000,
      encounterMaximumTokens: 100_000_000,
    },
  })
  try {
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected starter")
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>(
          "UPDATE owned_pokemon SET species_id = 'eevee', name = 'Eevee', level = 24, experience = 0 WHERE id = ?1",
        )
        .run(pokemonId)
      database
        .query<void, [string]>(
          `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at)
           SELECT ?1, id, 'region', '{"region":"kanto"}', '2026-10-16T00:00:00.000Z' FROM trainers`,
        )
        .run("00000000-0000-4000-8000-000000000090")
    })

    const branchTokens = tokensForExperienceBetween("eevee", 24, 25)
    const queued = fixture.game.recordUsage(usage("reach-eevee-branch", branchTokens))
    const branch = queued.state.pendingChoices.find((choice) => choice.kind === "evolution")
    if (branch === undefined) throw new Error("Expected an Eevee evolution choice")
    const accrued = fixture.game.recordUsage(
      usage("earn-behind-branch", tokensForExperienceBetween("eevee", 25, 27)),
    )
    const evolutionCount = accrued.state.pendingChoices.filter(
      (choice) => choice.kind === "evolution",
    ).length

    // Move the subject into the PC before resolving; its identity and XP remain durable.
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>("UPDATE party_slots SET pokemon_id = NULL WHERE pokemon_id = ?1")
        .run(pokemonId)
    })
    const resolved = fixture.game.resolveEvolutionChoice(branch.id, "jolteon")
    const evolved = fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId)

    expect(queued.state.party[0]?.pokemon).toMatchObject({ speciesId: "eevee", level: 25 })
    expect(evolutionCount).toBe(1)
    expect(accrued.state.pendingChoices.some((choice) => choice.kind === "region")).toBe(true)
    expect(resolved.kind).toBe("resolved")
    expect(resolved.state.pendingChoices.some((choice) => choice.kind === "region")).toBe(true)
    expect(evolved).toMatchObject({ speciesId: "jolteon", level: 27, experience: 0 })
  } finally {
    fixture.dispose()
  }
})

test.each([
  ["branch resolves last", false],
  ["branch resolves before the final move choice", true],
] as const)("pause mode resumes off-party branch XP when %s", (_name, resolveBranchFirst) => {
  const fixture = createGameFixture({ config: pausedProgressionConfig })
  try {
    const { pokemonId, branchChoiceId } = queuePausedEeveeBranch(fixture)
    const unrelatedMoveId = "00000000-0000-4000-8000-000000000331"
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>("UPDATE party_slots SET pokemon_id = NULL WHERE pokemon_id = ?1")
        .run(pokemonId)
    })
    moveChoice(fixture, pokemonId, unrelatedMoveId)

    if (resolveBranchFirst) {
      const branch = fixture.game.resolveEvolutionChoice(branchChoiceId, "jolteon")
      const beforeDrain = fixture.game
        .collection()
        .pokemon.find((pokemon) => pokemon.id === pokemonId)
      expect(branch.kind).toBe("resolved")
      expect(beforeDrain).toMatchObject({ speciesId: "jolteon", level: 25 })
      expect(beforeDrain?.experience).toBeGreaterThan(0)
      fixture.reopen()
      expect(fixture.game.resolveMoveChoice(unrelatedMoveId, "tackle").kind).toBe("resolved")
    } else {
      expect(fixture.game.resolveMoveChoice(unrelatedMoveId, "tackle").kind).toBe("resolved")
      expect(
        fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId),
      ).toMatchObject({ speciesId: "eevee", level: 25 })
      fixture.reopen()
      expect(fixture.game.resolveEvolutionChoice(branchChoiceId, "jolteon").kind).toBe("resolved")
    }

    expect(
      fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId),
    ).toMatchObject({
      speciesId: "jolteon",
      level: 27,
      experience: 0,
    })
  } finally {
    fixture.dispose()
  }
})

test.each(["catch", "run"] as const)(
  "pause mode drains off-party saved XP when the final encounter is resolved by %s",
  (action) => {
    const fixture = createGameFixture({ config: pausedProgressionConfig })
    try {
      const { pokemonId, branchChoiceId } = queuePausedEeveeBranch(fixture)
      const encounterId = "00000000-0000-4000-8000-000000000333"
      withGameDatabase(fixture.databasePath, (database) => {
        database
          .query<void, [string]>("UPDATE party_slots SET pokemon_id = NULL WHERE pokemon_id = ?1")
          .run(pokemonId)
      })
      queueCatch(fixture, encounterId)

      expect(fixture.game.resolveEvolutionChoice(branchChoiceId, "jolteon").kind).toBe("resolved")
      expect(
        fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId),
      ).toMatchObject({ speciesId: "jolteon", level: 25 })
      fixture.reopen()
      const resolved =
        action === "catch"
          ? fixture.game.catchEncounter(encounterId)
          : fixture.game.runEncounter(encounterId)
      expect(resolved.kind).toBe(action === "catch" ? "caught" : "ran")
      expect(
        fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId),
      ).toMatchObject({
        speciesId: "jolteon",
        level: 27,
        experience: 0,
      })
    } finally {
      fixture.dispose()
    }
  },
)

test("clearing the final catch does not evolve an XP-zero capture as a side effect", () => {
  const fixture = createGameFixture({ config: pausedProgressionConfig })
  const encounterId = "00000000-0000-4000-8000-000000000335"
  try {
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>(
          `INSERT INTO pending_encounters (
             id, trainer_id, kind, species_id, name, level, sprite_url, ability, gender,
             shiny, special_encounter_id, created_at, insertion_order
           )
           SELECT ?1, id, 'ordinary', 'azurill', 'Azurill', 30,
             'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/298.png',
             'Huge Power', 'female', 0, NULL, '2026-10-16T00:00:00.000Z', 1
           FROM trainers`,
        )
        .run(encounterId)
      database
        .query<void, [string, string]>(
          `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at)
           SELECT ?1, id, 'catch', ?2, '2026-10-16T00:00:00.000Z' FROM trainers`,
        )
        .run("00000000-0000-4000-8000-000000000336", JSON.stringify({ encounterId }))
    })

    const result = fixture.game.catchEncounter(encounterId)
    const captured = result.state.party
      .flatMap((slot) => (slot.pokemon === null ? [] : [slot.pokemon]))
      .find((pokemon) => pokemon.speciesId === "azurill")

    expect(result.kind).toBe("caught")
    expect(captured).toMatchObject({ speciesId: "azurill", level: 30, experience: 0 })
  } finally {
    fixture.dispose()
  }
})

test("pause mode drains off-party saved XP after choosing the new region's starter", () => {
  const fixture = createGameFixture({ config: pausedProgressionConfig })
  try {
    const { pokemonId, branchChoiceId } = queuePausedEeveeBranch(fixture)
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>("UPDATE party_slots SET pokemon_id = NULL WHERE pokemon_id = ?1")
        .run(pokemonId)
      database
        .query<void, []>("UPDATE region_progress SET completed = 1 WHERE region_id = 'kanto'")
        .run()
      database
        .query<void, [string]>(
          `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at)
           SELECT ?1, id, 'region', '{"region":"kanto"}', '2026-10-16T00:00:00.000Z' FROM trainers`,
        )
        .run("00000000-0000-4000-8000-000000000334")
    })

    expect(fixture.game.resolveEvolutionChoice(branchChoiceId, "jolteon").kind).toBe("resolved")
    expect(
      fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId),
    ).toMatchObject({ speciesId: "jolteon", level: 25 })
    fixture.reopen()
    const traveled = fixture.game.travelToRegion("johto")

    expect(traveled.kind).toBe("traveled")
    expect(
      fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId),
    ).toMatchObject({ speciesId: "jolteon", level: 25 })
    expect(fixture.game.chooseStarter("johto", "chikorita").kind).toBe("selected")
    expect(
      fixture.game.collection().pokemon.find((pokemon) => pokemon.id === pokemonId),
    ).toMatchObject({
      speciesId: "jolteon",
      level: 27,
      experience: 0,
    })
  } finally {
    fixture.dispose()
  }
})

test("duplicate queued move prompts are suppressed and stale known-move prompts resolve safely", () => {
  const fixture = createGameFixture({
    config: {
      ...continuousConfig,
      encounterMinimumTokens: 100_000_000,
      encounterMaximumTokens: 100_000_000,
    },
  })
  try {
    fixture.game.recordUsage(
      usage("ivysaur-level-16", tokensForExperienceBetween("bulbasaur", 5, 16)),
    )
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected starter")
    fixture.game.recordUsage(
      usage("ivysaur-level-22", tokensForExperienceBetween("ivysaur", 16, 22)),
    )
    const prompt = fixture.game
      .status()
      .pendingChoices.find(
        (choice) => choice.kind === "move" && choice.payload.includes("razor-leaf"),
      )
    if (prompt === undefined) throw new Error("Expected a Razor Leaf choice")

    // Reprocess the same learning milestone while its first prompt is still pending.
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>("UPDATE owned_pokemon SET level = 21, experience = 0 WHERE id = ?1")
        .run(pokemonId)
    })
    const retried = fixture.game.recordUsage(
      usage("revisit-razor-leaf-milestone", tokensForExperienceBetween("ivysaur", 21, 22)),
    )
    expect(
      retried.state.pendingChoices.filter(
        (choice) => choice.kind === "move" && choice.payload.includes("razor-leaf"),
      ),
    ).toHaveLength(1)

    // The move became known through another route while this prompt was queued.
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>("DELETE FROM pokemon_moves WHERE pokemon_id = ?1")
        .run(pokemonId)
      database
        .query<void, [string, number, string, string]>(
          "INSERT INTO pokemon_moves (pokemon_id, position, move_id, move_name) VALUES (?1, ?2, ?3, ?4)",
        )
        .run(pokemonId, 1, "razor-leaf", "Razor Leaf")
      database
        .query<void, [string, number, string, string]>(
          "INSERT INTO pokemon_moves (pokemon_id, position, move_id, move_name) VALUES (?1, ?2, ?3, ?4)",
        )
        .run(pokemonId, 2, "tackle", "Tackle")
    })
    const resolved = fixture.game.resolveMoveChoice(prompt.id, "tackle")
    const moves = resolved.state.party[0]?.pokemon?.moves.map((move) => move.id)

    expect(resolved.kind).toBe("resolved")
    expect(moves).toContain("razor-leaf")
    expect(moves).toContain("tackle")
  } finally {
    fixture.dispose()
  }
})
