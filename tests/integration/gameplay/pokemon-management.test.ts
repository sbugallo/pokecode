import { expect, test } from "bun:test"
import {
  localizeCollection,
  localizeGameState,
} from "../../../src/adapters/presentation/localization.js"
import { createGameFixture, withGameDatabase } from "../../support/game.js"

test("renaming persists in storage, localized state, export, and evolution", () => {
  const fixture = createGameFixture()
  try {
    const pokemon = fixture.game.collection().pokemon[0]
    if (pokemon === undefined) throw new Error("Missing starter")
    expect(fixture.game.renamePokemon(pokemon.id, "  Leaf  ").kind).toBe("renamed")
    const game = fixture.reopen()
    expect(game.collection().pokemon[0]?.name).toBe("Leaf")
    expect(localizeCollection(game.collection(), "es").pokemon[0]?.name).toBe("Leaf")
    expect(localizeGameState(game.status(), "es").party[0]?.pokemon?.name).toBe("Leaf")
    expect(game.exportTeam().text).toContain("Leaf (Bulbasaur)")

    withGameDatabase(fixture.databasePath, (database) => {
      database.run("UPDATE owned_pokemon SET level = 15, experience = 2000")
    })
    game.recordUsage({
      sessionId: "nickname",
      messageId: "evolve",
      inputTokens: 10,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      completedAt: "2026-10-15T00:00:00.000Z",
    })
    expect(String(game.collection().pokemon[0]?.speciesId)).toBe("ivysaur")
    expect(game.collection().pokemon[0]?.name).toBe("Leaf")
  } finally {
    fixture.dispose()
  }
})

test("invalid names and unknown Pokemon do not change the collection", () => {
  const fixture = createGameFixture()
  try {
    const pokemon = fixture.game.collection().pokemon[0]
    if (pokemon === undefined) throw new Error("Missing starter")
    for (const name of ["", "   ", "x".repeat(31), "Leaf\nBud", "Leaf\u001b[31m", "Leaf\u200b"]) {
      expect(fixture.game.renamePokemon(pokemon.id, name).kind).toBe("invalid-name")
    }
    expect(fixture.game.renamePokemon("missing", "Leaf").kind).toBe("invalid-pokemon")
    expect(fixture.game.releasePokemon("missing").kind).toBe("invalid-pokemon")
    expect(fixture.game.collection().pokemon[0]).toEqual(pokemon)
  } finally {
    fixture.dispose()
  }
})

test("releasing removes moves and pending choices, but retains Pokedex history", () => {
  const fixture = createGameFixture()
  try {
    const starter = fixture.game.collection().pokemon[0]
    if (starter === undefined) throw new Error("Missing starter")
    expect(fixture.game.releasePokemon(starter.id).kind).toBe("last-party-pokemon")
    withGameDatabase(fixture.databasePath, (database) => {
      // Add a second owned Pokemon, using the starter's valid persisted attributes.
      database.run(`INSERT INTO owned_pokemon SELECT
        '00000000-0000-4000-8000-000000000099', trainer_id, species_id, name, level,
        experience, ability, nature, gender, shiny,
        hp_iv, attack_iv, defense_iv, special_attack_iv, special_defense_iv, speed_iv,
        hp_ev, attack_ev, defense_ev, special_attack_ev, special_defense_ev, speed_ev
        FROM owned_pokemon LIMIT 1`)
      database
        .query(
          "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) SELECT '00000000-0000-4000-8000-000000000098', id, 'move', ?1, created_at FROM trainers",
        )
        .run(JSON.stringify({ pokemonId: starter.id, move: { id: "growl", name: "Growl" } }))
    })
    const spareId = "00000000-0000-4000-8000-000000000099"
    // An unsaved PC draft cannot bypass the persisted last-party-member guard.
    expect(fixture.game.releasePokemon(starter.id).kind).toBe("last-party-pokemon")
    expect(fixture.game.replaceParty([starter.id, spareId]).kind).toBe("replaced")
    expect(fixture.game.releasePokemon(starter.id).kind).toBe("released")
    expect(fixture.game.status().pendingChoices).toEqual([])
    expect(
      fixture.game
        .status()
        .party.flatMap((slot) => (slot.pokemon === null ? [] : [String(slot.pokemon.id)])),
    ).toEqual([spareId])
    withGameDatabase(fixture.databasePath, (database) => {
      expect(
        database.query("SELECT * FROM pokemon_moves WHERE pokemon_id = ?1").all(starter.id),
      ).toEqual([])
    })
    expect(
      fixture
        .reopen()
        .collection()
        .pokemon.map((pokemon) => String(pokemon.id)),
    ).toEqual([spareId])
    expect(
      fixture.game.dex().pokemon.find((pokemon) => pokemon.speciesId === starter.speciesId)?.status,
    ).toBe("caught")
    expect(fixture.game.releasePokemon(starter.id).kind).toBe("invalid-pokemon")
  } finally {
    fixture.dispose()
  }
})

test("inactive games cannot rename or release Pokemon", () => {
  const fixture = createGameFixture({ withStarter: false })
  try {
    expect(fixture.game.renamePokemon("missing", "Leaf").kind).toBe("inactive")
    expect(fixture.game.releasePokemon("missing").kind).toBe("inactive")
  } finally {
    fixture.dispose()
  }
})
