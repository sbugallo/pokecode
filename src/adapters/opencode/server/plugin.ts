import { Plugin } from "@opencode/plugin"

import { formatShowdownTeam } from "../../../adapters/showdown/format-team.js"
import { openGameRepository } from "../../../adapters/sqlite/game-repository.js"
import { gameplayConfigSchema } from "../../../application/contracts/game.js"
import {
  createApplicationGame,
  type GameService,
  type GameServiceDependencies,
} from "../../../application/game.js"
import {
  languageSchema,
  localizeCollection,
  localizeDex,
  localizeGameState,
} from "../../presentation/localization.js"
import {
  createSpriteCache,
  globalSpriteCacheDirectory,
  type SpriteCache,
} from "../../sprites/cache.js"
import { PokecodeRpc } from "../rpc/contract.js"
import { createPokecodeHandlers } from "./handlers.js"
import { reconcileCompletedUsage } from "./usage-reconciliation.js"

const optionsSchema = gameplayConfigSchema.extend({ language: languageSchema })

type ServerContext = Pick<Plugin.Context, "options" | "rpc" | "event" | "session">
type ServerRepository = ReturnType<typeof openGameRepository>

type ServerDependencies = {
  readonly openRepository: () => ServerRepository
  readonly createGame: (input: Omit<GameServiceDependencies, "formatTeam">) => GameService
  readonly createSprites: () => SpriteCache
  readonly random: () => number
  readonly createId: () => string
  readonly createStarterIds: GameServiceDependencies["createStarterIds"]
  readonly now: () => string
}

const productionDependencies: ServerDependencies = {
  openRepository: () => openGameRepository(),
  createGame: (input) => createApplicationGame({ ...input, formatTeam: formatShowdownTeam }),
  createSprites: () => createSpriteCache({ cacheDirectory: globalSpriteCacheDirectory(), fetch }),
  random: Math.random,
  createId: () => crypto.randomUUID(),
  createStarterIds: () => ({
    trainerId: crypto.randomUUID(),
    pokemonId: crypto.randomUUID(),
  }),
  now: () => new Date().toISOString(),
}

export async function setupPokecodeServer(
  context: ServerContext,
  dependencies: ServerDependencies = productionDependencies,
): Promise<Plugin.Cleanup> {
  const options = optionsSchema.parse(context.options)
  const repository = dependencies.openRepository()

  try {
    const game = dependencies.createGame({
      repository,
      random: dependencies.random,
      now: dependencies.now,
      config: options,
      createId: dependencies.createId,
      createStarterIds: dependencies.createStarterIds,
    })
    const sprites = dependencies.createSprites()
    const localizers = {
      state: (state: Parameters<typeof localizeGameState>[0]) =>
        localizeGameState(state, options.language),
      collection: (collection: Parameters<typeof localizeCollection>[0]) =>
        localizeCollection(collection, options.language),
      dex: (dex: Parameters<typeof localizeDex>[0]) => localizeDex(dex, options.language),
    }
    let publishStatusChanged: (state: ReturnType<typeof localizeGameState>) => Promise<void> =
      async (_state) => {
        throw new Error("PokéCode RPC registration is not ready")
      }
    const handlers = createPokecodeHandlers({
      game,
      localizers,
      sprites,
      publishStatusChanged: (state) => publishStatusChanged(state),
    })
    const registration = await context.rpc.register(PokecodeRpc, handlers)
    publishStatusChanged = (state) => registration.events.emit("statusChanged", state)

    const usageAbortController = new AbortController()
    let reconciliationFailed = false
    let reconciliationFailure: unknown
    const reconciliation = reconcileCompletedUsage({
      event: context.event,
      session: context.session,
      recordUsage: (input) => game.recordUsage(input),
      onUsageApplied: async (application) => {
        await publishStatusChanged(localizers.state(application.state))
      },
      signal: usageAbortController.signal,
    }).catch((error: unknown) => {
      reconciliationFailed = true
      reconciliationFailure = error
    })

    return async () => {
      usageAbortController.abort()
      await reconciliation
      let closeFailure: unknown
      try {
        repository.close()
      } catch (error) {
        closeFailure = error
      }
      if (reconciliationFailed && closeFailure !== undefined) {
        throw new AggregateError(
          [reconciliationFailure, closeFailure],
          "Usage reconciliation and game repository cleanup failed.",
        )
      }
      if (reconciliationFailed) throw reconciliationFailure
      if (closeFailure !== undefined) throw closeFailure
    }
  } catch (setupFailure) {
    try {
      repository.close()
    } catch (closeFailure) {
      throw new AggregateError(
        [setupFailure, closeFailure],
        "PokéCode setup and repository cleanup failed.",
      )
    }
    throw setupFailure
  }
}

export default Plugin.define({
  id: "sbugallo.pokecode",
  setup: setupPokecodeServer,
})
