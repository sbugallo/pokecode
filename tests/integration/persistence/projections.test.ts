import { expect, test } from "bun:test"
import { formatShowdownTeam } from "../../../src/adapters/showdown/format-team.js"
import { openGameRepository } from "../../../src/adapters/sqlite/game-repository.js"
import type { GameplayConfig, UsageInput } from "../../../src/application/contracts/game.js"
import { createApplicationGame } from "../../../src/application/game.js"
import { speciesIdSchema } from "../../../src/domain/shared/identifiers.js"
import { createGameFixture, withGameDatabase as withDatabase } from "../../support/game.js"

function usage(messageId: string, inputTokens: number): UsageInput {
  return {
    sessionId: "projection-session",
    messageId,
    inputTokens,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    completedAt: "2026-10-15T00:00:00.000Z",
  }
}

function insertChoice(
  path: string,
  choice: { readonly id: string; readonly kind: string; readonly payload: string },
  createdAt: string,
): void {
  withDatabase(path, (database) => {
    const trainer = database.query<{ readonly id: string }, []>("SELECT id FROM trainers").get()
    if (trainer === null) throw new Error("Expected a trainer")
    database
      .query<void, [string, string, string, string, string]>(
        "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .run(choice.id, trainer.id, choice.kind, choice.payload, createdAt)
  })
}

test("gameplay thresholds project the current configuration while progress survives reconfiguration", () => {
  // GIVEN
  const initialConfig: GameplayConfig = {
    pauseOnPendingChoice: true,
    encounterMinimumTokens: 100_000,
    encounterMaximumTokens: 100_000,
    locationUnlockBaseTokens: 100,
    locationUnlockExponent: 1,
    locationUnlockRegionExponent: 0,
  }
  const fixture = createGameFixture({ config: initialConfig })
  let reopenedRepository: ReturnType<typeof openGameRepository> | undefined

  try {
    // WHEN
    const progress = fixture.game.recordUsage(usage("threshold-progress", 25))
    fixture.closeRepository(fixture.repository)
    reopenedRepository = openGameRepository(fixture.databasePath)
    const reconfiguredGame = createApplicationGame({
      repository: reopenedRepository,
      random: () => 0,
      now: () => "2026-10-15T00:00:00.000Z",
      config: { ...initialConfig, locationUnlockBaseTokens: 200 },
      createId: () => "00000000-0000-4000-8000-000000000008",
      createStarterIds: () => ({
        trainerId: "00000000-0000-4000-8000-000000000006",
        pokemonId: "00000000-0000-4000-8000-000000000007",
      }),
      formatTeam: formatShowdownTeam,
    })
    const projected = reconfiguredGame.status()

    // THEN
    expect(progress.state.exploration).toMatchObject({
      locationUnlockProgress: 25,
      locationUnlockThreshold: 100,
    })
    expect(projected.exploration).toMatchObject({
      locationUnlockProgress: 25,
      locationUnlockThreshold: 200,
    })
  } finally {
    reopenedRepository?.close()
    fixture.dispose()
  }
})

test("onboarding and active state project six ordered slots and exact move objects", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false })

  try {
    const onboarding = fixture.game.status()
    const emptyCollection = fixture.game.collection()
    const unknownDex = fixture.game.dex()

    // WHEN
    fixture.game.chooseStarter("kanto", "bulbasaur")
    const active = fixture.game.status()
    const collection = fixture.game.collection()
    const expectedMoves = [
      { id: "growl", name: "Growl" },
      { id: "tackle", name: "Tackle" },
      { id: "vine-whip", name: "Vine Whip" },
    ]

    // THEN
    expect(onboarding.party.map((slot) => slot.position)).toEqual([1, 2, 3, 4, 5, 6])
    expect(emptyCollection).toEqual({ pokemon: [] })
    expect(unknownDex.pokemon).toHaveLength(1025)
    expect(unknownDex.pokemon.every((entry) => entry.status === "unknown")).toBe(true)
    expect(active.party.map((slot) => slot.position)).toEqual([1, 2, 3, 4, 5, 6])
    expect(active.party[0]?.pokemon?.moves).toEqual(expectedMoves)
    expect(collection.pokemon[0]?.moves).toEqual(expectedMoves)
    expect(Object.keys(collection.pokemon[0]?.moves[0] ?? {}).sort()).toEqual(["id", "name"])
    expect(active.party[0]?.pokemon?.moves[0]).not.toHaveProperty("position")
  } finally {
    fixture.dispose()
  }
})

