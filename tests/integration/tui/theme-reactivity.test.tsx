import { describe, expect } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import type { testRender } from "@opentui/solid"
import { createSignal, type JSX } from "solid-js"
import "../../../src/adapters/opencode/tui/controls/native.js"
import { createPcAction } from "../../../src/adapters/opencode/tui/pc/actions.js"
import { SidebarTitle } from "../../../src/adapters/opencode/tui/sidebar/register.js"
import { StarterButtons } from "../../../src/adapters/opencode/tui/sidebar/view.js"
import { createTuiStateCoordinator } from "../../../src/adapters/opencode/tui/state/coordinator.js"
import { makeTuiClient, makeTuiState, renderTui, testTui } from "../../support/tui.js"

function spanColor(
  rendered: Awaited<ReturnType<typeof testRender>>,
  text: string,
  channel: "fg" | "bg",
) {
  return rendered
    .captureSpans()
    .lines.flatMap((line) => line.spans)
    .find((span) => span.text.includes(text))?.[channel]
}

describe("reactive TUI theme accessors", () => {
  testTui("keeps sidebar, hover, and PC dialog colors live across theme changes", async () => {
    // GIVEN
    const [base, setBase] = createSignal("#ffffff")
    const [muted, setMuted] = createSignal("#888888")
    let renderDialog: (() => JSX.Element) | undefined
    const dialog: Pick<Context["ui"]["dialog"], "show" | "set" | "clear"> = {
      show: (render) => {
        renderDialog = render
      },
      set: () => {},
      clear: () => {},
    }
    const chooseParty = createPcAction({
      rpc: makeTuiClient({ collection: async () => ({ pokemon: [] }) }),
      state: createTuiStateCoordinator(makeTuiState(), () => {}),
      dialog,
      theme: { base, muted },
      resolveSprite: async () => ({ kind: "placeholder" }),
      imageProtocol: () => "auto",
    })
    await chooseParty()
    if (renderDialog === undefined) throw new Error("PC workflow did not request its dialog")
    const pcDialog = renderDialog
    const rendered = await renderTui(
      () => (
        <box flexDirection="column" gap={1}>
          <SidebarTitle color={base} title="PokéCode" />
          <StarterButtons
            regionId={() => "kanto"}
            resolveSprite={async () => ({ kind: "placeholder" })}
            imageProtocol={() => "auto"}
            hovered={() => "bulbasaur"}
            hoverBackground={muted}
            onChoose={async () => {}}
            onHover={() => {}}
          />
          {pcDialog()}
        </box>
      ),
      { width: 100, height: 64 },
    )

    // WHEN
    await rendered.flush()
    const before = {
      sidebarTitle: spanColor(rendered, "PokéCode", "fg"),
      starterHover: spanColor(rendered, "?", "bg"),
      pcTitle: spanColor(rendered, "Pokemon PC", "fg"),
      pcFooter: spanColor(rendered, "Up/Down", "fg"),
    }
    setBase("#00ffff")
    setMuted("#123456")
    await rendered.flush()

    // THEN
    expect(spanColor(rendered, "PokéCode", "fg")).not.toEqual(before.sidebarTitle)
    expect(before.starterHover).toBeDefined()
    expect(spanColor(rendered, "?", "bg")).not.toEqual(before.starterHover)
    expect(spanColor(rendered, "Pokemon PC", "fg")).not.toEqual(before.pcTitle)
    expect(spanColor(rendered, "Up/Down", "fg")).not.toEqual(before.pcFooter)
  })
})
