import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  type GameState,
  gameplayConfigSchema,
  type PokemonCollection,
  type PokemonDex,
} from "../../application/contracts/game.js"
import type { GameTransactionRunner } from "../../application/ports/game-transaction.js"
import type {
  StarterCreationCommand,
  StarterIdGenerator,
} from "../../application/ports/starter-selection-store.js"
import { createSqliteGameTransactionRunner } from "./game-transaction.js"
import { initializeSqliteDatabase } from "./initialize-database.js"
import { createSqliteCollectionQueries, trainerIdForQueries } from "./queries/collection.js"
import { createSqliteGameStateQuery } from "./queries/game-state.js"
import { initializeGameSchema } from "./schema.js"
import { createSqliteStarterSelectionStore } from "./starter-selection-store.js"

const environmentKeys = {
  dataHome: "XDG_DATA_HOME",
  home: "HOME",
} as const

export type GameRepository = {
  readonly transactions: GameTransactionRunner
  readState(locationUnlockThreshold?: number): GameState
  createStarterAtomically(selection: StarterCreationCommand, createIds: StarterIdGenerator): boolean
  collection(): PokemonCollection
  dex(): PokemonDex
  close(): void
}

export function globalDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
  const dataHome =
    environment[environmentKeys.dataHome] ??
    join(environment[environmentKeys.home] ?? "~", ".local", "share")
  return join(dataHome, "pokecode", "game.sqlite")
}

export function openGameRepository(path = globalDatabasePath()): GameRepository {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
  const database = new Database(path, { create: true, strict: true })
  initializeSqliteDatabase(database, () => {
    database.run("PRAGMA foreign_keys = ON")
    initializeGameSchema(database)
    database.run("PRAGMA journal_mode = WAL")
  })

  const queryState = createSqliteGameStateQuery(database)
  const readState = (
    locationUnlockThreshold = gameplayConfigSchema.parse({}).locationUnlockTokens,
  ): GameState => queryState(locationUnlockThreshold)

  const starterSelectionStore = createSqliteStarterSelectionStore(database, readState)
  const collectionQueries = createSqliteCollectionQueries(database)
  const collection = (): PokemonCollection => {
    const trainerId = trainerIdForQueries(database)
    return trainerId === null ? { pokemon: [] } : collectionQueries.list(trainerId)
  }
  const dex = (): PokemonDex => collectionQueries.dex(trainerIdForQueries(database))
  const transactions = createSqliteGameTransactionRunner(database)

  return {
    transactions,
    readState,
    createStarterAtomically: starterSelectionStore.createStarterAtomically,
    collection,
    dex,
    close: () => database.close(true),
  }
}