test("pending-choice projection preserves choice priority and timestamp order", () => {
  // GIVEN
  const fixture = createGameFixture({
    config: {
      pauseOnPendingChoice: true,
      encounterMinimumTokens: 1,
      encounterMaximumTokens: 1,
      locationUnlockBaseTokens: 100_000,
      locationUnlockExponent: 1,
      locationUnlockRegionExponent: 0,
    },
    random: () => 0,
  })

  try {
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected a starter")
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
    })
    const encounter = fixture.game.recordUsage(usage("create-caught-pokemon", 1)).state
      .pendingEncounter
    if (encounter === null) throw new Error("Expected a pending encounter")
    fixture.game.catchEncounter(encounter.id)
    const caughtId = fixture.game.collection().pokemon[1]?.id
    if (caughtId === undefined) throw new Error("Expected a caught Pokémon")

    const choices = [
      {
        id: "00000000-0000-4000-8000-000000000301",
        kind: "move",
        payload: JSON.stringify({ pokemonId, move: { id: "old", name: "Old" } }),
        createdAt: "2026-10-14T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000302",
        kind: "move",
        payload: JSON.stringify({ pokemonId, move: { id: "new", name: "New" } }),
        createdAt: "2026-10-14T00:00:01.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000303",
        kind: "move",
        payload: JSON.stringify({ pokemonId: caughtId, move: { id: "caught", name: "Caught" } }),
        createdAt: "2026-10-13T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000304",
        kind: "evolution",
        payload: JSON.stringify({
          pokemonId: caughtId,
          options: [{ speciesId: "pidgeotto", name: "Pidgeotto" }],
        }),
        createdAt: "2026-10-12T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000305",
        kind: "evolution",
        payload: JSON.stringify({
          pokemonId,
          options: [{ speciesId: "ivysaur", name: "Ivysaur" }],
        }),
        createdAt: "2026-10-11T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000306",
        kind: "catch",
        payload: JSON.stringify({ encounterId: "00000000-0000-4000-8000-000000000306" }),
        createdAt: "2026-10-10T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000307",
        kind: "region",
        payload: '{"region":"kanto"}',
        createdAt: "2026-10-09T00:00:00.000Z",
      },
    ] as const
    for (const { createdAt, ...choice } of choices)
      insertChoice(fixture.databasePath, choice, createdAt)

    // WHEN
    const state = fixture.reopen().status()

    // THEN
    expect(state.pendingChoices.map((choice) => choice.id)).toEqual([
      "00000000-0000-4000-8000-000000000301",
      "00000000-0000-4000-8000-000000000302",
      "00000000-0000-4000-8000-000000000303",
      "00000000-0000-4000-8000-000000000305",
      "00000000-0000-4000-8000-000000000304",
      "00000000-0000-4000-8000-000000000306",
      "00000000-0000-4000-8000-000000000307",
    ])
    expect(state.pendingChoices.find((choice) => choice.id === choices[5].id)?.payload).toBe(
      JSON.stringify({ encounterId: "00000000-0000-4000-8000-000000000306" }),
    )
    expect(state.pendingChoices.find((choice) => choice.id === choices[6].id)?.payload).toBe(
      '{"region":"kanto"}',
    )
  } finally {
    fixture.dispose()
  }
})

