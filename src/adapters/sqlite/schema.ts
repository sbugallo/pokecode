import type { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import { nextQueueOrder } from "./transaction-stores/queue-order.js"

const initialSchema = `
  CREATE TABLE trainers (
    id TEXT PRIMARY KEY NOT NULL,
    current_region_id TEXT NOT NULL,
    current_location_id TEXT NOT NULL,
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
    hp_iv INTEGER NOT NULL CHECK(hp_iv BETWEEN 0 AND 31),
    attack_iv INTEGER NOT NULL CHECK(attack_iv BETWEEN 0 AND 31),
    defense_iv INTEGER NOT NULL CHECK(defense_iv BETWEEN 0 AND 31),
    special_attack_iv INTEGER NOT NULL CHECK(special_attack_iv BETWEEN 0 AND 31),
    special_defense_iv INTEGER NOT NULL CHECK(special_defense_iv BETWEEN 0 AND 31),
    speed_iv INTEGER NOT NULL CHECK(speed_iv BETWEEN 0 AND 31),
    hp_ev INTEGER NOT NULL DEFAULT 0 CHECK(hp_ev = 0),
    attack_ev INTEGER NOT NULL DEFAULT 0 CHECK(attack_ev = 0),
    defense_ev INTEGER NOT NULL DEFAULT 0 CHECK(defense_ev = 0),
    special_attack_ev INTEGER NOT NULL DEFAULT 0 CHECK(special_attack_ev = 0),
    special_defense_ev INTEGER NOT NULL DEFAULT 0 CHECK(special_defense_ev = 0),
    speed_ev INTEGER NOT NULL DEFAULT 0 CHECK(speed_ev = 0)
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
  CREATE TABLE pending_choices (
    id TEXT PRIMARY KEY NOT NULL,
    trainer_id TEXT NOT NULL REFERENCES trainers(id),
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    insertion_order INTEGER NOT NULL DEFAULT 0
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
  CREATE TABLE encounter_progress (
    trainer_id TEXT PRIMARY KEY NOT NULL REFERENCES trainers(id),
    token_count INTEGER NOT NULL DEFAULT 0 CHECK(token_count >= 0),
    threshold INTEGER NOT NULL CHECK(threshold > 0)
  );
  CREATE TABLE pending_encounters (
    id TEXT PRIMARY KEY NOT NULL,
    trainer_id TEXT NOT NULL REFERENCES trainers(id),
    kind TEXT NOT NULL CHECK(kind IN ('ordinary', 'special')),
    species_id TEXT NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 100),
    sprite_url TEXT NOT NULL,
    ability TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'genderless')),
    shiny INTEGER NOT NULL DEFAULT 0 CHECK(shiny IN (0, 1)),
    special_encounter_id TEXT,
    created_at TEXT NOT NULL,
    insertion_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE queue_order_sequences (
    trainer_id TEXT NOT NULL REFERENCES trainers(id),
    queue_kind TEXT NOT NULL CHECK(queue_kind IN ('choice', 'encounter')),
    last_order INTEGER NOT NULL DEFAULT 0 CHECK(last_order >= 0),
    PRIMARY KEY(trainer_id, queue_kind)
  );
  CREATE INDEX pending_choices_trainer_order
    ON pending_choices(trainer_id, insertion_order);
  CREATE INDEX pending_encounters_trainer_order
    ON pending_encounters(trainer_id, insertion_order);
  CREATE TABLE pokedex_entries (
    trainer_id TEXT NOT NULL REFERENCES trainers(id),
    species_id TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 1 CHECK(seen IN (0, 1)),
    caught INTEGER NOT NULL DEFAULT 0 CHECK(caught IN (0, 1)),
    PRIMARY KEY(trainer_id, species_id)
  );
  CREATE TABLE triggered_special_encounters (
    trainer_id TEXT NOT NULL REFERENCES trainers(id),
    special_encounter_id TEXT NOT NULL,
    triggered_at TEXT NOT NULL,
    PRIMARY KEY(trainer_id, special_encounter_id)
  );
`

/** Initialize the current schema or atomically upgrade released saves. */
export function initializeGameSchema(database: Database): void {
  const initialize = database.transaction(() => {
    const version = database
      .query<{ readonly user_version: number }, []>("PRAGMA user_version")
      .get()?.user_version
    if (version === 3) return

    if (version === 1 || version === 2) {
      if (version === 1) migrateVersionOne(database)
      migrateVersionTwo(database)
      database.run("PRAGMA user_version = 3")
      return
    }

    const existing = database
      .query<{ readonly name: string }, []>(
        "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
      )
      .get()
    if (version !== 0 || existing !== null) {
      throw new Error(
        "Unsupported PokéCode save schema. No save data was changed. " +
          "Development saves are not upgraded automatically. Stop OpenCode, back up the save directory, " +
          "then move game.sqlite and any game.sqlite-wal/game.sqlite-shm files out of it to start a new game. " +
          "If this save was created by a newer version, use that version instead.",
      )
    }

    database.run(initialSchema)
    database.run("PRAGMA user_version = 3")
  })
  initialize.immediate()
}

/** The first region already received its onboarding starter; later regions did not. */
function migrateVersionTwo(database: Database): void {
  const missedRegions = database
    .query<{ readonly trainerId: string; readonly region: string; readonly createdAt: string }, []>(
      `SELECT progress.trainer_id AS trainerId, progress.region_id AS region,
        trainers.created_at AS createdAt
       FROM region_progress AS progress
       JOIN trainers ON trainers.id = progress.trainer_id
       WHERE progress.rowid <> (
         SELECT MIN(first.rowid) FROM region_progress AS first
         WHERE first.trainer_id = progress.trainer_id
       )
       ORDER BY progress.rowid`,
    )
    .all()
  for (const region of missedRegions) {
    database
      .query<void, [string, string, string, string, number]>(
        `INSERT INTO pending_choices (id, trainer_id, kind, payload, created_at, insertion_order)
         VALUES (?1, ?2, 'starter', ?3, ?4, ?5)`,
      )
      .run(
        randomUUID(),
        region.trainerId,
        JSON.stringify({ region: region.region }),
        region.createdAt,
        nextQueueOrder(database, region.trainerId, "choice"),
      )
  }
}

type LegacyCatchChoice = {
  readonly id: string
  readonly trainerId: string
  readonly payload: string
}
type LegacyEncounter = { readonly id: string; readonly trainerId: string }

function migrateVersionOne(database: Database): void {
  const catchChoices = database
    .query<LegacyCatchChoice, []>(
      "SELECT id, trainer_id AS trainerId, payload FROM pending_choices WHERE kind = 'catch' ORDER BY rowid",
    )
    .all()
  const encounters = database
    .query<LegacyEncounter, []>(
      "SELECT id, trainer_id AS trainerId FROM pending_encounters ORDER BY rowid",
    )
    .all()

  const choicesByTrainer = groupByTrainer(catchChoices)
  const encountersByTrainer = groupByTrainer(encounters)
  const trainerIds = new Set([...choicesByTrainer.keys(), ...encountersByTrainer.keys()])
  const encounterIdByChoice = new Map<string, string>()

  for (const choice of catchChoices) {
    let payload: unknown
    try {
      payload = JSON.parse(choice.payload)
    } catch {
      throw invalidCatchPairing(choice.trainerId, "a catch choice contains invalid JSON")
    }
    if (
      payload === null ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      Object.keys(payload).length !== 0
    ) {
      throw invalidCatchPairing(
        choice.trainerId,
        "a catch choice does not have the legacy empty payload",
      )
    }
  }

  for (const trainerId of trainerIds) {
    const trainerChoices = choicesByTrainer.get(trainerId) ?? []
    const trainerEncounters = encountersByTrainer.get(trainerId) ?? []
    if (trainerChoices.length !== trainerEncounters.length || trainerChoices.length > 1) {
      throw invalidCatchPairing(
        trainerId,
        `found ${trainerChoices.length} catch choices and ${trainerEncounters.length} pending encounters`,
      )
    }
    const choice = trainerChoices[0]
    const encounter = trainerEncounters[0]
    if (choice !== undefined && encounter !== undefined) {
      if (!isUuid(encounter.id)) {
        throw invalidCatchPairing(trainerId, `pending encounter ID ${encounter.id} is not a UUID`)
      }
      encounterIdByChoice.set(choice.id, encounter.id)
    }
  }

  database.run("ALTER TABLE pending_choices ADD COLUMN insertion_order INTEGER NOT NULL DEFAULT 0")
  database.run("UPDATE pending_choices SET insertion_order = rowid")
  const updateCatchPayload = database.query<void, [string, string]>(
    "UPDATE pending_choices SET payload = ?1 WHERE id = ?2 AND kind = 'catch'",
  )
  for (const [choiceId, encounterId] of encounterIdByChoice) {
    updateCatchPayload.run(JSON.stringify({ encounterId }), choiceId)
  }

  database.run(`
    CREATE TABLE pending_encounters_v2 (
      id TEXT PRIMARY KEY NOT NULL,
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      kind TEXT NOT NULL CHECK(kind IN ('ordinary', 'special')),
      species_id TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 100),
      sprite_url TEXT NOT NULL,
      ability TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'genderless')),
      shiny INTEGER NOT NULL DEFAULT 0 CHECK(shiny IN (0, 1)),
      special_encounter_id TEXT,
      created_at TEXT NOT NULL,
      insertion_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  database.run(`
    INSERT INTO pending_encounters_v2 (
      id, trainer_id, kind, species_id, name, level, sprite_url, ability, gender,
      shiny, special_encounter_id, created_at, insertion_order
    )
    SELECT id, trainer_id, kind, species_id, name, level, sprite_url, ability, gender,
      shiny, special_encounter_id, created_at, rowid
    FROM pending_encounters ORDER BY rowid
  `)
  database.run("DROP TABLE pending_encounters")
  database.run("ALTER TABLE pending_encounters_v2 RENAME TO pending_encounters")
  database.run(`
    CREATE TABLE queue_order_sequences (
      trainer_id TEXT NOT NULL REFERENCES trainers(id),
      queue_kind TEXT NOT NULL CHECK(queue_kind IN ('choice', 'encounter')),
      last_order INTEGER NOT NULL DEFAULT 0 CHECK(last_order >= 0),
      PRIMARY KEY(trainer_id, queue_kind)
    )
  `)
  database.run(`
    INSERT INTO queue_order_sequences (trainer_id, queue_kind, last_order)
    SELECT trainer_id, 'choice', MAX(insertion_order) FROM pending_choices GROUP BY trainer_id
  `)
  database.run(`
    INSERT INTO queue_order_sequences (trainer_id, queue_kind, last_order)
    SELECT trainer_id, 'encounter', MAX(insertion_order) FROM pending_encounters GROUP BY trainer_id
  `)
  database.run(
    "CREATE INDEX pending_choices_trainer_order ON pending_choices(trainer_id, insertion_order)",
  )
  database.run(
    "CREATE INDEX pending_encounters_trainer_order ON pending_encounters(trainer_id, insertion_order)",
  )
}

function groupByTrainer<T extends { readonly trainerId: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const group = grouped.get(row.trainerId) ?? []
    group.push(row)
    grouped.set(row.trainerId, group)
  }
  return grouped
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function invalidCatchPairing(trainerId: string, reason: string): Error {
  return new Error(
    `Cannot migrate PokéCode save: invalid pending catch/encounter pairing for trainer ${trainerId} (${reason}). ` +
      "Back up the save and inspect pending_choices and pending_encounters before retrying; no migration changes were committed.",
  )
}
