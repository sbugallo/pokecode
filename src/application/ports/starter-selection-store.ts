import type { StarterCreationData } from "../../domain/pokemon/starter.js"
import type { PokemonGender } from "../../domain/pokemon/types.js"

export type StarterCreationCommand = Omit<StarterCreationData, "gender"> & {
  readonly gender: PokemonGender
  readonly regionId: string
  readonly locationId: string
  readonly selectedAt: string
}

export type StarterIds = {
  readonly trainerId: string
  readonly pokemonId: string
}

export type StarterIdGenerator = () => StarterIds

export type StarterGameState = {
  readonly phase: "onboarding" | "active"
}

/** Atomically creates the initial trainer, progress, Pokémon, party, moves, and Pokédex rows. */
export type StarterSelectionStore<TState extends StarterGameState> = {
  readState(): TState
  /** Returns false if another selection already created the trainer. */
  createStarterAtomically(selection: StarterCreationCommand, createIds: StarterIdGenerator): boolean
}
