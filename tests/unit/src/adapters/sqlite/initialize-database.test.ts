import { expect, test } from "bun:test"
import { initializeSqliteDatabase } from "../../../../../src/adapters/sqlite/initialize-database.js"

test("failed initialization closes the database and rethrows the initialization failure", () => {
  // GIVEN
  const failure = new Error("file is not a database")
  let closes = 0

  // WHEN
  let observed: unknown
  try {
    initializeSqliteDatabase(
      {
        close() {
          closes += 1
        },
      },
      () => {
        throw failure
      },
    )
  } catch (error) {
    observed = error
  }

  // THEN
  expect(observed).toBe(failure)
  expect(closes).toBe(1)
})

test("failed initialization closes the database and preserves both failures", () => {
  // GIVEN
  const initializationFailure = new Error("schema initialization failed")
  const closeFailure = new Error("close failed")
  const events: string[] = []

  // WHEN
  let observed: unknown
  try {
    initializeSqliteDatabase(
      {
        close() {
          events.push("close")
          throw closeFailure
        },
      },
      () => {
        events.push("initialize")
        throw initializationFailure
      },
    )
  } catch (error) {
    observed = error
  }

  // THEN
  expect(observed).toBeInstanceOf(AggregateError)
  expect((observed as AggregateError).errors).toEqual([initializationFailure, closeFailure])
  expect(events).toEqual(["initialize", "close"])
})

test("successful initialization leaves the database open for its owner", () => {
  // GIVEN
  let closes = 0
  let initialized = false

  // WHEN
  initializeSqliteDatabase(
    {
      close() {
        closes += 1
      },
    },
    () => {
      initialized = true
    },
  )

  // THEN
  expect(initialized).toBe(true)
  expect(closes).toBe(0)
})
