import { describe, expect, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import type { ClipboardService } from "@opentui/core"
import { createPokemonTuiPlugin } from "../../../src/adapters/opencode/tui/plugin.js"
import { registerPokemonSidebar } from "../../../src/adapters/opencode/tui/sidebar/register.js"
import type { GameState } from "../../../src/application/contracts/game.js"
import { deferred, makeTuiRpcTransport, makeTuiState } from "../../support/tui.js"

function clipboard(dispose: () => Promise<void>): ClipboardService {
  return {
    read: async () => ({ status: "empty" }),
    writeText: async () => ({
      host: { status: "not-attempted" },
      terminal: { status: "not-attempted", capability: "unsupported" },
    }),
    clear: async () => ({
      host: { status: "not-attempted" },
      terminal: { status: "not-attempted", capability: "unsupported" },
    }),
    dispose,
  }
}

function makeContext(
  transport: ReturnType<typeof makeTuiRpcTransport>,
  slot: Context["ui"]["slot"],
  notifications: string[] = [],
): Context {
  return {
    client: { rpc: () => transport },
    renderer: {
      capabilities: null,
      on: () => {},
      off: () => {},
    },
    theme: { text: { base: "white", muted: "gray" } },
    ui: {
      toast: {
        show: (options: Parameters<Context["ui"]["toast"]["show"]>[0]) =>
          notifications.push(options.message),
      },
      dialog: {},
      slot,
    },
  } as unknown as Context
}

async function expectSetupFailureAndClean(completion: Promise<unknown>, expected: unknown) {
  let expectationFailure: unknown
  let didExpectationFail = false
  try {
    await expect(completion).rejects.toBe(expected)
  } catch (error) {
    didExpectationFail = true
    expectationFailure = error
  }

  const setupResult = await completion.then(
    (result) => result,
    () => undefined,
  )
  let cleanupFailure: unknown
  if (typeof setupResult === "function") {
    try {
      await setupResult()
    } catch (error) {
      cleanupFailure = error
    }
  }

  if (didExpectationFail && cleanupFailure !== undefined) {
    throw new AggregateError(
      [expectationFailure, cleanupFailure],
      "Unexpected plugin setup also failed to clean up",
      {
        cause: expectationFailure,
      },
    )
  }
  if (didExpectationFail) throw expectationFailure
  if (cleanupFailure !== undefined) throw cleanupFailure
}

describe("TUI plugin lifecycle collaboration", () => {
  test.each([
    {
      name: "initial status fails",
      failure: "status" as const,
      expectedUnsubscribe: 0,
      expectedUnregister: 0,
    },
    {
      name: "event subscription fails",
      failure: "subscription" as const,
      expectedUnsubscribe: 0,
      expectedUnregister: 0,
    },
    {
      name: "sidebar registration fails",
      failure: "sidebar" as const,
      expectedUnsubscribe: 1,
      expectedUnregister: 0,
    },
  ])(
    "disposes only acquired resources when $name",
    async ({ failure, expectedUnsubscribe, expectedUnregister }) => {
      // GIVEN
      const initial = makeTuiState()
      const next = makeTuiState({ location: "kanto-route-1" })
      const counts = { clipboardCreated: 0, clipboardDisposed: 0, unsubscribed: 0, unregistered: 0 }
      const notifications: string[] = []
      const errors = {
        status: new Error("status failed"),
        subscription: new Error("subscription failed"),
        sidebar: new Error("sidebar failed"),
      }
      let lateEvent: ((event: { readonly data: unknown }) => void) | undefined
      let composedState: (() => GameState) | undefined
      const transport = makeTuiRpcTransport({
        status: async () => {
          if (failure === "status") throw errors.status
          return initial
        },
        events: {
          on: (_event, listener) => {
            lateEvent = listener
            if (failure === "subscription") throw errors.subscription
            return () => {
              counts.unsubscribed += 1
            }
          },
        },
      })
      const plugin = createPokemonTuiPlugin({
        createClipboard: () => {
          counts.clipboardCreated += 1
          return clipboard(async () => {
            counts.clipboardDisposed += 1
          })
        },
        registerSidebar: (dependencies) => {
          composedState = dependencies.state
          return registerPokemonSidebar(dependencies)
        },
      })
      const slot: Context["ui"]["slot"] = () => {
        if (failure === "sidebar") throw errors.sidebar
        return () => {
          counts.unregistered += 1
        }
      }

      // WHEN
      const completion = Promise.resolve(plugin.setup(makeContext(transport, slot, notifications)))

      // THEN
      await expectSetupFailureAndClean(completion, errors[failure])
      lateEvent?.({ data: next })
      expect(counts).toEqual({
        clipboardCreated: 1,
        clipboardDisposed: 1,
        unsubscribed: expectedUnsubscribe,
        unregistered: expectedUnregister,
      })
      expect(notifications).toEqual([])
      if (composedState !== undefined) expect(composedState()).toEqual(initial)
    },
  )

  test("guards event and RPC callbacks through asynchronous cleanup", async () => {
    // GIVEN
    const initial = makeTuiState()
    const next = makeTuiState({ location: "kanto-route-1" })
    const travel = deferred<unknown>()
    const clipboardDisposal = deferred<void>()
    const counts: string[] = []
    const notifications: string[] = []
    let eventHandler: ((event: { readonly data: unknown }) => void) | undefined
    let travelToLocation: ((locationId: string) => Promise<void>) | undefined
    let stateAccessor: (() => GameState) | undefined
    const transport = makeTuiRpcTransport({
      status: async () => initial,
      travelTo: async () => travel.promise,
      events: {
        on: (_event, listener) => {
          eventHandler = listener
          return () => counts.push("unsubscribe")
        },
      },
    })
    const plugin = createPokemonTuiPlugin({
      createClipboard: () =>
        clipboard(() => {
          counts.push("clipboard")
          return clipboardDisposal.promise
        }),
      registerSidebar: (dependencies) => {
        travelToLocation = dependencies.actions.travelToLocation
        stateAccessor = dependencies.state
        return registerPokemonSidebar(dependencies)
      },
    })
    const slot: Context["ui"]["slot"] = () => () => counts.push("slot")
    let cleanup: (() => void | Promise<void>) | undefined
    let cleanupPromise: Promise<void> | undefined
    let pendingTravel: Promise<void> | undefined
    let testFailure: unknown
    let didTestFail = false
    const cleanupFailures: unknown[] = []

    try {
      const setupCleanup = await plugin.setup(makeContext(transport, slot, notifications))
      if (typeof setupCleanup === "function") cleanup = setupCleanup
      if (
        typeof setupCleanup !== "function" ||
        stateAccessor === undefined ||
        travelToLocation === undefined
      ) {
        throw new Error("Plugin setup did not compose its lifecycle resources")
      }
      const stateBeforeCleanup = stateAccessor()
      pendingTravel = travelToLocation("kanto-route-1")

      // WHEN
      cleanupPromise = Promise.resolve(setupCleanup())
      eventHandler?.({ data: next })
      travel.resolve({ kind: "teleported", state: next })
      await pendingTravel
      let cleanupSettled = false
      const observedCleanup = cleanupPromise.then(() => {
        cleanupSettled = true
      })
      await Promise.resolve()
      expect(cleanupSettled).toBe(false)
      clipboardDisposal.resolve()
      await observedCleanup

      // THEN
      expect(counts).toEqual(["unsubscribe", "slot", "clipboard"])
      expect(stateAccessor()).toBe(stateBeforeCleanup)
      expect(notifications).toEqual([])
    } catch (error) {
      didTestFail = true
      testFailure = error
    } finally {
      travel.resolve({ kind: "teleported", state: next })
      clipboardDisposal.resolve()
      if (cleanup !== undefined && cleanupPromise === undefined) {
        try {
          cleanupPromise = Promise.resolve(cleanup())
        } catch (error) {
          cleanupFailures.push(error)
        }
      }
      const pending = [
        ...(pendingTravel === undefined ? [] : [pendingTravel]),
        ...(cleanupPromise === undefined ? [] : [cleanupPromise]),
      ]
      const outcomes = await Promise.allSettled(pending)
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") cleanupFailures.push(outcome.reason)
      }
    }

    if (didTestFail && cleanupFailures.length > 0) {
      throw new AggregateError(
        [testFailure, ...cleanupFailures],
        "Plugin lifecycle test and teardown failed",
        {
          cause: testFailure,
        },
      )
    }
    if (didTestFail) throw testFailure
    if (cleanupFailures.length === 1) throw cleanupFailures[0]
    if (cleanupFailures.length > 1)
      throw new AggregateError(cleanupFailures, "Plugin lifecycle teardown failed")
  })

  test("retains both setup and disposal errors at the plugin boundary", async () => {
    // GIVEN
    const setupError = new Error("initial status failed")
    const disposalError = new Error("clipboard disposal failed")
    const plugin = createPokemonTuiPlugin({
      createClipboard: () =>
        clipboard(async () => {
          throw disposalError
        }),
    })
    const transport = makeTuiRpcTransport({
      status: async () => {
        throw setupError
      },
    })

    // WHEN
    const completion = plugin.setup(makeContext(transport, () => () => {}))

    // THEN
    await expect(completion).rejects.toMatchObject({
      errors: [setupError, disposalError],
      cause: setupError,
    })
  })

  test("does not dispose a clipboard resource that was never acquired", async () => {
    // GIVEN
    const rpcError = new Error("RPC facade construction failed")
    let clipboardDisposals = 0
    const plugin = createPokemonTuiPlugin({
      createClipboard: () =>
        clipboard(async () => {
          clipboardDisposals += 1
        }),
    })
    const context = {
      ...makeContext(makeTuiRpcTransport(), () => () => {}),
      client: {
        rpc: () => {
          throw rpcError
        },
      },
    } as unknown as Context

    // WHEN
    const completion = plugin.setup(context)

    // THEN
    await expect(completion).rejects.toBe(rpcError)
    expect(clipboardDisposals).toBe(0)
  })
})
