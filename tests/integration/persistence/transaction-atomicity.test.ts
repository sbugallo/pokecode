import { expect, test } from "bun:test"
import { createGameFixture, withGameDatabase as withDatabase } from "../../support/game.js"

const tables = [
  "trainers",
  "owned_pokemon",
  "party_slots",
  "pokemon_moves",
  "region_progress",
  "location_progress",
  "pending_choices",
  "token_receipts",
  "location_unlock_progress",
  "encounter_progress",
  "pending_encounters",
  "pokedex_entries",
  "triggered_special_encounters",
] as const

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a fixture row")
  return value
}

function snapshot(path: string): ReadonlyMap<(typeof tables)[number], unknown[]> {
  return withDatabase(
    path,
    (database) =>
      new Map(
        tables.map((table) => [
          table,
          database.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        ]),
      ),
  )
}

function setTrigger(path: string, sql: string): void {
  withDatabase(path, (database) => database.run(sql))
}

function saveChoice(
  path: string,
  choice: { readonly id: string; readonly kind: string; readonly payload: string },
): void {
  withDatabase(path, (database) => {
    const trainer = required(
      database.query<{ readonly id: string }, []>("SELECT id FROM trainers").get(),
    )
    database
      .query<void, [string, string, string, string, string]>(
        "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .run(choice.id, trainer.id, choice.kind, choice.payload, "2026-10-15T00:00:00.000Z")
  })
}

test("a late catch-cleanup failure restores the encounter and every capture write before retry", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const trainer = withDatabase(fixture.databasePath, (database) =>
      required(database.query<{ readonly id: string }, []>("SELECT id FROM trainers").get()),
    )
    withDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string, string]>(`
          INSERT INTO pending_encounters
            (id, trainer_id, kind, species_id, name, level, gender, shiny, sprite_url, ability, created_at)
          VALUES (?1, ?2, 'ordinary', 'pidgey', 'Pidgey', 3, 'male', 0,
            'https://example.test/pidgey.png', 'Keen Eye', '2026-10-15T00:00:00.000Z')
        `)
        .run("00000000-0000-4000-8000-000000000201", trainer.id)
    })
    saveChoice(fixture.databasePath, {
      id: "00000000-0000-4000-8000-000000000202",
      kind: "catch",
      payload: JSON.stringify({ encounterId: "00000000-0000-4000-8000-000000000201" }),
    })
    const before = snapshot(fixture.databasePath)
    setTrigger(
      fixture.databasePath,
      `CREATE TRIGGER fail_catch_cleanup BEFORE DELETE ON pending_choices
       WHEN OLD.kind = 'catch' BEGIN SELECT RAISE(ABORT, 'fail catch cleanup'); END`,
    )

    // WHEN
    expect(() => fixture.game.catchEncounter("00000000-0000-4000-8000-000000000201")).toThrow(
      "fail catch cleanup",
    )
    const afterFailure = snapshot(fixture.databasePath)
    setTrigger(fixture.databasePath, "DROP TRIGGER fail_catch_cleanup")
    const retried = fixture.game.catchEncounter("00000000-0000-4000-8000-000000000201")
    const reopened = fixture.reopen()

    // THEN
    expect(afterFailure).toEqual(before)
    expect(retried.kind).toBe("caught")
    expect(reopened.status().party.filter((slot) => slot.pokemon !== null)).toHaveLength(2)
    expect(reopened.status().pendingEncounter).toBeNull()
  } finally {
    fixture.dispose()
  }
})

test("a late party-assignment failure restores the original slots and allows retry", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const starterId = fixture.game.status().party[0]?.pokemon?.id
    if (starterId === undefined) throw new Error("Expected a starter")
    const before = snapshot(fixture.databasePath)
    setTrigger(
      fixture.databasePath,
      `CREATE TRIGGER fail_party_assignment BEFORE UPDATE OF pokemon_id ON party_slots
       WHEN NEW.position = 1 AND NEW.pokemon_id IS NOT NULL
       BEGIN SELECT RAISE(ABORT, 'fail party assignment'); END`,
    )

    // WHEN
    expect(() => fixture.game.replaceParty([starterId])).toThrow("fail party assignment")
    const afterFailure = snapshot(fixture.databasePath)
    setTrigger(fixture.databasePath, "DROP TRIGGER fail_party_assignment")
    const retried = fixture.game.replaceParty([starterId])
    const reopened = fixture.reopen()

    // THEN
    expect(afterFailure).toEqual(before)
    expect(retried.kind).toBe("replaced")
    expect(reopened.status().party[0]?.pokemon?.id).toBe(starterId)
  } finally {
    fixture.dispose()
  }
})