test("Dex projection tracks seen and caught status for party and PC Pokémon and regional forms", () => {
  // GIVEN
  const fixture = createGameFixture({
    config: {
      pauseOnPendingChoice: true,
      encounterMinimumTokens: 1,
      encounterMaximumTokens: 1,
      locationUnlockBaseTokens: 100_000,
      locationUnlockExponent: 1,
      locationUnlockRegionExponent: 0,
    },
    random: () => 0,
  })

  try {
    const starterId = fixture.game.status().party[0]?.pokemon?.id
    if (starterId === undefined) throw new Error("Expected a starter")
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE trainers SET current_location_id = 'kanto-route-1'").run()
    })

    // WHEN
    const encountered = fixture.game.recordUsage(usage("see-pidgey", 1))
    const pendingEncounter = encountered.state.pendingEncounter
    const speciesId = pendingEncounter?.speciesId
    if (pendingEncounter === null) throw new Error("Expected a pending encounter")
    const seenDex = fixture.game.dex()
    fixture.game.catchEncounter(pendingEncounter.id)
    const caughtId = fixture.game
      .collection()
      .pokemon.find((pokemon) => pokemon.speciesId === speciesId)?.id
    if (caughtId === undefined) throw new Error("Expected the caught Pokémon in the collection")
    const removedFromParty = fixture.game.replaceParty([starterId])
    const partyAfterRemoval = fixture.game.status().party
    const collectionAfterRemoval = fixture.game.collection().pokemon
    const repeated = fixture.game.recordUsage(usage("repeat-pidgey", 1))
    withDatabase(fixture.databasePath, (database) => {
      database
        .query<void, []>(
          "INSERT INTO pokedex_entries (trainer_id, species_id, seen, caught) SELECT id, 'raichu-alola', 1, 0 FROM trainers",
        )
        .run()
    })
    const regionalFormSeen = fixture.game
      .dex()
      .pokemon.find((entry) => entry.speciesId === "raichu")
    withDatabase(fixture.databasePath, (database) => {
      database
        .query<void, []>(
          "INSERT INTO pokedex_entries (trainer_id, species_id, seen, caught) SELECT id, 'raichu', 1, 1 FROM trainers",
        )
        .run()
    })
    const finalProjection = fixture.game.dex()
    const finalDex = finalProjection.pokemon

    // THEN
    expect(seenDex.pokemon).toHaveLength(1025)
    expect(seenDex.pokemon.find((entry) => entry.speciesId === "bulbasaur")?.status).toBe("caught")
    expect(seenDex.pokemon.find((entry) => entry.speciesId === speciesId)?.status).toBe("seen")
    expect(removedFromParty.kind).toBe("replaced")
    expect(
      partyAfterRemoval.flatMap((slot) => (slot.pokemon ? [String(slot.pokemon.id)] : [])),
    ).not.toContain(String(caughtId))
    expect(collectionAfterRemoval.map((pokemon) => String(pokemon.id))).toContain(String(caughtId))
    expect(repeated.state.pendingEncounter?.caught).toBe(true)
    expect(regionalFormSeen?.status).toBe("seen")
    expect(finalDex.find((entry) => entry.speciesId === "raichu")?.number).toBe(26)
    expect(finalDex.find((entry) => entry.speciesId === "raichu")?.status).toBe("caught")
    expect(finalProjection.discoveries).toContainEqual({
      speciesId: speciesIdSchema.parse("raichu"),
      status: "caught",
    })
    expect(finalProjection.discoveries).toContainEqual({
      speciesId: speciesIdSchema.parse("raichu-alola"),
      status: "seen",
    })
    expect(finalDex.map((entry) => entry.number)).toEqual(
      [...finalDex].map((entry) => entry.number).toSorted((left, right) => left - right),
    )
    expect(finalDex.find((entry) => entry.speciesId === "mewtwo")?.status).toBe("unknown")
  } finally {
    fixture.dispose()
  }
})

test.each([
  { discovered: "moltres", encountered: "moltres-galar", caught: 1, expected: false },
  { discovered: "moltres-galar", encountered: "moltres", caught: 1, expected: false },
  { discovered: "moltres-galar", encountered: "moltres-galar", caught: 0, expected: false },
  { discovered: "moltres-galar", encountered: "moltres-galar", caught: 1, expected: true },
  { discovered: "moltres", encountered: "moltres", caught: 1, expected: true },
])(
  "encounter caught marker matches the exact form ($discovered / $encountered / $caught)",
  ({ discovered, encountered, caught, expected }) => {
    const fixture = createGameFixture()
    try {
      withDatabase(fixture.databasePath, (database) => {
        database.run(
          "INSERT INTO pokedex_entries (trainer_id,species_id,seen,caught) SELECT id,?,1,? FROM trainers",
          [discovered, caught],
        )
        database.run(
          `INSERT INTO pending_encounters
        (id,trainer_id,kind,species_id,name,level,sprite_url,ability,gender,shiny,created_at)
        SELECT '00000000-0000-4000-8000-000000000501',id,'special',?,'Moltres',70,'https://example.test/moltres.png','pressure','genderless',0,'2026-10-15T00:00:00.000Z' FROM trainers`,
          [encountered],
        )
      })
      expect(fixture.game.status().pendingEncounter?.caught).toBe(expected)
      expect(fixture.reopen().status().pendingEncounter?.caught).toBe(expected)
      expect(fixture.game.dex().discoveries).toContainEqual({
        speciesId: speciesIdSchema.parse(discovered),
        status: caught === 1 ? "caught" : "seen",
      })
    } finally {
      fixture.dispose()
    }
  },
)
