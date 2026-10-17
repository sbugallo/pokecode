import { Database } from "bun:sqlite"
import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { openGameRepository } from "../../../src/adapters/sqlite/game-repository.js"
import { initializeGameSchema } from "../../../src/adapters/sqlite/schema.js"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

test("the versioned schema initializes idempotently without changing existing rows", () => {
  // GIVEN
  const database = new Database(":memory:")

  try {
    // WHEN
    initializeGameSchema(database)
    database.run("INSERT INTO trainers VALUES ('trainer', 'kanto', 'pallet-town', '2026-10-16')")
    initializeGameSchema(database)

    // THEN
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 3 })
    expect(database.query("SELECT id FROM trainers").all()).toEqual([{ id: "trainer" }])
    expect(database.query("PRAGMA foreign_key_check").all()).toEqual([])
    expect(
      database
        .query<{ readonly name: string }, []>(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((table) => table.name),
    ).toEqual(
      expect.arrayContaining([
        "trainers",
        "owned_pokemon",
        "party_slots",
        "pokemon_moves",
        "region_progress",
        "location_progress",
        "pending_choices",
        "token_receipts",
        "pending_encounters",
        "pokedex_entries",
      ]),
    )
  } finally {
    database.close()
  }
})

test("schema creation and version assignment roll back together", () => {
  // GIVEN
  const database = new Database(":memory:")

  try {
    // WHEN
    expect(() =>
      database.transaction(() => {
        initializeGameSchema(database)
        throw new Error("abort initialization")
      })(),
    ).toThrow("abort initialization")

    // THEN
    expect(database.query("SELECT name FROM sqlite_schema").all()).toEqual([])
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 0 })
    initializeGameSchema(database)
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 3 })
  } finally {
    database.close()
  }
})

test.each([
  [
    "development save",
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT); INSERT INTO schema_migrations VALUES (12, '2026-10-16')",
  ],
  ["unversioned database", "CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('keep me')"],
  ["newer save", "PRAGMA user_version = 4"],
])("an unsupported %s stays byte-for-byte unchanged", (_name, sql) => {
  // GIVEN
  const directory = mkdtempSync(join("/tmp/opencode", "pokemon-schema-"))
  directories.push(directory)
  const path = join(directory, "game.sqlite")
  const database = new Database(path)
  try {
    database.run(sql)
  } finally {
    database.close()
  }
  const before = readFileSync(path)

  // WHEN
  let failure: unknown
  let unexpectedRepository: ReturnType<typeof openGameRepository> | undefined
  try {
    unexpectedRepository = openGameRepository(path)
  } catch (error) {
    failure = error
  } finally {
    unexpectedRepository?.close()
  }

  // THEN
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).message).toContain("Unsupported PokéCode save schema")
  expect((failure as Error).message).toContain("back up the save directory")
  expect(readFileSync(path)).toEqual(before)
  const reopened = new Database(path)
  try {
    expect(reopened.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "delete" })
  } finally {
    reopened.close()
  }
})

test("v1 migration links the legacy catch choice and preserves durable queue order", () => {
  const database = new Database(":memory:")
  database.run("PRAGMA foreign_keys = ON")
  createVersionOneSchema(database)
  seedVersionOneGameplay(database)
  database.run(
    "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES ('region-choice', 'trainer', 'region', '{\"region\":\"kanto\"}', 'same-time')",
  )
  database.run(
    "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES ('catch-choice', 'trainer', 'catch', '{}', 'same-time')",
  )
  database.run(
    `INSERT INTO pending_encounters VALUES (
      '00000000-0000-4000-8000-000000000101', 'trainer', 'ordinary', 'pidgey', 'Pidgey',
      2, 'https://example.test/pidgey.png', 'keen-eye', 'male', 0, NULL, 'same-time'
    )`,
  )
  database.run(
    "INSERT INTO token_receipts VALUES ('receipt', 'trainer', 'session', 'message', 42, 'created')",
  )
  database.run("INSERT INTO triggered_special_encounters VALUES ('trainer', 'mewtwo', 'triggered')")

  try {
    initializeGameSchema(database)
    initializeGameSchema(database)

    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 3 })
    expect(database.query("PRAGMA foreign_key_check").all()).toEqual([])
    expect(
      database
        .query<
          { readonly kind: string; readonly payload: string; readonly insertionOrder: number },
          []
        >(
          "SELECT kind, payload, insertion_order AS insertionOrder FROM pending_choices ORDER BY insertion_order",
        )
        .all(),
    ).toEqual([
      { kind: "region", payload: '{"region":"kanto"}', insertionOrder: 1 },
      {
        kind: "catch",
        payload: '{"encounterId":"00000000-0000-4000-8000-000000000101"}',
        insertionOrder: 2,
      },
    ])
    expect(
      database
        .query<{ readonly id: string; readonly insertionOrder: number }, []>(
          "SELECT id, insertion_order AS insertionOrder FROM pending_encounters",
        )
        .all(),
    ).toEqual([{ id: "00000000-0000-4000-8000-000000000101", insertionOrder: 1 }])
    expect(
      database.query("SELECT token_count FROM token_receipts WHERE id = 'receipt'").get(),
    ).toEqual({ token_count: 42 })
    expect(database.query("SELECT * FROM triggered_special_encounters").all()).toHaveLength(1)
    expectPreservedGameplayData(database)
    expect(
      database
        .query(
          "SELECT last_order FROM queue_order_sequences WHERE trainer_id = 'trainer' AND queue_kind = 'choice'",
        )
        .get(),
    ).toEqual({ last_order: 2 })

    database.run(
      `INSERT INTO pending_encounters VALUES (
        '00000000-0000-4000-8000-000000000102', 'trainer', 'ordinary', 'rattata', 'Rattata',
        2, 'https://example.test/rattata.png', 'run-away', 'female', 0, NULL, 'same-time', 2
      )`,
    )
    expect(database.query("SELECT COUNT(*) AS count FROM pending_encounters").get()).toEqual({
      count: 2,
    })
  } finally {
    database.close()
  }
})

