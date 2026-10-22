import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { formatShowdownTeam } from "../../src/adapters/showdown/format-team.js"
import {
  type GameRepository,
  openGameRepository,
} from "../../src/adapters/sqlite/game-repository.js"
import type { GameplayConfig } from "../../src/application/contracts/game.js"
import { createApplicationGame, type GameService } from "../../src/application/game.js"
import type { PokemonInstance } from "../../src/domain/pokemon/model.js"

const temporaryRoot = "/tmp/opencode"

export function withGameDatabase<Result>(
  path: string,
  run: (database: Database) => Result,
): Result {
  const database = new Database(path)
  try {
    return run(database)
  } finally {
    database.close()
  }
}

export const usageTestConfig: GameplayConfig = {
  pauseOnPendingChoice: true,
  encounterMinimumTokens: 100_000,
  encounterMaximumTokens: 100_000,
  locationUnlockBaseTokens: 100_000,
  locationUnlockExponent: 1,
  locationUnlockRegionExponent: 0,
}

export function createGameFixture(
  options: {
    readonly config?: GameplayConfig
    readonly random?: () => number
    readonly withStarter?: boolean
  } = {},
) {
  mkdirSync(temporaryRoot, { recursive: true })
  const directory = mkdtempSync(join(temporaryRoot, "pokemon-game-"))
  const databasePath = join(directory, "game.sqlite")
  const openRepositories = new Set<GameRepository>()
  let activeRepository: GameRepository
  let activeGame: GameService
  let nextId = 1
  let disposed = false

  const createId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`
  const openGame = (config = options.config ?? usageTestConfig): GameService => {
    activeRepository = openGameRepository(databasePath)
    openRepositories.add(activeRepository)
    return createApplicationGame({
      repository: activeRepository,
      random: options.random ?? (() => 0.5),
      now: () => "2026-10-15T00:00:00.000Z",
      config,
      createId,
      createStarterIds: () => ({ trainerId: createId(), pokemonId: createId() }),
      formatTeam: (party: readonly PokemonInstance[]) => formatShowdownTeam(party),
    })
  }

  try {
    activeGame = openGame()
    if (options.withStarter !== false) {
      const result = activeGame.chooseStarter("kanto", "bulbasaur")
      if (result.kind !== "selected")
        throw new Error(`Starter fixture setup failed: ${result.kind}`)
    }
  } catch (error) {
    for (const repository of openRepositories) repository.close()
    rmSync(directory, { recursive: true, force: true })
    throw error
  }

  const closeRepository = (repository: GameRepository) => {
    if (!openRepositories.has(repository)) return
    repository.close()
    openRepositories.delete(repository)
  }

  return {
    databasePath,
    get game() {
      return activeGame
    },
    get repository() {
      return activeRepository
    },
    closeRepository,
    reopen(config?: GameplayConfig) {
      closeRepository(activeRepository)
      activeGame = openGame(config)
      return activeGame
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const repository of openRepositories) repository.close()
      openRepositories.clear()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

import { Database } from "bun:sqlite"
