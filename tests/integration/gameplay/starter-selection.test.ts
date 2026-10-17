import { expect, test } from "bun:test"
import { formatShowdownTeam } from "../../../src/adapters/showdown/format-team.js"
import { openGameRepository } from "../../../src/adapters/sqlite/game-repository.js"
import { createApplicationGame } from "../../../src/application/game.js"
import { locationsForRegion, startersForRegion } from "../../../src/domain/content/catalog.js"
import { createGameFixture, usageTestConfig, withGameDatabase } from "../../support/game.js"

test("a selected starter and its active adventure survive reopening", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false, random: () => 0 })

  try {
    // WHEN
    const selection = fixture.game.chooseStarter("kanto", "bulbasaur")
    const reopened = fixture.reopen()
    const secondSelection = reopened.chooseStarter("kanto", "charmander")

    // THEN
    expect(selection.kind).toBe("selected")
    expect(secondSelection.kind).toBe("already-selected")
    expect(secondSelection.state.phase).toBe("active")
    expect(secondSelection.state.region).toBe("kanto")
    expect(secondSelection.state.location).toBe(String(locationsForRegion("kanto")[0]?.id))
    expect(secondSelection.state.party[0]).toMatchObject({
      position: 1,
      pokemon: {
        speciesId: "bulbasaur",
        ability: "Overgrow",
        nature: "Hardy",
        gender: "male",
        moves: [
          { id: "growl", name: "Growl" },
          { id: "tackle", name: "Tackle" },
          { id: "vine-whip", name: "Vine Whip" },
        ],
      },
    })
    expect(secondSelection.state.party).toHaveLength(6)
  } finally {
    fixture.dispose()
  }
})

test("starter selection rejects invalid choices and accepts a supported regional starter", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false })

  try {
    // WHEN
    const invalidRegion = fixture.game.chooseStarter("unknown-region", "bulbasaur")
    const invalidStarter = fixture.game.chooseStarter("kanto", "missingno")
    const otherRegionStarter = fixture.game.chooseStarter("johto", "bulbasaur")
    const selectedJohtoStarter = fixture.game.chooseStarter("johto", "chikorita")

    // THEN
    expect(invalidRegion.kind).toBe("invalid-region")
    expect(invalidStarter.kind).toBe("invalid-starter")
    expect(otherRegionStarter.kind).toBe("invalid-starter")
    expect(selectedJohtoStarter.kind).toBe("selected")
    expect(selectedJohtoStarter.state.region).toBe("johto")
    expect(selectedJohtoStarter.state.location).toBe(String(locationsForRegion("johto")[0]?.id))
    expect(String(selectedJohtoStarter.state.party[0]?.pokemon?.speciesId)).toBe("chikorita")
  } finally {
    fixture.dispose()
  }
})

test("a concurrent starter winner remains the durable selection", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false, random: () => 0 })
  let competingRepository: ReturnType<typeof openGameRepository> | undefined

  try {
    const repository = openGameRepository(fixture.databasePath)
    competingRepository = repository
    const competingGame = createApplicationGame({
      repository,
      random: () => 0,
      now: () => "2026-10-15T00:00:00.000Z",
      config: usageTestConfig,
      createId: () => "00000000-0000-4000-8000-000000000005",
      createStarterIds: () => ({
        trainerId: "00000000-0000-4000-8000-000000000003",
        pokemonId: "00000000-0000-4000-8000-000000000004",
      }),
      formatTeam: formatShowdownTeam,
    })
    let competingSelection: ReturnType<typeof competingGame.chooseStarter> | undefined
    let interleaved = false
    const firstGame = createApplicationGame({
      repository: fixture.repository,
      random: () => {
        if (!interleaved) {
          interleaved = true
          competingSelection = competingGame.chooseStarter("johto", "cyndaquil")
        }
        return 0
      },
      now: () => "2026-10-15T00:00:00.000Z",
      config: usageTestConfig,
      createId: () => "00000000-0000-4000-8000-000000000008",
      createStarterIds: () => ({
        trainerId: "00000000-0000-4000-8000-000000000006",
        pokemonId: "00000000-0000-4000-8000-000000000007",
      }),
      formatTeam: formatShowdownTeam,
    })

    // WHEN
    const losingSelection = firstGame.chooseStarter("kanto", "bulbasaur")

    // THEN
    expect(competingSelection?.kind).toBe("selected")
    expect(losingSelection.kind).toBe("already-selected")
    expect(String(repository.readState().party[0]?.pokemon?.speciesId)).toBe("cyndaquil")
    expect(interleaved).toBe(true)
  } finally {
    competingRepository?.close()
    fixture.dispose()
  }
})

