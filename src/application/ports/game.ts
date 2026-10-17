import type { GameState, PokemonCollection, PokemonDex } from "../contracts/game.js"
import type { GameTransactionRunner } from "./game-transaction.js"
import type { StarterCreationCommand, StarterIdGenerator } from "./starter-selection-store.js"

export type ApplicationGamePort = {
  readonly transactions: GameTransactionRunner
  readState(locationUnlockThreshold: number): GameState
  createStarterAtomically(selection: StarterCreationCommand, createIds: StarterIdGenerator): boolean
  collection(): PokemonCollection
  dex(): PokemonDex
}
