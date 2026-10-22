import { describe, expect, test } from "bun:test"
import type { ImageRenderProtocol } from "@opentui/core"
import {
  createImageProtocolState,
  type ImageProtocolCapabilities,
  spriteImageProtocol,
} from "../../../../../../../src/adapters/opencode/tui/components/image-protocol.js"

function capabilitiesFor(
  name: string,
  imageProtocol?: ImageRenderProtocol,
  flags: { readonly sixel?: boolean; readonly kitty_graphics?: boolean } = {},
): ImageProtocolCapabilities {
  return {
    terminal: { name, version: "", from_xtversion: false },
    sixel: flags.sixel ?? false,
    kitty_graphics: flags.kitty_graphics ?? false,
    ...(imageProtocol === undefined ? {} : { image_protocol: imageProtocol }),
  }
}

function createFakeSource(initial: ImageProtocolCapabilities | null) {
  const listeners = new Set<(capabilities: ImageProtocolCapabilities) => void>()
  const source = {
    capabilities: initial,
    on: (_event: "capabilities", listener: (capabilities: ImageProtocolCapabilities) => void) => {
      listeners.add(listener)
    },
    off: (_event: "capabilities", listener: (capabilities: ImageProtocolCapabilities) => void) => {
      listeners.delete(listener)
    },
    emit(capabilities: ImageProtocolCapabilities) {
      for (const listener of listeners) listener(capabilities)
    },
  }
  return source
}

describe("spriteImageProtocol", () => {
  test("falls back to auto when capabilities are not available yet", () => {
    // GIVEN no detected capabilities
    const capabilities = null

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN OpenTUI keeps its own auto resolution
    expect(protocol).toBe("auto")
  })

  test("keeps an explicit OPENTUI_IMAGE_PROTOCOL override", () => {
    // GIVEN a terminal that reports a user-configured protocol
    const capabilities = capabilitiesFor("ghostty", "kitty")

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN the override wins over every heuristic
    expect(protocol).toBe("kitty")
  })

  test("lets the override win even inside Orca", () => {
    // GIVEN Orca with an explicit protocol override
    const capabilities = capabilitiesFor("Orca", "kitty")

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN the escape hatch still beats the Orca fallback
    expect(protocol).toBe("kitty")
  })

  test("forces blocks for Orca when no override is configured", () => {
    // GIVEN a terminal identifying itself as Orca
    const capabilities = capabilitiesFor("Orca", "auto")

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN half-block rendering avoids the Kitty image eviction bug
    expect(protocol).toBe("blocks")
  })

  test("detects Orca regardless of casing or version suffix", () => {
    // GIVEN Orca reporting its version through the terminal name
    const capabilities = capabilitiesFor("orca 1.4.0", undefined)

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN the name match stays case-insensitive and substring-based
    expect(protocol).toBe("blocks")
  })

  test("leaves a literal vscode identity on auto resolution", () => {
    // GIVEN the synthetic product name (real VS Code answers XTVERSION as
    // "xterm.js", so the product name never actually surfaces)
    const capabilities = capabilitiesFor("vscode", "auto")

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN no product-name rule exists: corrections key on the generic
    // xterm.js addon identity plus its advertised capabilities
    expect(protocol).toBe("auto")
  })

  test("prefers sixel for xterm.js terminals that advertise it", () => {
    // GIVEN a terminal presenting as xterm.js with the image addon enabled
    // (both Kitty graphics and Sixel advertised, like VS Code's terminal and
    // Orca, which are indistinguishable through XTVERSION)
    const capabilities = capabilitiesFor("xterm.js", "auto", {
      sixel: true,
      kitty_graphics: true,
    })

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN the working Sixel path beats the broken Kitty path
    expect(protocol).toBe("sixel")
  })

  test("leaves xterm.js without advertised sixel on auto resolution", () => {
    // GIVEN xterm.js with the image addon disabled (no Sixel advertised)
    const capabilities = capabilitiesFor("xterm.js", "auto", {
      sixel: false,
      kitty_graphics: false,
    })

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN nothing is broken here: auto falls through to half-blocks
    expect(protocol).toBe("auto")
  })

  test("lets the override win inside xterm.js terminals", () => {
    // GIVEN xterm.js with the image addon enabled and an explicit override
    const capabilities = capabilitiesFor("xterm.js", "blocks", { sixel: true })

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN the configured escape hatch still beats the correction
    expect(protocol).toBe("blocks")
  })

  test("leaves healthy terminals on auto resolution", () => {
    // GIVEN a terminal without a known-broken graphics path
    const capabilities = capabilitiesFor("ghostty", "auto")

    // WHEN resolving the protocol
    const protocol = spriteImageProtocol(capabilities)

    // THEN OpenTUI resolves per draw, keeping Kitty and Sixel intact
    expect(protocol).toBe("auto")
  })
})

describe("createImageProtocolState", () => {
  test("resolves the initial protocol from the current capabilities", () => {
    // GIVEN a renderer that already identified Orca
    const source = createFakeSource(capabilitiesFor("Orca", "auto"))

    // WHEN creating the state
    const state = createImageProtocolState(source)

    // THEN the protocol starts at the detected fallback
    expect(state.protocol()).toBe("blocks")
    state.dispose()
  })

  test("updates the protocol once the capabilities event answers", () => {
    // GIVEN a renderer whose capabilities have not arrived yet
    const source = createFakeSource(null)
    const state = createImageProtocolState(source)

    // WHEN the terminal identifies itself as Orca
    source.emit(capabilitiesFor("Orca", "auto"))

    // THEN the accessor flips to half-block rendering
    expect(state.protocol()).toBe("blocks")
    state.dispose()
  })

  test("stops listening to capabilities events after disposal", () => {
    // GIVEN a state that subscribed to a renderer
    const source = createFakeSource(null)
    const state = createImageProtocolState(source)

    // WHEN the state is disposed
    state.dispose()
    source.emit(capabilitiesFor("Orca", "auto"))

    // THEN late capability responses no longer change the protocol
    expect(state.protocol()).toBe("auto")
  })
})