test("v1 migration handles saves with pending choices but no pending encounter", () => {
  const database = new Database(":memory:")
  createVersionOneSchema(database)
  seedVersionOneGameplay(database)
  database.run(
    "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES ('region-choice', 'trainer', 'region', '{\"region\":\"kanto\"}', 'created')",
  )

  try {
    initializeGameSchema(database)
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 3 })
    expect(database.query("SELECT COUNT(*) AS count FROM pending_encounters").get()).toEqual({
      count: 0,
    })
    expect(database.query("SELECT kind, payload FROM pending_choices").all()).toEqual([
      { kind: "region", payload: '{"region":"kanto"}' },
    ])
    expect(database.query("PRAGMA foreign_key_check").all()).toEqual([])
    expectPreservedGameplayData(database)
  } finally {
    database.close()
  }
})

test("v1 migration rolls back its DDL and catch-link updates after a backfill trigger failure", () => {
  const database = new Database(":memory:")
  createVersionOneSchema(database)
  database.run("INSERT INTO trainers VALUES ('trainer', 'kanto', 'pallet-town', 'created')")
  database.run(
    "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES ('catch-choice', 'trainer', 'catch', '{}', 'created')",
  )
  database.run(
    `INSERT INTO pending_encounters VALUES (
      '00000000-0000-4000-8000-000000000251', 'trainer', 'ordinary', 'pidgey', 'Pidgey',
      2, 'https://example.test/pidgey.png', 'keen-eye', 'male', 0, NULL, 'created'
    )`,
  )
  database.run(`
    CREATE TRIGGER fail_catch_backfill BEFORE UPDATE OF payload ON pending_choices
    WHEN OLD.kind = 'catch' BEGIN SELECT RAISE(ABORT, 'fail catch backfill'); END
  `)

  try {
    expect(() => initializeGameSchema(database)).toThrow("fail catch backfill")
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 1 })
    expect(database.query("SELECT payload FROM pending_choices").get()).toEqual({ payload: "{}" })
    expect(
      database
        .query<{ readonly name: string }, []>("PRAGMA table_info(pending_choices)")
        .all()
        .map((column) => column.name),
    ).not.toContain("insertion_order")
    expect(database.query("SELECT id FROM pending_encounters").get()).toEqual({
      id: "00000000-0000-4000-8000-000000000251",
    })
    expect(
      database.query("SELECT name FROM sqlite_schema WHERE name = 'pending_encounters_v2'").get(),
    ).toBeNull()
  } finally {
    database.close()
  }
})

test.each([
  { name: "orphan catch choice", payload: "{}", includeEncounter: false },
  { name: "malformed catch payload", payload: "not-json", includeEncounter: true },
  {
    name: "non-legacy catch payload",
    payload: '{"encounterId":"unexpected"}',
    includeEncounter: true,
  },
  { name: "encounter without catch choice", payload: null, includeEncounter: true },
])("v1 migration rejects $name atomically", ({ payload, includeEncounter }) => {
  const database = new Database(":memory:")
  database.run("PRAGMA foreign_keys = ON")
  createVersionOneSchema(database)
  database.run("INSERT INTO trainers VALUES ('trainer', 'kanto', 'pallet-town', 'created')")
  if (payload !== null) {
    database
      .query<void, [string]>(
        "INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at) VALUES ('catch-choice', 'trainer', 'catch', ?1, 'created')",
      )
      .run(payload)
  }
  if (includeEncounter) {
    database.run(
      `INSERT INTO pending_encounters VALUES (
        '00000000-0000-4000-8000-000000000201', 'trainer', 'ordinary', 'pidgey', 'Pidgey',
        2, 'https://example.test/pidgey.png', 'keen-eye', 'male', 0, NULL, 'created'
      )`,
    )
  }

  try {
    expect(() => initializeGameSchema(database)).toThrow("invalid pending catch/encounter pairing")
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 1 })
    expect(
      database
        .query<{ readonly name: string }, []>("PRAGMA table_info(pending_choices)")
        .all()
        .map((column) => column.name),
    ).not.toContain("insertion_order")
    expect(database.query("SELECT payload FROM pending_choices").all()).toEqual(
      payload === null ? [] : [{ payload }],
    )
    expect(
      database
        .query<{ readonly name: string }, []>("PRAGMA index_list(pending_encounters)")
        .all()
        .some((index) => index.name.startsWith("sqlite_autoindex")),
    ).toBe(true)
  } finally {
    database.close()
  }
})

