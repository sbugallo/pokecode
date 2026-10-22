import { expect, test } from "bun:test"
import type { UsageInput } from "../../../src/application/contracts/game.js"
import type { PokemonGender } from "../../../src/domain/pokemon/types.js"
import { experienceForNextLevel, progressionFor } from "../../../src/domain/progression/catalog.js"
import { speciesIdSchema } from "../../../src/domain/shared/identifiers.js"
import { tokensPerExperiencePoint } from "../../../src/domain/usage/usage.js"
import { createGameFixture, withGameDatabase } from "../../support/game.js"

const config = {
  pauseOnPendingChoice: true,
  encounterMinimumTokens: 10_000_000_000,
  encounterMaximumTokens: 10_000_000_000,
  locationUnlockBaseTokens: 10_000_000_000,
  locationUnlockExponent: 1,
  locationUnlockRegionExponent: 0,
}

function usage(messageId: string, inputTokens: number): UsageInput {
  return {
    sessionId: "evolution-regressions",
    messageId,
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-16T00:00:00.000Z",
  }
}

function experienceBetween(speciesId: string, from: number, to: number): number {
  let total = 0
  for (let level = from; level < to; level += 1) {
    total += experienceForNextLevel(progressionFor(speciesId).growthRate, level)
  }
  return total
}

function preparePokemon(
  fixture: ReturnType<typeof createGameFixture>,
  speciesId: string,
  level: number,
  region = "kanto",
  gender: PokemonGender = "male",
): string {
  const id = fixture.game.status().party[0]?.pokemon?.id
  if (id === undefined) throw new Error("Expected starter")
  withGameDatabase(fixture.databasePath, (database) => {
    database
      .query<void, [string, number, string, PokemonGender]>(
        "UPDATE owned_pokemon SET species_id = ?1, level = ?2, experience = 0, gender = ?4 WHERE id = ?3",
      )
      .run(speciesId, level, id, gender)
    database.query<void, [string]>("DELETE FROM pokemon_moves WHERE pokemon_id = ?1").run(id)
    database.query<void, [string]>("UPDATE trainers SET current_region_id = ?1").run(region)
  })
  return id
}

test.each([
  ["kirlia", 29, 30, "gallade"],
  ["poliwhirl", 35, 36, "politoed"],
  ["slowpoke", 36, 37, "slowking"],
  ["scyther", 44, 45, "scizor"],
  ["nincada", 19, 20, "shedinja"],
  ["snorunt", 41, 42, "glalie"],
  ["applin", 27, 28, "flapple"],
] as const)("%s can select its formerly blocked branch", (id, from, to, target) => {
  // GIVEN
  const fixture = createGameFixture({ config })
  try {
    preparePokemon(fixture, id, from, "kanto", id === "snorunt" ? "female" : "male")

    // WHEN
    const queued = fixture.game.recordUsage(
      usage(id, experienceBetween(id, from, to) * tokensPerExperiencePoint),
    )
    const choice = queued.state.pendingChoices.find((entry) => entry.kind === "evolution")
    if (choice === undefined) throw new Error(`Missing evolution choice for ${id}`)
    const resolved = fixture.game.resolveEvolutionChoice(choice.id, target)

    // THEN
    expect(queued.state.party[0]?.pokemon).toMatchObject({ speciesId: id, level: to })
    expect(resolved.kind).toBe("resolved")
    expect(resolved.state.party[0]?.pokemon).toMatchObject({ speciesId: target, level: to })
    expect(String(fixture.reopen().status().party[0]?.pokemon?.speciesId)).toBe(target)
  } finally {
    fixture.dispose()
  }
})

