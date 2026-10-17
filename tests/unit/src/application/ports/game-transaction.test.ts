import { expect, test } from "bun:test"
import type { ApplicationGamePort } from "../../../../../src/application/ports/game.js"
import type {
  CommandTransactionRunner,
  GameTransactionRunner,
  UsageTransactionRunner,
} from "../../../../../src/application/ports/game-transaction.js"

type IsAssignable<From, To> = [From] extends [To] ? true : false
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value ? true : false

const capabilityAssignments: readonly [
  IsAssignable<GameTransactionRunner, UsageTransactionRunner>,
  IsAssignable<GameTransactionRunner, CommandTransactionRunner>,
  IsAssignable<UsageTransactionRunner, CommandTransactionRunner>,
  HasKey<ApplicationGamePort, "recordUsage">,
  HasKey<ApplicationGamePort, "selectStarter">,
] = [true, true, false, false, false]

declare const gameTransaction: GameTransactionRunner
if (typeof gameTransaction === "object") {
  // @ts-expect-error Transaction work must remain synchronous.
  gameTransaction.withTransaction(async () => true)
}

test("transaction runners expose only the capabilities allowed by their contracts", () => {
  // GIVEN
  // The assignments and expected compile error above exercise the type contract.

  // WHEN
  const capabilities = capabilityAssignments

  // THEN
  expect(capabilities).toEqual([true, true, false, false, false])
})