test("v2 missed-starter backfill rolls back atomically and runs only once", () => {
  const database = new Database(":memory:")
  try {
    initializeGameSchema(database)
    database.run("INSERT INTO trainers VALUES ('trainer', 'galar', 'postwick', 'created')")
    database.run(
      "INSERT INTO region_progress (trainer_id, region_id) VALUES ('trainer', 'kanto'), ('trainer', 'galar')",
    )
    database.run("PRAGMA user_version = 2")
    database.run(`
      CREATE TRIGGER fail_backfill BEFORE INSERT ON pending_choices
      WHEN NEW.kind = 'starter' BEGIN SELECT RAISE(ABORT, 'fail backfill'); END
    `)
    expect(() => initializeGameSchema(database)).toThrow("fail backfill")
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 2 })
    expect(database.query("SELECT * FROM pending_choices").all()).toEqual([])
    expect(database.query("SELECT * FROM queue_order_sequences").all()).toEqual([])
    database.run("DROP TRIGGER fail_backfill")
    initializeGameSchema(database)
    initializeGameSchema(database)
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 3 })
    expect(
      database.query("SELECT kind, payload, insertion_order FROM pending_choices").all(),
    ).toEqual([{ kind: "starter", payload: '{"region":"galar"}', insertion_order: 1 }])
  } finally {
    database.close()
  }
})

function createVersionOneSchema(database: Database): void {
  database.run(`
    CREATE TABLE trainers (
      id TEXT PRIMARY KEY NOT NULL,
      current_region_id TEXT NOT NULL,
      current_location_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE pending_choices (
      id TEXT PRIMARY KEY NOT NULL,
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE pending_encounters (
      id TEXT PRIMARY KEY NOT NULL,
      trainer_id TEXT NOT NULL UNIQUE REFERENCES trainers(id),
      kind TEXT NOT NULL CHECK(kind IN ('ordinary', 'special')),
      species_id TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 100),
      sprite_url TEXT NOT NULL,
      ability TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'genderless')),
      shiny INTEGER NOT NULL DEFAULT 0 CHECK(shiny IN (0, 1)),
      special_encounter_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE owned_pokemon (
      id TEXT PRIMARY KEY NOT NULL,
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      species_id TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 100),
      experience REAL NOT NULL DEFAULT 0 CHECK(experience >= 0),
      ability TEXT NOT NULL,
      nature TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'genderless')),
      shiny INTEGER NOT NULL DEFAULT 0 CHECK(shiny IN (0, 1)),
      hp_iv INTEGER NOT NULL,
      attack_iv INTEGER NOT NULL,
      defense_iv INTEGER NOT NULL,
      special_attack_iv INTEGER NOT NULL,
      special_defense_iv INTEGER NOT NULL,
      speed_iv INTEGER NOT NULL,
      hp_ev INTEGER NOT NULL DEFAULT 0,
      attack_ev INTEGER NOT NULL DEFAULT 0,
      defense_ev INTEGER NOT NULL DEFAULT 0,
      special_attack_ev INTEGER NOT NULL DEFAULT 0,
      special_defense_ev INTEGER NOT NULL DEFAULT 0,
      speed_ev INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE party_slots (
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 6),
      pokemon_id TEXT UNIQUE REFERENCES owned_pokemon(id),
      PRIMARY KEY(trainer_id, position)
    );
    CREATE TABLE pokemon_moves (
      pokemon_id TEXT NOT NULL REFERENCES owned_pokemon(id),
      position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 4),
      move_id TEXT NOT NULL,
      move_name TEXT NOT NULL,
      PRIMARY KEY(pokemon_id, position)
    );
    CREATE TABLE region_progress (
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      region_id TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
      next_region_dismissed INTEGER NOT NULL DEFAULT 0 CHECK(next_region_dismissed IN (0, 1)),
      PRIMARY KEY(trainer_id, region_id)
    );
    CREATE TABLE location_progress (
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      location_id TEXT NOT NULL,
      unlocked INTEGER NOT NULL DEFAULT 1 CHECK(unlocked IN (0, 1)),
      PRIMARY KEY(trainer_id, location_id)
    );
    CREATE TABLE location_unlock_progress (
      trainer_id TEXT PRIMARY KEY NOT NULL REFERENCES trainers(id),
      token_count INTEGER NOT NULL DEFAULT 0 CHECK(token_count >= 0)
    );
    CREATE TABLE encounter_progress (
      trainer_id TEXT PRIMARY KEY NOT NULL REFERENCES trainers(id),
      token_count INTEGER NOT NULL DEFAULT 0 CHECK(token_count >= 0),
      threshold INTEGER NOT NULL CHECK(threshold > 0)
    );
    CREATE TABLE pokedex_entries (
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      species_id TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 1 CHECK(seen IN (0, 1)),
      caught INTEGER NOT NULL DEFAULT 0 CHECK(caught IN (0, 1)),
      PRIMARY KEY(trainer_id, species_id)
    );
    CREATE TABLE token_receipts (
      id TEXT PRIMARY KEY NOT NULL,
      trainer_id TEXT REFERENCES trainers(id),
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      token_count INTEGER NOT NULL CHECK(token_count >= 0),
      created_at TEXT NOT NULL,
      UNIQUE(session_id, message_id)
    );
    CREATE TABLE triggered_special_encounters (
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      special_encounter_id TEXT NOT NULL,
      triggered_at TEXT NOT NULL,
      PRIMARY KEY(trainer_id, special_encounter_id)
    );
    PRAGMA user_version = 1;
  `)
}

