import { describe, expect, test } from "bun:test"
import { sidebarViewFor } from "../../../../../../../src/adapters/opencode/tui/sidebar/view.js"
import { makeTuiState } from "../../../../../../support/tui.js"

describe("sidebar view precedence", () => {
  test.each([
    {
      name: "onboarding shows starter selection",
      state: makeTuiState({ phase: "onboarding", region: null, location: null }),
      view: "starter",
    },
    {
      name: "move choices take priority over encounters",
      state: makeTuiState({
        pendingChoices: [
          { id: "00000000-0000-4000-8000-000000000001", kind: "move", payload: "{}" },
        ],
        pendingEncounter: {
          id: "00000000-0000-4000-8000-000000000002",
          kind: "ordinary",
          speciesId: "pidgey",
          name: "Pidgey",
          level: 2,
          gender: "female",
          shiny: false,
          spriteUrl: "https://example.test/pidgey.png",
        },
      }),
      view: "move",
    },
    {
      name: "evolution choices take priority over encounters",
      state: makeTuiState({
        pendingChoices: [
          { id: "00000000-0000-4000-8000-000000000003", kind: "evolution", payload: "{}" },
        ],
        pendingEncounter: {
          id: "00000000-0000-4000-8000-000000000004",
          kind: "ordinary",
          speciesId: "pidgey",
          name: "Pidgey",
          level: 2,
          gender: "female",
          shiny: false,
          spriteUrl: "https://example.test/pidgey.png",
        },
      }),
      view: "evolution",
    },
    {
      name: "region choices take priority over encounters",
      state: makeTuiState({
        pendingChoices: [
          { id: "00000000-0000-4000-8000-000000000005", kind: "region", payload: "{}" },
        ],
        pendingEncounter: {
          id: "00000000-0000-4000-8000-000000000006",
          kind: "ordinary",
          speciesId: "pidgey",
          name: "Pidgey",
          level: 2,
          gender: "female",
          shiny: false,
          spriteUrl: "https://example.test/pidgey.png",
        },
      }),
      view: "region",
    },
    {
      name: "an encounter takes priority over the team",
      state: makeTuiState({
        pendingEncounter: {
          id: "00000000-0000-4000-8000-000000000007",
          kind: "ordinary",
          speciesId: "pidgey",
          name: "Pidgey",
          level: 2,
          gender: "female",
          shiny: false,
          spriteUrl: "https://example.test/pidgey.png",
        },
      }),
      view: "encounter",
    },
    { name: "the team is shown without higher-priority work", state: makeTuiState(), view: "team" },
  ])("$name", ({ state, view }) => {
    // GIVEN

    // WHEN
    const actual = sidebarViewFor(state)

    // THEN
    expect(actual).toBe(view)
  })
})
