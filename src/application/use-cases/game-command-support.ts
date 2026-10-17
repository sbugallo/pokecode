import type { GameState } from "../contracts/game.js"
import type {
  CommandTransactionRunner,
  CommandWorkflowStores,
  SynchronousTransactionResult,
} from "../ports/game-transaction.js"
import {
  resolveSavedExperienceLevels,
  resolveUnblockedPokemonLevels,
} from "./resolve-progression.js"

export type GameCommandDependencies = {
  readonly transactions: CommandTransactionRunner
  readonly readState: () => GameState
  readonly createId: () => string
  readonly now: () => string
  readonly pauseOnPendingChoice: boolean
}

export function resumeUnblockedProgression(
  dependencies: GameCommandDependencies,
  stores: CommandWorkflowStores,
  trainerId: string,
  regionId: string,
  createdAt = dependencies.now(),
): void {
  if (!dependencies.pauseOnPendingChoice || stores.choices.hasPending(trainerId)) return
  resolveUnblockedPokemonLevels(stores, trainerId, regionId, createdAt, dependencies.createId)
}

export function resumeSavedExperienceIfUnblocked(
  dependencies: GameCommandDependencies,
  stores: CommandWorkflowStores,
  trainerId: string,
  regionId: string,
): void {
  if (!dependencies.pauseOnPendingChoice || stores.choices.hasPending(trainerId)) return
  resolveSavedExperienceLevels(
    stores,
    trainerId,
    regionId,
    dependencies.now(),
    dependencies.createId,
  )
}

export function afterGameTransaction<Result extends string>(
  dependencies: GameCommandDependencies,
  work: (stores: CommandWorkflowStores) => SynchronousTransactionResult<Result>,
): { readonly kind: Result; readonly state: GameState } {
  const kind = dependencies.transactions.withTransaction(work)
  return { kind, state: dependencies.readState() }
}
