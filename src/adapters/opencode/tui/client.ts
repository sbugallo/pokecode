import type {
  ChoiceResolutionResult,
  EncounterResolutionResult,
  EvolutionChoiceInput,
  LocationTravelInput,
  LocationTravelResult,
  MoveChoiceInput,
  PartyReplacementInput,
  PartyReplacementResult,
  PokemonCollection,
  PokemonDex,
  PokemonManagementResult,
  PokemonReleaseInput,
  PokemonRenameInput,
  RegionTravelInput,
  RegionTravelResult,
  StarterChoiceInput,
  StarterChoiceResult,
  TeamExport,
} from "../../../application/contracts/game.js"
import {
  choiceResolutionResultSchema,
  encounterResolutionResultSchema,
  type GameState,
  gameStateSchema,
  locationTravelResultSchema,
  partyReplacementResultSchema,
  pokemonCollectionSchema,
  pokemonDexSchema,
  pokemonManagementResultSchema,
  regionTravelResultSchema,
  starterChoiceResultSchema,
  teamExportSchema,
} from "../../../application/contracts/game.js"
import type { SpriteInput, SpriteResolution } from "../../sprites/contracts.js"
import { spriteResolutionSchema } from "../../sprites/contracts.js"

export type EncounterResolutionInput = { readonly encounterId: string }

/** Explicit transport surface for the PokéCode RPC methods consumed by the TUI. */
export interface PokemonTuiRpcTransport {
  status(input: Record<string, never>): Promise<unknown>
  chooseStarter(input: StarterChoiceInput): Promise<unknown>
  travelTo(input: LocationTravelInput): Promise<unknown>
  travelToRegion(input: RegionTravelInput): Promise<unknown>
  catchEncounter(input: EncounterResolutionInput): Promise<unknown>
  runEncounter(input: EncounterResolutionInput): Promise<unknown>
  collection(input: Record<string, never>): Promise<unknown>
  dex(input: Record<string, never>): Promise<unknown>
  exportTeam(input: Record<string, never>): Promise<unknown>
  sprite(input: SpriteInput): Promise<unknown>
  replaceParty(input: PartyReplacementInput): Promise<unknown>
  renamePokemon(input: PokemonRenameInput): Promise<unknown>
  releasePokemon(input: PokemonReleaseInput): Promise<unknown>
  resolveMoveChoice(input: MoveChoiceInput): Promise<unknown>
  resolveEvolutionChoice(input: EvolutionChoiceInput): Promise<unknown>
  dismissNextRegionChoice(input: Record<string, never>): Promise<unknown>
  reopenNextRegionChoice(input: Record<string, never>): Promise<unknown>
  readonly events: {
    on(event: "statusChanged", listener: (event: { readonly data: unknown }) => void): () => void
  }
}

/** Parsed RPC facade: every response and event is decoded exactly once at this boundary. */
export function createPokemonTuiClient(transport: PokemonTuiRpcTransport) {
  return {
    status: async (input: Record<string, never> = {}) =>
      gameStateSchema.parse(await transport.status(input)),
    chooseStarter: async (input: StarterChoiceInput): Promise<StarterChoiceResult> =>
      starterChoiceResultSchema.parse(await transport.chooseStarter(input)),
    travelTo: async (input: LocationTravelInput): Promise<LocationTravelResult> =>
      locationTravelResultSchema.parse(await transport.travelTo(input)),
    travelToRegion: async (input: RegionTravelInput): Promise<RegionTravelResult> =>
      regionTravelResultSchema.parse(await transport.travelToRegion(input)),
    catchEncounter: async (input: EncounterResolutionInput): Promise<EncounterResolutionResult> =>
      encounterResolutionResultSchema.parse(await transport.catchEncounter(input)),
    runEncounter: async (input: EncounterResolutionInput): Promise<EncounterResolutionResult> =>
      encounterResolutionResultSchema.parse(await transport.runEncounter(input)),
    collection: async (input: Record<string, never> = {}): Promise<PokemonCollection> =>
      pokemonCollectionSchema.parse(await transport.collection(input)),
    dex: async (input: Record<string, never> = {}): Promise<PokemonDex> =>
      pokemonDexSchema.parse(await transport.dex(input)),
    exportTeam: async (input: Record<string, never> = {}): Promise<TeamExport> =>
      teamExportSchema.parse(await transport.exportTeam(input)),
    sprite: async (input: SpriteInput): Promise<SpriteResolution> =>
      spriteResolutionSchema.parse(await transport.sprite(input)),
    replaceParty: async (input: PartyReplacementInput): Promise<PartyReplacementResult> =>
      partyReplacementResultSchema.parse(await transport.replaceParty(input)),
    renamePokemon: async (input: PokemonRenameInput): Promise<PokemonManagementResult> =>
      pokemonManagementResultSchema.parse(await transport.renamePokemon(input)),
    releasePokemon: async (input: PokemonReleaseInput): Promise<PokemonManagementResult> =>
      pokemonManagementResultSchema.parse(await transport.releasePokemon(input)),
    resolveMoveChoice: async (input: MoveChoiceInput): Promise<ChoiceResolutionResult> =>
      choiceResolutionResultSchema.parse(await transport.resolveMoveChoice(input)),
    resolveEvolutionChoice: async (input: EvolutionChoiceInput): Promise<ChoiceResolutionResult> =>
      choiceResolutionResultSchema.parse(await transport.resolveEvolutionChoice(input)),
    dismissNextRegionChoice: async (input: Record<string, never> = {}): Promise<GameState> =>
      gameStateSchema.parse(await transport.dismissNextRegionChoice(input)),
    reopenNextRegionChoice: async (input: Record<string, never> = {}): Promise<GameState> =>
      gameStateSchema.parse(await transport.reopenNextRegionChoice(input)),
    onStatusChanged(listener: (state: GameState) => void): () => void {
      return transport.events.on("statusChanged", (event) => {
        listener(gameStateSchema.parse(event.data))
      })
    },
  }
}