test("unlocking Galar queues a durable regional starter choice and preserves the team", () => {
  const fixture = createGameFixture({ random: () => 0 })
  try {
    const original = fixture.game.status().party[0]?.pokemon
    withGameDatabase(fixture.databasePath, (db) =>
      db.run("UPDATE region_progress SET completed = 1"),
    )
    const traveled = fixture.game.travelToRegion("galar")
    expect(traveled.kind).toBe("traveled")
    expect(traveled.state.pendingChoices[0]).toMatchObject({
      kind: "starter",
      payload: JSON.stringify({ region: "galar" }),
    })
    const game = fixture.reopen()
    expect(game.status().pendingChoices).toEqual(traveled.state.pendingChoices)
    expect(game.chooseStarter("galar", "bulbasaur").kind).toBe("invalid-starter")
    expect(game.chooseStarter("johto", "chikorita").kind).toBe("already-selected")
    expect(game.chooseStarter("kanto", "charmander").kind).toBe("already-selected")
    expect(game.status().pendingChoices).toEqual(traveled.state.pendingChoices)

    const selected = game.chooseStarter("galar", "sobble")
    expect(selected.kind).toBe("selected")
    expect(selected.state.phase).toBe("active")
    expect(selected.state.region).toBe("galar")
    expect(selected.state.party[0]?.pokemon).toEqual(original)
    expect(selected.state.party[1]?.pokemon).toMatchObject({
      speciesId: "sobble",
      level: 5,
      experience: 0,
      shiny: false,
      moves: startersForRegion("galar").find((starter) => starter.speciesId === "sobble")
        ?.initialMoves,
    })
    expect(selected.state.pendingChoices).toEqual([])
    expect(game.dex().pokemon.find((entry) => entry.speciesId === "sobble")?.status).toBe("caught")
    expect(game.chooseStarter("galar", "grookey").kind).toBe("already-selected")
    expect(game.travelTo("pallet-town").kind).toBe("teleported")
    expect(game.travelToRegion("galar").kind).toBe("already-visited")
    expect(game.travelTo(String(locationsForRegion("galar")[0]?.id)).state.pendingChoices).toEqual(
      [],
    )
    expect(fixture.reopen().collection().pokemon).toHaveLength(2)
    expect(fixture.game.status().pendingChoices).toEqual([])
  } finally {
    fixture.dispose()
  }
})

test("regional starters go to the collection when the party is full", () => {
  const fixture = createGameFixture()
  try {
    // Claim starters in successive regions to fill all six party slots.
    for (const region of ["johto", "hoenn", "sinnoh", "unova", "kalos"]) {
      withGameDatabase(fixture.databasePath, (db) =>
        db.run("UPDATE region_progress SET completed = 1"),
      )
      expect(fixture.game.travelToRegion(region).kind).toBe("traveled")
      const starter = startersForRegion(region)[0]
      if (starter === undefined) throw new Error(`Missing ${region} starter`)
      expect(fixture.game.chooseStarter(region, starter.speciesId).kind).toBe("selected")
    }
    const fullParty = fixture.game.status().party
    expect(fullParty.every((slot) => slot.pokemon !== null)).toBe(true)
    withGameDatabase(fixture.databasePath, (db) =>
      db.run("UPDATE region_progress SET completed = 1"),
    )
    expect(fixture.game.travelToRegion("galar").kind).toBe("traveled")
    expect(fixture.game.chooseStarter("galar", "scorbunny").kind).toBe("selected")
    expect(fixture.game.status().party).toEqual(fullParty)
    expect(fixture.game.collection().pokemon).toHaveLength(7)
    expect(
      fixture.game.collection().pokemon.some((pokemon) => pokemon.speciesId === "scorbunny"),
    ).toBe(true)
  } finally {
    fixture.dispose()
  }
})

test("upgrading a save restores missed starters without repeating the initial region", () => {
  const fixture = createGameFixture({ withStarter: false })
  try {
    expect(fixture.game.chooseStarter("galar", "grookey").kind).toBe("selected")
    for (const region of ["johto", "kanto"]) {
      withGameDatabase(fixture.databasePath, (db) =>
        db.run("UPDATE region_progress SET completed = 1"),
      )
      expect(fixture.game.travelToRegion(region).kind).toBe("traveled")
    }
    // Reproduce a v2 save: regions were unlocked without regional starter prompts.
    withGameDatabase(fixture.databasePath, (db) => {
      db.run("DELETE FROM pending_choices WHERE kind = 'starter'")
      db.run("PRAGMA user_version = 2")
    })
    const originalParty = fixture.game.status().party
    const originalCollection = fixture.game.collection()
    const game = fixture.reopen()
    expect(game.status().party).toEqual(originalParty)
    expect(game.collection()).toEqual(originalCollection)
    expect(game.status().pendingChoices.map((choice) => JSON.parse(choice.payload))).toEqual([
      { region: "johto" },
      { region: "kanto" },
    ])
    expect(game.chooseStarter("galar", "sobble").kind).toBe("already-selected")
    expect(game.chooseStarter("johto", "cyndaquil").kind).toBe("selected")
    expect(game.chooseStarter("kanto", "charmander").kind).toBe("selected")
    expect(fixture.reopen().status().pendingChoices).toEqual([])
    expect(fixture.game.collection().pokemon).toHaveLength(3)
  } finally {
    fixture.dispose()
  }
})

test("regional starter creation and consuming its choice roll back together", () => {
  const fixture = createGameFixture()
  try {
    withGameDatabase(fixture.databasePath, (db) =>
      db.run("UPDATE region_progress SET completed = 1"),
    )
    fixture.game.travelToRegion("galar")
    const before = fixture.game.status()
    withGameDatabase(fixture.databasePath, (db) =>
      db.run(`
      CREATE TRIGGER fail_starter BEFORE INSERT ON pokedex_entries
      WHEN NEW.species_id = 'sobble' BEGIN SELECT RAISE(ABORT, 'fail starter'); END
    `),
    )
    expect(() => fixture.game.chooseStarter("galar", "sobble")).toThrow("fail starter")
    expect(fixture.game.status()).toEqual(before)
    expect(fixture.game.collection().pokemon).toHaveLength(1)
    withGameDatabase(fixture.databasePath, (db) => db.run("DROP TRIGGER fail_starter"))
    expect(fixture.game.chooseStarter("galar", "sobble").kind).toBe("selected")
    expect(fixture.game.collection().pokemon).toHaveLength(2)
  } finally {
    fixture.dispose()
  }
})
