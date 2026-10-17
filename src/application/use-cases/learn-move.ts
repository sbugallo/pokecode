import type { DomainChoice } from "../../domain/choices/choices.js"
import type { Move } from "../../domain/pokemon/types.js"
import { moveLearningDecision } from "../../domain/progression/policies.js"
import type { PendingChoiceWrite, StoredPokemonMove } from "../ports/game-transaction.js"

export type MoveLearningStores = {
  readonly pokemon: {
    moves(pokemonId: string): readonly StoredPokemonMove[]
    learnMove(pokemonId: string, position: number, move: Move): void
  }
  readonly choices: {
    insert(choice: PendingChoiceWrite): void
    hasPokemonChoice(
      trainerId: string,
      pokemonId: string,
      kind: "move" | "evolution",
      moveId?: string,
    ): boolean
  }
}

export type LearnMoveInput = {
  readonly trainerId: string
  readonly pokemonId: string
  readonly move: Move
  readonly createdAt: string
  readonly createId: () => string
}

/** Applies the shared persistence-side outcome of the domain move-learning policy. */
export function learnMove(stores: MoveLearningStores, input: LearnMoveInput): void {
  const decision = moveLearningDecision(stores.pokemon.moves(input.pokemonId), input.move)
  if (decision.kind === "already-known") return
  if (decision.kind === "learn") {
    stores.pokemon.learnMove(input.pokemonId, decision.position, input.move)
    return
  }

  const choice: DomainChoice = {
    kind: "move",
    payload: { pokemonId: input.pokemonId, move: input.move },
  }
  if (stores.choices.hasPokemonChoice(input.trainerId, input.pokemonId, "move", input.move.id))
    return
  stores.choices.insert({
    ...choice,
    id: input.createId(),
    trainerId: input.trainerId,
    createdAt: input.createdAt,
  })
}