test("a late region-choice deletion failure rolls back travel before a successful retry", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    withDatabase(fixture.databasePath, (database) => {
      database.query<void, []>("UPDATE region_progress SET completed = 1").run()
    })
    const choiceId = "00000000-0000-4000-8000-000000000203"
    saveChoice(fixture.databasePath, {
      id: choiceId,
      kind: "region",
      payload: '{"region":"kanto"}',
    })
    const before = snapshot(fixture.databasePath)
    setTrigger(
      fixture.databasePath,
      `CREATE TRIGGER fail_region_cleanup BEFORE DELETE ON pending_choices
       WHEN OLD.kind = 'region' BEGIN SELECT RAISE(ABORT, 'fail region cleanup'); END`,
    )

    // WHEN
    expect(() => fixture.game.travelToRegion("johto")).toThrow("fail region cleanup")
    const afterFailure = snapshot(fixture.databasePath)
    setTrigger(fixture.databasePath, "DROP TRIGGER fail_region_cleanup")
    const retried = fixture.game.travelToRegion("johto")
    const reopened = fixture.reopen()

    // THEN
    expect(afterFailure).toEqual(before)
    expect(retried.kind).toBe("traveled")
    expect(reopened.status().region).toBe("johto")
    expect(reopened.status().pendingChoices).toEqual([
      expect.objectContaining({ kind: "starter", payload: '{"region":"johto"}' }),
    ])
  } finally {
    fixture.dispose()
  }
})

test("a late move-choice deletion failure rolls back replacement and preserves retry semantics", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected a starter")
    const currentMoveId = withDatabase(
      fixture.databasePath,
      (database) =>
        required(
          database
            .query<{ readonly moveId: string }, [string]>(
              "SELECT move_id AS moveId FROM pokemon_moves WHERE pokemon_id = ?1 ORDER BY position LIMIT 1",
            )
            .get(pokemonId),
        ).moveId,
    )
    const choiceId = "00000000-0000-4000-8000-000000000204"
    saveChoice(fixture.databasePath, {
      id: choiceId,
      kind: "move",
      payload: JSON.stringify({ pokemonId, move: { id: "review-move", name: "Review Move" } }),
    })
    const before = snapshot(fixture.databasePath)
    setTrigger(
      fixture.databasePath,
      `CREATE TRIGGER fail_move_choice_delete BEFORE DELETE ON pending_choices
       WHEN OLD.id = '${choiceId}' BEGIN SELECT RAISE(ABORT, 'fail move choice delete'); END`,
    )

    // WHEN
    expect(() => fixture.game.resolveMoveChoice(choiceId, currentMoveId)).toThrow(
      "fail move choice delete",
    )
    const afterFailure = snapshot(fixture.databasePath)
    setTrigger(fixture.databasePath, "DROP TRIGGER fail_move_choice_delete")
    const retried = fixture.game.resolveMoveChoice(choiceId, currentMoveId)
    const reopened = fixture.reopen()

    // THEN
    expect(afterFailure).toEqual(before)
    expect(retried.kind).toBe("resolved")
    expect(reopened.status().party[0]?.pokemon?.moves.map((move) => move.id)).toContain(
      "review-move",
    )
    expect(reopened.status().pendingChoices).toHaveLength(0)
  } finally {
    fixture.dispose()
  }
})

test("a late evolution-choice deletion failure rolls back both evolution and learned moves", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const pokemonId = fixture.game.status().party[0]?.pokemon?.id
    if (pokemonId === undefined) throw new Error("Expected a starter")
    withDatabase(fixture.databasePath, (database) => {
      database
        .query<void, [string]>("UPDATE owned_pokemon SET level = 22 WHERE id = ?1")
        .run(pokemonId)
    })
    const choiceId = "00000000-0000-4000-8000-000000000205"
    saveChoice(fixture.databasePath, {
      id: choiceId,
      kind: "evolution",
      payload: JSON.stringify({
        pokemonId,
        options: [
          { speciesId: "ivysaur", name: "Ivysaur" },
          { speciesId: "venusaur", name: "Venusaur" },
        ],
      }),
    })
    const before = snapshot(fixture.databasePath)
    setTrigger(
      fixture.databasePath,
      `CREATE TRIGGER fail_evolution_choice_delete BEFORE DELETE ON pending_choices
       WHEN OLD.id = '${choiceId}' BEGIN SELECT RAISE(ABORT, 'fail evolution choice delete'); END`,
    )

    // WHEN
    expect(() => fixture.game.resolveEvolutionChoice(choiceId, "ivysaur")).toThrow(
      "fail evolution choice delete",
    )
    const afterFailure = snapshot(fixture.databasePath)
    setTrigger(fixture.databasePath, "DROP TRIGGER fail_evolution_choice_delete")
    const retried = fixture.game.resolveEvolutionChoice(choiceId, "ivysaur")
    const reopened = fixture.reopen()

    // THEN
    expect(afterFailure).toEqual(before)
    expect(retried.kind).toBe("resolved")
    expect(reopened.status().party[0]?.pokemon).toMatchObject({ speciesId: "ivysaur" })
    expect(reopened.status().party[0]?.pokemon?.moves.map((move) => move.id)).toContain(
      "razor-leaf",
    )
    expect(reopened.status().pendingChoices).toHaveLength(0)
  } finally {
    fixture.dispose()
  }
})

test("malformed persisted choice data fails without changing durable rows", () => {
  // GIVEN
  const fixture = createGameFixture()

  try {
    const choiceId = "00000000-0000-4000-8000-000000000206"
    saveChoice(fixture.databasePath, { id: choiceId, kind: "move", payload: "{" })
    const before = snapshot(fixture.databasePath)

    // WHEN
    let failure: unknown
    try {
      fixture.game.resolveMoveChoice(choiceId, "tackle")
    } catch (error) {
      failure = error
    }
    const afterFailure = snapshot(fixture.databasePath)

    // THEN
    expect(failure).toBeInstanceOf(SyntaxError)
    expect(afterFailure).toEqual(before)
  } finally {
    fixture.dispose()
  }
})
