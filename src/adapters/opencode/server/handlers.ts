import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { z } from "zod"

import {
  evolutionChoiceInputSchema,
  type GameState,
  locationTravelInputSchema,
  moveChoiceInputSchema,
  type PokemonCollection,
  type PokemonDex,
  partyReplacementInputSchema,
  pokemonReleaseInputSchema,
  pokemonRenameInputSchema,
  regionTravelInputSchema,
  starterChoiceInputSchema,
} from "../../../application/contracts/game.js"
import type { GameService } from "../../../application/game.js"
import type { SpriteCache } from "../../sprites/cache.js"
import { spriteInputSchema } from "../../sprites/contracts.js"
import type { PokecodeRpc } from "../rpc/contract.js"

type StateResult = { readonly kind: string; readonly state: GameState }
type StatePublisher = (state: GameState) => Promise<void>
type ResponseLocalizers = {
  readonly state: (state: GameState) => GameState
  readonly collection: (collection: PokemonCollection) => PokemonCollection
  readonly dex: (dex: PokemonDex) => PokemonDex
}

type HandlerDependencies = {
  readonly game: GameService
  readonly localizers: ResponseLocalizers
  readonly sprites: Pick<SpriteCache, "resolve">
  readonly publishStatusChanged: StatePublisher
}

export function createPokecodeHandlers(
  dependencies: HandlerDependencies,
): RpcHandlers<typeof PokecodeRpc> {
  const { game, localizers, sprites, publishStatusChanged } = dependencies

  const withResultState =
    <Input, Result extends StateResult>(
      parse: (input: unknown) => Input,
      execute: (input: Input) => Result,
    ) =>
    async (rawInput: unknown): Promise<Result> => {
      const input = parse(rawInput)
      const result = execute(input)
      const state = localizers.state(result.state)
      await publishStatusChanged(state)
      return { ...result, state }
    }

  const withDirectState =
    <Input>(parse: (input: unknown) => Input, execute: (input: Input) => GameState) =>
    async (rawInput: unknown): Promise<GameState> => {
      const input = parse(rawInput)
      const state = localizers.state(execute(input))
      await publishStatusChanged(state)
      return state
    }

  const noInput = (_input: unknown): undefined => undefined
  const encounterInput = z.object({ encounterId: z.string().uuid() }).strict().parse

  return {
    status: async () => localizers.state(game.status()),
    chooseStarter: withResultState(starterChoiceInputSchema.parse, ({ regionId, speciesId }) =>
      game.chooseStarter(regionId, speciesId),
    ),
    travelTo: withResultState(locationTravelInputSchema.parse, ({ locationId }) =>
      game.travelTo(locationId),
    ),
    travelToRegion: withResultState(regionTravelInputSchema.parse, ({ regionId }) =>
      game.travelToRegion(regionId),
    ),
    catchEncounter: withResultState(encounterInput, ({ encounterId }) =>
      game.catchEncounter(encounterId),
    ),
    runEncounter: withResultState(encounterInput, ({ encounterId }) =>
      game.runEncounter(encounterId),
    ),
    collection: async () => localizers.collection(game.collection()),
    dex: async () => localizers.dex(game.dex()),
    exportTeam: async () => game.exportTeam(),
    sprite: async (input) => sprites.resolve(spriteInputSchema.parse(input)),
    replaceParty: withResultState(partyReplacementInputSchema.parse, ({ pokemonIds }) =>
      game.replaceParty(pokemonIds),
    ),
    renamePokemon: withResultState(pokemonRenameInputSchema.parse, ({ pokemonId, name }) =>
      game.renamePokemon(pokemonId, name),
    ),
    releasePokemon: withResultState(pokemonReleaseInputSchema.parse, ({ pokemonId }) =>
      game.releasePokemon(pokemonId),
    ),
    resolveMoveChoice: withResultState(
      moveChoiceInputSchema.parse,
      ({ choiceId, selectedMoveId }) => game.resolveMoveChoice(choiceId, selectedMoveId),
    ),
    resolveEvolutionChoice: withResultState(
      evolutionChoiceInputSchema.parse,
      ({ choiceId, selectedSpeciesId }) => game.resolveEvolutionChoice(choiceId, selectedSpeciesId),
    ),
    dismissNextRegionChoice: withDirectState(noInput, () => game.dismissNextRegionChoice()),
    reopenNextRegionChoice: withDirectState(noInput, () => game.reopenNextRegionChoice()),
  }
}
