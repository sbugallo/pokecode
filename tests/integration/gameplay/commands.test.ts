import { expect, test } from "bun:test"
import { locationsForRegion } from "../../../src/domain/content/catalog.js"
import { createGameFixture, withGameDatabase as withDatabase } from "../../support/game.js"

const moveChoiceId = "00000000-0000-4000-8000-000000000101"
const evolutionChoiceId = "00000000-0000-4000-8000-000000000102"
const missingEncounterId = "00000000-0000-4000-8000-000000000099"

test("inactive command results take priority over missing resources", () => {
  // GIVEN
  const fixture = createGameFixture({ withStarter: false })

  try {
    // WHEN
    const caught = fixture.game.catchEncounter(missingEncounterId)
    const ran = fixture.game.runEncounter(missingEncounterId)
    const party = fixture.game.replaceParty(["00000000-0000-4000-8000-000000000001"])
    const location = fixture.game.travelTo("missing-location")
    const region = fixture.game.travelToRegion("missing-region")
    const move = fixture.game.resolveMoveChoice(moveChoiceId, "tackle")
    const evolution = fixture.game.resolveEvolutionChoice(evolutionChoiceId, "ivysaur")

    // THEN
    expect(caught.kind).toBe("inactive")
    expect(ran.kind).toBe("inactive")
    expect(party.kind).toBe("inactive")
    expect(location.kind).toBe("inactive")
    expect(region.kind).toBe("inactive")
    expect(move.kind).toBe("inactive")
    expect(evolution.kind).toBe("inactive")
    expect(fixture.game.status().phase).toBe("onboarding")
  } finally {
    fixture.dispose()
  }
})

test("evolution choices reject targets outside the stored options without consuming the choice", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected a starter")
    withDatabase(fixture.databasePath, (database) => {
      const trainer = database.query<{ readonly id: string }, []>("SELECT id FROM trainers").get()
      if (trainer === null) throw new Error("Expected a trainer")
      database
        .query<void, [string, string, string, string]>(
          "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES (?1, ?2, 'evolution', ?3, ?4)",
        )
        .run(
          evolutionChoiceId,
          trainer.id,
          JSON.stringify({
            pokemonId,
            options: [
              { speciesId: "ivysaur", name: "Ivysaur" },
              { speciesId: "venusaur", name: "Venusaur" },
            ],
          }),
          "2026-10-15T00:00:00.000Z",
        )
    })

    // WHEN
    const invalid = fixture.game.resolveEvolutionChoice(evolutionChoiceId, "pikachu")

    // THEN
    expect(invalid.kind).toBe("invalid-choice")
    expect(invalid.state.pendingChoices.map((choice) => choice.id)).toContain(evolutionChoiceId)
    expect(String(invalid.state.party[0]?.pokemon?.speciesId)).toBe("bulbasaur")
  } finally {
    fixture.dispose()
  }
})

test("catching and running distinguish an absent encounter from an inactive game", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    // WHEN
    const caught = fixture.game.catchEncounter(missingEncounterId)
    const ran = fixture.game.runEncounter(missingEncounterId)

    // THEN
    expect(caught.kind).toBe("no-encounter")
    expect(ran.kind).toBe("no-encounter")
    expect(fixture.game.status().pendingEncounter).toBeNull()
  } finally {
    fixture.dispose()
  }
})

test("party replacement rejects invalid shape and unowned Pokémon without changing the party", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const starterId = fixture.game.status().party[0]?.pokemon?.id
    if (starterId === undefined) throw new Error("Expected a starter")

    // WHEN
    const empty = fixture.game.replaceParty([])
    const duplicate = fixture.game.replaceParty([starterId, starterId])
    const unowned = fixture.game.replaceParty(["00000000-0000-4000-8000-000000000099"])

    // THEN
    expect(empty.kind).toBe("invalid-party")
    expect(duplicate.kind).toBe("invalid-party")
    expect(unowned.kind).toBe("invalid-party")
    expect(fixture.game.status().party[0]?.pokemon?.id).toBe(starterId)
  } finally {
    fixture.dispose()
  }
})

test("location and region travel preserve validation and progression reason priorities", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const johtoLocation = locationsForRegion("johto")[0]
    if (johtoLocation === undefined) throw new Error("Expected a Johto location")
    withDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>(
          "INSERT INTO location_progress (trainer_id, location_id, unlocked) SELECT id, ?1, 1 FROM trainers",
        )
        .run(johtoLocation.id)
      database
        .query<void, []>(
          "INSERT INTO region_progress (trainer_id, region_id, completed) SELECT id, 'johto', 0 FROM trainers",
        )
        .run()
    })

    // WHEN
    const invalidLocation = fixture.game.travelTo("missing-location")
    const invalidRegion = fixture.game.travelToRegion("missing-region")
    const lockedLocation = fixture.game.travelTo(locationsForRegion("kanto")[1]?.id ?? "")
    const unlockedCrossRegionLocation = fixture.game.travelTo(johtoLocation.id)
    const incompleteBeforeVisited = fixture.game.travelToRegion("johto")
    withDatabase(fixture.databasePath, (database) => {
      database
        .query<void, []>("UPDATE region_progress SET completed = 1 WHERE region_id = 'johto'")
        .run()
    })
    const visitedAfterCompletion = fixture.game.travelToRegion("johto")

    // THEN
    expect(invalidLocation.kind).toBe("invalid-location")
    expect(invalidRegion.kind).toBe("invalid-region")
    expect(lockedLocation.kind).toBe("locked-location")
    expect(unlockedCrossRegionLocation.kind).toBe("teleported")
    expect(unlockedCrossRegionLocation.state.location).toBe(johtoLocation.id)
    expect(unlockedCrossRegionLocation.state.region).toBe("johto")
    expect(incompleteBeforeVisited.kind).toBe("region-incomplete")
    expect(visitedAfterCompletion.kind).toBe("already-visited")
  } finally {
    fixture.dispose()
  }
})

test("move-choice decline resolves the prompt while an unknown selection preserves it", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected a starter")
    withDatabase(fixture.databasePath, (database) => {
      const trainer = database.query<{ readonly id: string }, []>("SELECT id FROM trainers").get()
      if (trainer === null) throw new Error("Expected a trainer")
      database
        .query<void, [string, string, string, string]>(
          "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES (?1, ?2, 'move', ?3, ?4)",
        )
        .run(
          moveChoiceId,
          trainer.id,
          JSON.stringify({ pokemonId, move: { id: "razor-leaf", name: "Razor Leaf" } }),
          "2026-10-15T00:00:00.000Z",
        )
    })

    // WHEN
    const invalid = fixture.game.resolveMoveChoice(moveChoiceId, "unknown-move")
    const declined = fixture.game.resolveMoveChoice(moveChoiceId, "razor-leaf")

    // THEN
    expect(invalid.kind).toBe("invalid-choice")
    expect(invalid.state.pendingChoices.map((choice) => choice.id)).toContain(moveChoiceId)
    expect(declined.kind).toBe("resolved")
    expect(declined.state.pendingChoices.map((choice) => choice.id)).not.toContain(moveChoiceId)
    expect(declined.state.party[0]?.pokemon?.moves.map((move) => move.id)).not.toContain(
      "razor-leaf",
    )
  } finally {
    fixture.dispose()
  }
})