for (const pauseOnPendingChoice of [true, false]) {
  test.each([
    ["kirlia", 30, "male", ["gardevoir", "gallade"]],
    ["kirlia", 30, "female", ["gardevoir"]],
    ["snorunt", 42, "male", ["glalie"]],
    ["snorunt", 42, "female", ["glalie", "froslass"]],
    ["burmy", 20, "male", ["mothim"]],
    ["burmy", 20, "female", ["wormadam"]],
    ["combee", 21, "male", []],
    ["combee", 21, "female", ["vespiquen"]],
    ["salandit", 30, "male", []],
    ["salandit", 30, "female", ["salazzle"]],
  ] as const)(
    `%s at level %i respects %s eligibility (pause=${pauseOnPendingChoice})`,
    (speciesId, level, gender, targets) => {
      const fixture = createGameFixture({ config: { ...config, pauseOnPendingChoice } })
      try {
        preparePokemon(fixture, speciesId, level - 1, "kanto", gender)
        const queued = fixture.game.recordUsage(
          usage(
            `${speciesId}-${gender}`,
            experienceBetween(speciesId, level - 1, level) * tokensPerExperiencePoint,
          ),
        )
        const choices = queued.state.pendingChoices.filter((entry) => entry.kind === "evolution")
        if (targets.length > 1) {
          expect(queued.state.party[0]?.pokemon).toMatchObject({ speciesId, gender, level })
          expect(choices).toHaveLength(1)
          const choice = choices[0]
          if (choice === undefined) throw new Error("Missing gender-eligible branch choice")
          expect(
            JSON.parse(choice.payload).options.map((t: { speciesId: string }) => t.speciesId),
          ).toEqual([...targets])
          const target = targets[1]
          if (target === undefined) throw new Error("Missing branch target")
          const resolved = fixture.reopen().resolveEvolutionChoice(choice.id, target)
          expect(resolved.kind).toBe("resolved")
          expect(resolved.state.party[0]?.pokemon).toMatchObject({
            speciesId: target,
            gender,
            level,
          })
        } else {
          expect(choices).toHaveLength(0)
          expect(queued.state.party[0]?.pokemon).toMatchObject({
            speciesId: targets[0] ?? speciesId,
            gender,
            level,
          })
        }
        expect(fixture.reopen().status().party[0]?.pokemon).toMatchObject({
          speciesId: targets.at(-1) ?? speciesId,
          gender,
          level,
        })
      } finally {
        fixture.dispose()
      }
    },
  )
}

test.each(["combee", "salandit"])("male %s keeps leveling without evolving", (speciesId) => {
  const fixture = createGameFixture({ config })
  try {
    preparePokemon(fixture, speciesId, 99)
    const result = fixture.game.recordUsage(
      usage(speciesId, experienceBetween(speciesId, 99, 100) * tokensPerExperiencePoint),
    )
    expect(result.state.party[0]?.pokemon).toMatchObject({ speciesId, gender: "male", level: 100 })
    expect(result.state.pendingChoices.filter((entry) => entry.kind === "evolution")).toHaveLength(
      0,
    )
  } finally {
    fixture.dispose()
  }
})

test.each([
  ["kirlia", 30, "female", "gardevoir", "gallade", "gardevoir"],
  ["snorunt", 42, "male", "glalie", "froslass", "glalie"],
  ["burmy", 20, "female", "wormadam", "mothim", "wormadam"],
  ["burmy", 20, "male", "wormadam", "mothim", "mothim"],
] as const)(
  "repairs saved %s choices at level %i for %s",
  (speciesId, level, gender, first, second, expected) => {
    const fixture = createGameFixture({ config })
    try {
      const pokemonId = preparePokemon(fixture, speciesId, level, "kanto", gender)
      const choiceId = "00000000-0000-4000-8000-999999999999"
      withGameDatabase(fixture.databasePath, (database) => {
        database
          .query(`INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at, insertion_order)
        SELECT ?1, trainer_id, 'evolution', ?2, '2026-10-16T00:00:00.000Z', 1
        FROM owned_pokemon WHERE id = ?3`)
          .run(
            choiceId,
            JSON.stringify({
              pokemonId,
              options: [first, second].map((id) => ({ speciesId: id, name: id })),
            }),
            pokemonId,
          )
        // A saved evolution choice must also be safe for a Pokémon moved to the PC.
        database
          .query("UPDATE party_slots SET pokemon_id = NULL WHERE pokemon_id = ?1")
          .run(pokemonId)
      })
      const invalidTarget = first === expected ? second : first
      const result = fixture.reopen().resolveEvolutionChoice(choiceId, invalidTarget)
      expect(result.kind).toBe("invalid-choice")
      expect(
        result.state.pendingChoices.filter((entry) => entry.kind === "evolution"),
      ).toHaveLength(0)
      expect(fixture.game.collection().pokemon.find((p) => p.id === pokemonId)).toMatchObject({
        speciesId: expected,
        gender,
        level,
      })
    } finally {
      fixture.dispose()
    }
  },
)

