import { expect, test } from "bun:test"
import { createGameFixture, withGameDatabase } from "../../support/game.js"

const timestamp = "2026-10-16T00:00:00.000Z"

function encounter(id: string, trainerId: string, speciesId = "pidgey") {
  return {
    id,
    trainerId,
    kind: "ordinary" as const,
    speciesId,
    name: speciesId === "pidgey" ? "Pidgey" : "Rattata",
    specialEncounterId: null,
    level: 3,
    gender: "male" as const,
    shiny: false,
    spriteUrl: `https://example.test/${speciesId}.png`,
    ability: "keen-eye",
    createdAt: timestamp,
  }
}

test("encounter and decision queues preserve linked, monotonic per-trainer order", () => {
  const fixture = createGameFixture()
  try {
    const state = fixture.game.status()
    const trainerId = fixture.repository.transactions.withTransaction(
      (stores) => stores.trainers.find()?.id,
    )
    const pokemon = state.party[0]?.pokemon
    if (trainerId === undefined || pokemon === null || pokemon === undefined)
      throw new Error("Expected an active trainer with a party Pokémon")

    const encounterIds = [
      "00000000-0000-4000-8000-000000000501",
      "00000000-0000-4000-8000-000000000502",
      "00000000-0000-4000-8000-000000000503",
    ] as const
    for (const [index, id] of encounterIds.entries()) {
      fixture.repository.transactions.withTransaction((stores) => {
        stores.encounters.insertPending(
          encounter(id, trainerId, index === 1 ? "rattata" : "pidgey"),
        )
        stores.choices.insert({
          id: `00000000-0000-4000-8000-00000000051${index}`,
          trainerId,
          kind: "catch",
          payload: { encounterId: id },
          createdAt: timestamp,
        })
      })
    }

    fixture.repository.transactions.withTransaction((stores) => {
      stores.choices.insert({
        id: "00000000-0000-4000-8000-000000000520",
        trainerId,
        kind: "move",
        payload: { pokemonId: pokemon.id, move: { id: "ember", name: "Ember" } },
        createdAt: timestamp,
      })
    })
    expect(
      fixture.repository.transactions.withTransaction((stores) =>
        stores.choices.hasPokemonChoice(trainerId, pokemon.id, "move", "ember"),
      ),
    ).toBe(true)
    expect(
      fixture.repository.transactions.withTransaction((stores) =>
        stores.choices.hasPokemonChoice(trainerId, pokemon.id, "move", "tackle"),
      ),
    ).toBe(false)
    expect(
      fixture.repository.transactions.withTransaction((stores) =>
        stores.choices.hasPokemonChoice("another-trainer", pokemon.id, "move"),
      ),
    ).toBe(false)

    expect(fixture.game.status()).toMatchObject({
      pendingEncounterCount: 3,
      pendingEncounter: { id: encounterIds[0] },
      pendingChoices: [
        { kind: "move", id: "00000000-0000-4000-8000-000000000520" },
        { kind: "catch", payload: JSON.stringify({ encounterId: encounterIds[0] }) },
        { kind: "catch", payload: JSON.stringify({ encounterId: encounterIds[1] }) },
        { kind: "catch", payload: JSON.stringify({ encounterId: encounterIds[2] }) },
      ],
    })

    fixture.closeRepository(fixture.repository)
    const reopened = fixture.reopen()
    expect(reopened.status().pendingEncounter?.id).toBe(encounterIds[0])

    fixture.repository.transactions.withTransaction((stores) => {
      expect(stores.commands.encounters.pending(trainerId, encounterIds[1])?.id).toBe(
        encounterIds[1],
      )
      expect(
        stores.commands.encounters.pending(trainerId, "00000000-0000-4000-8000-000000000599"),
      ).toBe(null)
      stores.commands.encounters.clearPending(trainerId, encounterIds[0])
      stores.commands.choices.deleteCatch(trainerId, encounterIds[0])
    })
    expect(reopened.status().pendingEncounterCount).toBe(2)
    expect(reopened.status().pendingEncounter?.id).toBe(encounterIds[1])
    expect(reopened.status().pendingChoices.filter((choice) => choice.kind === "catch")).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000511",
        kind: "catch",
        payload: JSON.stringify({ encounterId: encounterIds[1] }),
      },
      {
        id: "00000000-0000-4000-8000-000000000512",
        kind: "catch",
        payload: JSON.stringify({ encounterId: encounterIds[2] }),
      },
    ])

    fixture.repository.transactions.withTransaction((stores) => {
      stores.commands.encounters.clearPending(trainerId, encounterIds[2])
      stores.commands.choices.deleteCatch(trainerId, encounterIds[2])
      stores.encounters.insertPending(encounter("00000000-0000-4000-8000-000000000504", trainerId))
      stores.choices.insert({
        id: "00000000-0000-4000-8000-000000000514",
        trainerId,
        kind: "catch",
        payload: { encounterId: "00000000-0000-4000-8000-000000000504" },
        createdAt: timestamp,
      })
    })
    expect(reopened.status().pendingEncounter?.id).toBe(encounterIds[1])
    expect(reopened.status().pendingEncounterCount).toBe(2)
    expect(
      withGameDatabase(fixture.databasePath, (database) =>
        database
          .query<{ readonly lastOrder: number }, [string]>(
            "SELECT last_order AS lastOrder FROM queue_order_sequences WHERE trainer_id = ? AND queue_kind = 'encounter'",
          )
          .get(trainerId),
      ),
    ).toEqual({ lastOrder: 4 })
    expect(
      fixture.repository.transactions.withTransaction((stores) =>
        stores.commands.encounters.pending(trainerId, encounterIds[0]),
      ),
    ).toBeNull()
  } finally {
    fixture.dispose()
  }
})

