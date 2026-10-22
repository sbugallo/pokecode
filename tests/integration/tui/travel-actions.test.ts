import { describe, expect, test } from "bun:test"
import { createTuiStateCoordinator } from "../../../src/adapters/opencode/tui/state/coordinator.js"
import { createLocationTravelAction } from "../../../src/adapters/opencode/tui/travel/actions.js"
import { makeTuiClient, makeTuiState } from "../../support/tui.js"

const activeExploration = {
  locations: [{ id: "pallet-town", name: "Pallet Town", unlocked: true, encounterless: true }],
  locationUnlockProgress: 0,
  locationUnlockThreshold: 100,
  regionComplete: false,
}

describe("location travel action", () => {
  test.each([
    { name: "state has no exploration", state: makeTuiState({ exploration: null }) },
    {
      name: "state has no region",
      state: makeTuiState({ region: null, location: null, exploration: activeExploration }),
    },
  ])("does not request dex data or open travel when $name", async ({ state: reopened }) => {
    // GIVEN
    const calls: string[] = []
    const dialog: string[] = []
    const action = createLocationTravelAction({
      rpc: makeTuiClient({
        status: async () => reopened,
        dex: async () => {
          calls.push("dex")
          return { pokemon: [], discoveries: [] }
        },
      }),
      state: createTuiStateCoordinator(makeTuiState(), () => {}),
      dialog: {
        show: () => dialog.push("show"),
        set: () => dialog.push("set"),
        clear: () => dialog.push("clear"),
      },
      resolveSprite: async () => ({ kind: "placeholder" }),
      imageProtocol: () => "auto",
      travelToLocation: async () => {},
    })

    // WHEN
    await action()

    // THEN
    expect(calls).toEqual([])
    expect(dialog).toEqual([])
  })

  test("opens locations without dismissing or reopening a pending region unlock", async () => {
    const current = makeTuiState({
      exploration: activeExploration,
      pendingChoices: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          kind: "region",
          payload: '{"region":"kanto"}',
        },
      ],
    })
    const calls: string[] = []
    const state = createTuiStateCoordinator(makeTuiState(), () => {})
    const action = createLocationTravelAction({
      rpc: makeTuiClient({
        status: async () => current,
        dex: async () => ({ pokemon: [], discoveries: [] }),
      }),
      state,
      dialog: { show: () => calls.push("show"), set: () => calls.push("set"), clear: () => {} },
      resolveSprite: async () => ({ kind: "placeholder" }),
      imageProtocol: () => "auto",
      travelToLocation: async () => {},
    })
    await action()
    expect(calls).toEqual(["show", "set"])
  })
})