test("a large XP award pauses at the evolution choice and resumes after reopening", () => {
  // GIVEN
  const fixture = createGameFixture({ config })
  try {
    preparePokemon(fixture, "applin", 27)
    const remainder = experienceBetween("dipplin", 28, 50) + experienceBetween("hydrapple", 50, 51)

    // WHEN
    const queued = fixture.game.recordUsage(
      usage(
        "large-award",
        (experienceBetween("applin", 27, 28) + remainder) * tokensPerExperiencePoint,
      ),
    )
    const choice = queued.state.pendingChoices.find((entry) => entry.kind === "evolution")
    if (choice === undefined) throw new Error("Missing Applin choice")
    const reopened = fixture.reopen()
    const invalid = reopened.resolveEvolutionChoice(choice.id, "jolteon")
    const frozen = reopened.recordUsage(usage("while-pending", 100))
    const resolved = reopened.resolveEvolutionChoice(choice.id, "dipplin")

    // THEN
    expect(queued.state.party[0]?.pokemon).toMatchObject({
      speciesId: "applin",
      level: 28,
      experience: remainder,
    })
    expect(queued.state.pendingChoices.filter((entry) => entry.kind === "evolution")).toHaveLength(
      1,
    )
    expect(invalid.kind).toBe("invalid-choice")
    expect(frozen.kind).toBe("frozen-discarded")
    expect(resolved.kind).toBe("resolved")
    expect(resolved.state.party[0]?.pokemon).toMatchObject({
      speciesId: "hydrapple",
      level: 51,
      experience: 0,
    })
    expect(
      resolved.state.pendingChoices.filter((entry) => entry.kind === "evolution"),
    ).toHaveLength(0)
  } finally {
    fixture.dispose()
  }
})

test("remaining XP resumes after move choices generated by an evolution", () => {
  // GIVEN
  const fixture = createGameFixture({ config })
  try {
    const pokemonId = preparePokemon(fixture, "eevee", 24)
    withGameDatabase(fixture.databasePath, (database) => {
      for (const [position, id] of ["tackle", "growl", "tail-whip", "sand-attack"].entries()) {
        database
          .query<void, [string, number, string, string]>(
            "INSERT INTO pokemon_moves (pokemon_id, position, move_id, move_name) VALUES (?1, ?2, ?3, ?4)",
          )
          .run(pokemonId, position + 1, id, id)
      }
    })

    // WHEN
    const queued = fixture.game.recordUsage(
      usage("eevee-award", experienceBetween("eevee", 24, 26) * tokensPerExperiencePoint),
    )
    const choice = queued.state.pendingChoices.find((entry) => entry.kind === "evolution")
    if (choice === undefined) throw new Error("Missing Eevee choice")
    const selected = fixture.game.resolveEvolutionChoice(choice.id, "sylveon")
    const move = selected.state.pendingChoices.find((entry) => entry.kind === "move")
    if (move === undefined) throw new Error("Missing evolution move choice")
    const payload = JSON.parse(move.payload) as { move: { id: string } }
    const resolved = fixture.game.resolveMoveChoice(move.id, payload.move.id)

    // THEN
    expect(selected.state.party[0]?.pokemon).toMatchObject({ speciesId: "sylveon", level: 25 })
    expect(resolved.state.party[0]?.pokemon).toMatchObject({
      speciesId: "sylveon",
      level: 26,
      experience: 0,
    })
  } finally {
    fixture.dispose()
  }
})