function seedVersionOneGameplay(database: Database): void {
  database.run("INSERT INTO trainers VALUES ('trainer', 'kanto', 'pallet-town', 'created')")
  database.run(`
    INSERT INTO owned_pokemon (
      id, trainer_id, species_id, name, level, experience, ability, nature, gender, shiny,
      hp_iv, attack_iv, defense_iv, special_attack_iv, special_defense_iv, speed_iv
    ) VALUES ('pokemon', 'trainer', 'bulbasaur', 'Bulbasaur', 12, 1234, 'Overgrow', 'Hardy', 'female', 0,
      10, 11, 12, 13, 14, 15)
  `)
  database.run("INSERT INTO party_slots VALUES ('trainer', 1, 'pokemon')")
  database.run("INSERT INTO pokemon_moves VALUES ('pokemon', 1, 'vine-whip', 'Vine Whip')")
  database.run("INSERT INTO region_progress VALUES ('trainer', 'kanto', 0, 1)")
  database.run("INSERT INTO location_progress VALUES ('trainer', 'pallet-town', 1)")
  database.run("INSERT INTO location_unlock_progress VALUES ('trainer', 321)")
  database.run("INSERT INTO encounter_progress VALUES ('trainer', 654, 987)")
  database.run("INSERT INTO pokedex_entries VALUES ('trainer', 'bulbasaur', 1, 1)")
}

function expectPreservedGameplayData(database: Database): void {
  expect(database.query("SELECT id, current_region_id FROM trainers").all()).toEqual([
    { id: "trainer", current_region_id: "kanto" },
  ])
  expect(
    database.query("SELECT id, species_id, level, experience FROM owned_pokemon").all(),
  ).toEqual([{ id: "pokemon", species_id: "bulbasaur", level: 12, experience: 1234 }])
  expect(database.query("SELECT trainer_id, position, pokemon_id FROM party_slots").all()).toEqual([
    { trainer_id: "trainer", position: 1, pokemon_id: "pokemon" },
  ])
  expect(database.query("SELECT pokemon_id, move_id, move_name FROM pokemon_moves").all()).toEqual([
    { pokemon_id: "pokemon", move_id: "vine-whip", move_name: "Vine Whip" },
  ])
  expect(database.query("SELECT * FROM region_progress").all()).toEqual([
    { trainer_id: "trainer", region_id: "kanto", completed: 0, next_region_dismissed: 1 },
  ])
  expect(database.query("SELECT * FROM location_progress").all()).toEqual([
    { trainer_id: "trainer", location_id: "pallet-town", unlocked: 1 },
  ])
  expect(database.query("SELECT * FROM location_unlock_progress").all()).toEqual([
    { trainer_id: "trainer", token_count: 321 },
  ])
  expect(database.query("SELECT * FROM encounter_progress").all()).toEqual([
    { trainer_id: "trainer", token_count: 654, threshold: 987 },
  ])
  expect(database.query("SELECT * FROM pokedex_entries").all()).toEqual([
    { trainer_id: "trainer", species_id: "bulbasaur", seen: 1, caught: 1 },
  ])
}