test("choice subjects are projected from owned Pokémon even after leaving the party", () => {
  const fixture = createGameFixture()
  try {
    const pokemon = fixture.game.status().party[0]?.pokemon
    const trainerId = fixture.repository.transactions.withTransaction(
      (stores) => stores.trainers.find()?.id,
    )
    if (pokemon === null || pokemon === undefined || trainerId === undefined)
      throw new Error("Expected an active trainer with a party Pokémon")

    fixture.repository.transactions.withTransaction((stores) => {
      stores.commands.pokemon.replaceParty(trainerId, [])
      stores.choices.insert({
        id: "00000000-0000-4000-8000-000000000601",
        trainerId,
        kind: "evolution",
        payload: {
          pokemonId: pokemon.id,
          options: [
            { speciesId: "ivysaur", name: "Ivysaur" },
            { speciesId: "venusaur", name: "Venusaur" },
          ],
        },
        createdAt: timestamp,
      })
    })
    withGameDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [number, string]>("UPDATE owned_pokemon SET experience = ?1 WHERE id = ?2")
        .run(123, pokemon.id)
    })

    const state = fixture.game.status()
    expect(state.choicePokemon).toHaveLength(1)
    expect(state.choicePokemon[0]).toMatchObject({
      id: pokemon.id,
      speciesId: pokemon.speciesId,
      moves: pokemon.moves,
    })
    expect(state.party.every((slot) => slot.pokemon === null)).toBe(true)

    expect(
      fixture.repository.transactions.withTransaction((stores) =>
        stores.pokemon.findOwned(trainerId, pokemon.id),
      ),
    ).toMatchObject({ id: pokemon.id, speciesId: pokemon.speciesId, gender: pokemon.gender })
    expect(
      fixture.repository.transactions.withTransaction((stores) =>
        stores.pokemon.findOwned("another-trainer", pokemon.id),
      ),
    ).toBeNull()
    expect(
      fixture.repository.transactions.withTransaction((stores) =>
        stores.pokemon.offPartyWithExperience(trainerId),
      ),
    ).toEqual([
      {
        id: pokemon.id,
        speciesId: pokemon.speciesId,
        gender: pokemon.gender,
        level: pokemon.level,
        experience: 123,
      },
    ])
  } finally {
    fixture.dispose()
  }
})
