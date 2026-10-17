import { findStarter, locationsForRegion } from "../domain/content/catalog.js"
import type { PokemonInstance } from "../domain/pokemon/model.js"
import type {
  GameplayConfig,
  GameState,
  StarterChoiceResult,
  TeamExport,
  UsageApplication,
  UsageInput,
} from "./contracts/game.js"
import type { ApplicationGamePort } from "./ports/game.js"
import type { StarterIdGenerator } from "./ports/starter-selection-store.js"
import { createChooseRegionalStarter } from "./use-cases/choose-regional-starter.js"
import { createChooseStarter } from "./use-cases/choose-starter.js"
import { createGameCommands } from "./use-cases/game-commands.js"
import { createRecordUsage } from "./use-cases/record-usage.js"

export type GameService = {
  status(): GameState
  chooseStarter(regionId: string, speciesId: string): StarterChoiceResult
  recordUsage(input: UsageInput): UsageApplication
  catchEncounter(encounterId: string): import("./contracts/game.js").EncounterResolutionResult
  runEncounter(encounterId: string): import("./contracts/game.js").EncounterResolutionResult
  collection(): import("./contracts/game.js").PokemonCollection
  dex(): import("./contracts/game.js").PokemonDex
  exportTeam(): TeamExport
  replaceParty(pokemonIds: readonly string[]): import("./contracts/game.js").PartyReplacementResult
  renamePokemon(
    pokemonId: string,
    name: string,
  ): import("./contracts/game.js").PokemonManagementResult
  releasePokemon(pokemonId: string): import("./contracts/game.js").PokemonManagementResult
  travelTo(locationId: string): import("./contracts/game.js").LocationTravelResult
  travelToRegion(regionId: string): import("./contracts/game.js").RegionTravelResult
  dismissNextRegionChoice(): GameState
  reopenNextRegionChoice(): GameState
  resolveMoveChoice(
    choiceId: string,
    selectedMoveId: string,
  ): import("./contracts/game.js").ChoiceResolution
  resolveEvolutionChoice(
    choiceId: string,
    selectedSpeciesId: string,
  ): import("./contracts/game.js").ChoiceResolution
}

export type GameServiceDependencies = {
  readonly repository: ApplicationGamePort
  readonly random: () => number
  readonly now: () => string
  readonly config: GameplayConfig
  readonly createId: () => string
  readonly createStarterIds: StarterIdGenerator
  readonly formatTeam: (party: readonly PokemonInstance[]) => string
}

export function createApplicationGame(dependencies: GameServiceDependencies): GameService {
  const { repository, random, now, config, createId, createStarterIds } = dependencies
  const readState = () => repository.readState(config.locationUnlockTokens)
  const commands = createGameCommands({
    transactions: repository.transactions,
    readState,
    createId,
    now,
    pauseOnPendingChoice: config.pauseOnPendingChoice,
  })
  const recordUsage = createRecordUsage({
    transactions: repository.transactions,
    readState,
    createId,
  })
  const chooseStarter = createChooseStarter({
    store: {
      readState,
      createStarterAtomically: repository.createStarterAtomically,
    },
    random,
    now,
    createIds: createStarterIds,
    firstLocationForRegion: (regionId) => locationsForRegion(regionId)[0],
    findStarter,
  })
  const chooseRegionalStarter = createChooseRegionalStarter(
    {
      transactions: repository.transactions,
      readState,
      createId,
      now,
      pauseOnPendingChoice: config.pauseOnPendingChoice,
    },
    random,
  )

  return {
    status: readState,
    chooseStarter: (regionId, speciesId) =>
      readState().phase === "onboarding"
        ? chooseStarter(regionId, speciesId)
        : chooseRegionalStarter(regionId, speciesId),
    recordUsage: (input) => recordUsage(input, config, random),
    catchEncounter: (encounterId) => commands.catchEncounter(encounterId, random),
    runEncounter: (encounterId) => commands.runEncounter(encounterId),
    collection: () => repository.collection(),
    dex: () => repository.dex(),
    exportTeam: () => {
      const state = readState()
      const party = state.party.flatMap((slot) => (slot.pokemon === null ? [] : [slot.pokemon]))
      return party.length === 0
        ? { kind: "inactive", text: "" }
        : { kind: "exported", text: dependencies.formatTeam(party) }
    },
    replaceParty: commands.replaceParty,
    renamePokemon: commands.renamePokemon,
    releasePokemon: commands.releasePokemon,
    travelTo: commands.travelTo,
    travelToRegion: commands.travelToRegion,
    dismissNextRegionChoice: commands.dismissNextRegionChoice,
    reopenNextRegionChoice: () => commands.reopenNextRegionChoice(now()),
    resolveMoveChoice: (choiceId, selectedMoveId) =>
      commands.resolveMoveChoice(choiceId, selectedMoveId, now()),
    resolveEvolutionChoice: (choiceId, selectedSpeciesId) =>
      commands.resolveEvolutionChoice(choiceId, selectedSpeciesId, now()),
  }
}