test.each([
  ["staryu", 40, "starmie"],
  ["nidorino", 44, "nidoking"],
  ["staryu", 100, "starmie"],
  ["azurill", 30, "azumarill"],
] as const)("overdue %s at level %i can still evolve", (id, level, target) => {
  // GIVEN
  const fixture = createGameFixture({ config })
  try {
    preparePokemon(fixture, id, level)

    // WHEN
    const result = fixture.game.recordUsage(usage(`${id}-${level}`, 1))

    // THEN
    expect(result.state.party[0]?.pokemon).toMatchObject({ speciesId: target, level })
    expect(String(fixture.reopen().status().party[0]?.pokemon?.speciesId)).toBe(target)
  } finally {
    fixture.dispose()
  }
})

test("Galar's Mime Jr. route reaches Galarian Mr. Mime and then Mr. Rime", () => {
  // GIVEN
  const fixture = createGameFixture({ config })
  try {
    preparePokemon(fixture, "mime-jr", 19, "galar")

    // WHEN
    const first = fixture.game.recordUsage(
      usage("mime-jr", experienceBetween("mime-jr", 19, 20) * tokensPerExperiencePoint),
    )
    preparePokemon(fixture, "mr-mime-galar", 41, "galar")
    const second = fixture.game.recordUsage(
      usage("mr-mime-galar", experienceBetween("mr-mime-galar", 41, 42) * tokensPerExperiencePoint),
    )

    // THEN
    expect(String(first.state.party[0]?.pokemon?.speciesId)).toBe("mr-mime-galar")
    expect(String(second.state.party[0]?.pokemon?.speciesId)).toBe("mr-rime")
  } finally {
    fixture.dispose()
  }
})

test.each([
  ["staryu", 40, "starmie"],
  ["nidorino", 44, "nidoking"],
] as const)("evolving %s registers %s as seen and caught", (id, level, target) => {
  // GIVEN
  const fixture = createGameFixture({ config })
  try {
    preparePokemon(fixture, id, level)

    // WHEN
    const result = fixture.game.recordUsage(usage(`${id}-dex`, 1))

    // THEN
    expect(result.state.party[0]?.pokemon).toMatchObject({ speciesId: target, level })
    const dex = fixture.game.dex()
    expect(dex.pokemon.find((entry) => entry.speciesId === target)?.status).toBe("caught")
    expect(dex.discoveries).toContainEqual({
      speciesId: speciesIdSchema.parse(target),
      status: "caught",
    })
    expect(String(fixture.reopen().status().party[0]?.pokemon?.speciesId)).toBe(target)
  } finally {
    fixture.dispose()
  }
})

test("resolving a branched evolution choice registers the chosen species", () => {
  // GIVEN
  const fixture = createGameFixture({ config })
  try {
    preparePokemon(fixture, "kirlia", 29)

    // WHEN
    const queued = fixture.game.recordUsage(
      usage("kirlia-dex", experienceBetween("kirlia", 29, 30) * tokensPerExperiencePoint),
    )
    const choice = queued.state.pendingChoices.find((entry) => entry.kind === "evolution")
    if (choice === undefined) throw new Error("Missing evolution choice")
    const resolved = fixture.game.resolveEvolutionChoice(choice.id, "gallade")

    // THEN
    expect(resolved.kind).toBe("resolved")
    expect(resolved.state.party[0]?.pokemon).toMatchObject({ speciesId: "gallade", level: 30 })
    const dex = fixture.game.dex()
    expect(dex.pokemon.find((entry) => entry.speciesId === "gallade")?.status).toBe("caught")
    expect(dex.discoveries).toContainEqual({
      speciesId: speciesIdSchema.parse("gallade"),
      status: "caught",
    })
    // The branch not chosen stays undiscovered.
    expect(dex.pokemon.find((entry) => entry.speciesId === "gardevoir")?.status).toBe("unknown")
  } finally {
    fixture.dispose()
  }
})
