import { expect, test } from "bun:test"
import type { StarterCreationCommand } from "../../../src/application/ports/starter-selection-store.js"
import { createGameFixture, withGameDatabase as withDatabase } from "../../support/game.js"

const callerIds = {
  trainerId: "00000000-0000-4000-8000-000000000401",
  pokemonId: "00000000-0000-4000-8000-000000000402",
} as const

function starterCommand(): StarterCreationCommand {
  return {
    regionId: "kanto",
    locationId: "pallet-town",
    speciesId: "bulbasaur",
    name: "Bulbasaur",
    gender: "genderless",
    ability: "Overgrow",
    nature: "Bold",
    level: 5,
    experience: 0,
    shiny: false,
    ivs: { hp: 1, attack: 2, defense: 3, specialAttack: 4, specialDefense: 5, speed: 6 },
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: [{ id: "tackle", name: "Tackle" }],
    selectedAt: "2026-10-15T00:00:00.000Z",
  }
}

test("SQLite persists caller-supplied starter IDs and every supplied IV", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false })

  try {
    // WHEN
    const selected = fixture.repository.createStarterAtomically(starterCommand(), () => callerIds)
    const duplicate = fixture.repository.createStarterAtomically(starterCommand(), () => callerIds)
    const reopened = fixture.reopen().status()
    const trainer = withDatabase(fixture.databasePath, (database) =>
      database.query<{ readonly id: string }, []>("SELECT id FROM trainers").get(),
    )

    // THEN
    expect(selected).toBe(true)
    expect(duplicate).toBe(false)
    expect(trainer?.id).toBe(callerIds.trainerId)
    expect(reopened.party[0]?.pokemon).toMatchObject({
      id: callerIds.pokemonId,
      nature: "Bold",
      gender: "genderless",
      ivs: { hp: 1, attack: 2, defense: 3, specialAttack: 4, specialDefense: 5, speed: 6 },
      moves: [{ id: "tackle", name: "Tackle" }],
    })
  } finally {
    fixture.dispose()
  }
})

test("a late starter Pokédex failure rolls back the whole selection and retry survives reopening", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false, random: () => 0 })

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.run(`CREATE TRIGGER fail_starter_dex BEFORE INSERT ON pokedex_entries
        BEGIN SELECT RAISE(ABORT, 'injected starter failure'); END`)
    })

    // WHEN
    expect(() => fixture.game.chooseStarter("kanto", "bulbasaur")).toThrow(
      "injected starter failure",
    )
    const afterFailure = withDatabase(fixture.databasePath, (database) =>
      [
        "trainers",
        "region_progress",
        "location_progress",
        "location_unlock_progress",
        "owned_pokemon",
        "party_slots",
        "pokedex_entries",
        "pokemon_moves",
      ].map(
        (table) =>
          database
            .query<{ readonly count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`)
            .get()?.count,
      ),
    )
    withDatabase(fixture.databasePath, (database) => database.run("DROP TRIGGER fail_starter_dex"))
    const retry = fixture.game.chooseStarter("kanto", "bulbasaur")
    const reopened = fixture.reopen().status()

    // THEN
    expect(afterFailure).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(retry.kind).toBe("selected")
    expect(reopened.phase).toBe("active")
    expect(String(reopened.party[0]?.pokemon?.speciesId)).toBe("bulbasaur")
  } finally {
    fixture.dispose()
  }
})
