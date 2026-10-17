import type { DomainChoice } from "../../domain/choices/choices.js"
import type { StarterCreationData } from "../../domain/pokemon/starter.js"
import type { Move, PokemonGender } from "../../domain/pokemon/types.js"
import type { UsageInput } from "../contracts/game.js"

export type TransactionTrainer = {
  readonly id: string
  readonly regionId: string
  readonly locationId: string
}

export type PartyProgressPokemon = {
  readonly id: string
  readonly speciesId: string
  readonly gender: PokemonGender
  readonly level: number
  readonly experience: number
}

export type StoredPokemonMove = Move & { readonly position: number }

export type EncounterProgress = {
  readonly tokenCount: number
  readonly threshold: number
}

export type PendingEncounterWrite = {
  readonly id: string
  readonly trainerId: string
  readonly kind: "ordinary" | "special"
  readonly speciesId: string
  readonly name: string
  readonly specialEncounterId: string | null
  readonly level: number
  readonly gender: PokemonGender
  readonly shiny: boolean
  readonly spriteUrl: string
  readonly ability: string
  readonly createdAt: string
}

export type PendingChoiceWrite = DomainChoice & {
  readonly id: string
  readonly trainerId: string
  readonly createdAt: string
}

export type PendingEncounterSnapshot = {
  readonly id: string
  readonly kind: "ordinary" | "special"
  readonly speciesId: string
  readonly name: string
  readonly level: number
  readonly gender: "male" | "female" | "genderless"
  readonly shiny: boolean
  readonly spriteUrl: string
  readonly ability: string
}

export type ChoiceForResolution = DomainChoice & {
  readonly id: string
}

export type CommandTransactionStores = {
  readonly encounters: {
    pending(trainerId: string, encounterId: string): PendingEncounterSnapshot | null
    clearPending(trainerId: string, encounterId: string): void
  }
  readonly choices: {
    find(
      trainerId: string,
      choiceId: string,
      kind: "move" | "evolution" | "starter",
    ): ChoiceForResolution | null
    hasKind(trainerId: string, kind: "region"): boolean
    delete(choiceId: string): void
    deleteCatch(trainerId: string, encounterId: string): void
    deleteKind(trainerId: string, kind: "region"): void
  }
  readonly pokemon: {
    insertStarter(input: {
      readonly id: string
      readonly trainerId: string
      readonly starter: StarterCreationData
    }): void
    ownedCount(trainerId: string, pokemonIds: readonly string[]): number
    replaceParty(trainerId: string, pokemonIds: readonly string[]): void
    rename(trainerId: string, pokemonId: string, name: string): void
    release(trainerId: string, pokemonId: string): void
    insertCaptured(input: {
      readonly id: string
      readonly trainerId: string
      readonly encounter: PendingEncounterSnapshot
      readonly nature: string
      readonly ivs: readonly [number, number, number, number, number, number]
      readonly moves: readonly Move[]
    }): void
    markCaught(trainerId: string, speciesId: string): void
    firstEmptyPartyPosition(trainerId: string): number | null
    assignPartyPosition(trainerId: string, pokemonId: string, position: number): void
    replaceMove(pokemonId: string, position: number, move: Move): void
    level(pokemonId: string): number | null
  }
  readonly exploration: {
    locationUnlocked(trainerId: string, locationId: string): boolean
    regionCompleted(trainerId: string, regionId: string): boolean
    regionVisited(trainerId: string, regionId: string): boolean
    travelToLocation(trainerId: string, regionId: string, locationId: string): void
    initializeRegion(trainerId: string, regionId: string, locationId: string): void
    setRegionDismissed(trainerId: string, regionId: string, dismissed: boolean): void
  }
}

export type UsageTransactionStores = {
  readonly receipts: {
    /** Uses the durable `(session_id, message_id)` uniqueness constraint. */
    claim(input: {
      readonly id: string
      readonly trainerId: string | null
      readonly usage: UsageInput
      readonly tokenCount: number
    }): boolean
  }
  readonly trainers: {
    find(): TransactionTrainer | null
    findById(trainerId: string): TransactionTrainer | null
  }
  readonly choices: {
    hasPending(trainerId: string): boolean
    hasPokemonChoice(
      trainerId: string,
      pokemonId: string,
      kind: "move" | "evolution",
      moveId?: string,
    ): boolean
    insert(choice: PendingChoiceWrite): void
  }
  readonly pokemon: {
    addPartyExperience(trainerId: string, amount: number): void
    party(trainerId: string): readonly PartyProgressPokemon[]
    offPartyWithExperience(trainerId: string): readonly PartyProgressPokemon[]
    findOwned(trainerId: string, pokemonId: string): PartyProgressPokemon | null
    setLevel(pokemonId: string, level: number, experience: number): void
    evolve(pokemonId: string, speciesId: string, name: string): void
    moves(pokemonId: string): readonly StoredPokemonMove[]
    learnMove(pokemonId: string, position: number, move: Move): void
    markSeen(trainerId: string, speciesId: string): void
  }
  readonly exploration: {
    latestUnlockedLocation(trainerId: string): string | null
    unlockTokenCount(trainerId: string): number
    setUnlockTokenCount(trainerId: string, tokenCount: number): void
    unlockLocation(trainerId: string, locationId: string): void
    completeRegion(trainerId: string, regionId: string): boolean
    visitedRegionIds(trainerId: string): readonly string[]
  }
  readonly encounters: {
    hasPending(trainerId: string): boolean
    progress(trainerId: string): EncounterProgress | null
    saveProgress(trainerId: string, tokenCount: number, threshold: number): void
    maximumPartyLevel(trainerId: string): number
    triggeredSpecialIds(trainerId: string): ReadonlySet<string>
    markSpecialTriggered(trainerId: string, specialEncounterId: string, triggeredAt: string): void
    insertPending(encounter: PendingEncounterWrite): void
  }
}

/**
 * The callback is deliberately synchronous. Every feature store supplied to it
 * is scoped to this one transaction/connection and must not commit independently.
 */
export type GameTransactionStores = UsageTransactionStores & {
  readonly commands: CommandTransactionStores
}

export type ProgressionTransactionStores = {
  readonly choices: Pick<
    UsageTransactionStores["choices"],
    "insert" | "hasPending" | "hasPokemonChoice"
  >
  readonly pokemon: Pick<
    UsageTransactionStores["pokemon"],
    "party" | "offPartyWithExperience" | "findOwned" | "setLevel" | "evolve" | "moves" | "learnMove"
  >
}

export type CommandWorkflowStores = ProgressionTransactionStores & {
  readonly trainers: Pick<UsageTransactionStores["trainers"], "find">
  readonly commands: CommandTransactionStores
}

export type SynchronousTransactionResult<Result> =
  Result extends PromiseLike<unknown> ? never : Result

export type TransactionRunner<Stores> = {
  withTransaction<Result>(work: (stores: Stores) => SynchronousTransactionResult<Result>): Result
}

export type UsageTransactionRunner = TransactionRunner<UsageTransactionStores>
export type GameTransactionRunner = TransactionRunner<GameTransactionStores>
export type CommandTransactionRunner = TransactionRunner<CommandWorkflowStores>
