import { describe, expect, test } from "bun:test"
import {
  createPartyReplacementConfirmation,
  createPcAction,
} from "../../../src/adapters/opencode/tui/pc/actions.js"
import { createTuiStateCoordinator } from "../../../src/adapters/opencode/tui/state/coordinator.js"
import { deferred, makeTuiClient, makeTuiState } from "../../support/tui.js"

describe("PC actions", () => {
  test("opens the PC in a large centered modal", async () => {
    const settings: unknown[] = []
    const action = createPcAction({
      rpc: makeTuiClient({ collection: async () => ({ pokemon: [] }) }),
      state: createTuiStateCoordinator(makeTuiState(), () => {}),
      dialog: {
        show: () => {},
        set: (options) => {
          settings.push(options)
        },
        clear: () => {},
      },
      theme: { base: () => "white", muted: () => "gray" },
      resolveSprite: async () => ({ kind: "placeholder" }),
    })
    await action()
    expect(settings).toEqual([{ size: "large", centered: true }])
  })

  test("does not open a PC dialog when collection resolves after disposal", async () => {
    // GIVEN
    const response = deferred<unknown>()
    const state = createTuiStateCoordinator(makeTuiState(), () => {})
    const dialogs: string[] = []
    const action = createPcAction({
      rpc: makeTuiClient({ collection: async () => response.promise }),
      state,
      dialog: {
        show: () => dialogs.push("show"),
        set: () => dialogs.push("set"),
        clear: () => dialogs.push("clear"),
      },
      theme: { base: () => "white", muted: () => "gray" },
      resolveSprite: async () => ({ kind: "placeholder" }),
    })
    const completion = action()

    // WHEN
    try {
      state.dispose()
      response.resolve({ pokemon: [] })
      await completion
    } finally {
      response.resolve({ pokemon: [] })
      await completion
    }

    // THEN
    expect(dialogs).toEqual([])
  })

  test("does not apply a party replacement response after disposal", async () => {
    // GIVEN
    const response = deferred<unknown>()
    const initial = makeTuiState()
    const state = createTuiStateCoordinator(initial, () => {})
    const confirm = createPartyReplacementConfirmation({
      rpc: makeTuiClient({ replaceParty: async () => response.promise }),
      state,
    })
    const completion = confirm(["00000000-0000-4000-8000-000000000004"])

    // WHEN
    try {
      state.dispose()
      response.resolve({ kind: "replaced", state: makeTuiState({ location: "kanto-route-1" }) })
      const replaced = await completion

      // THEN
      expect(replaced).toBe(false)
      expect(state.state()).toBe(initial)
    } finally {
      response.resolve({ kind: "replaced", state: makeTuiState({ location: "kanto-route-1" }) })
      await completion
    }
  })
})
