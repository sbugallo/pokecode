import type { ImageRenderProtocol, TerminalCapabilities } from "@opentui/core"
import { type Accessor, createSignal } from "solid-js"

export type ImageProtocolCapabilities = Pick<
  TerminalCapabilities,
  "terminal" | "image_protocol" | "sixel" | "kitty_graphics"
>

export type ImageProtocolAccessor = Accessor<ImageRenderProtocol>

/** Minimal structural view of the renderer's capability events. */
export type CapabilitiesEventSource = Readonly<{
  readonly capabilities: ImageProtocolCapabilities | null
  on(event: "capabilities", listener: (capabilities: ImageProtocolCapabilities) => void): unknown
  off(event: "capabilities", listener: (capabilities: ImageProtocolCapabilities) => void): unknown
}>

/**
 * Terminals that advertise image capabilities they cannot honor. Capability
 * detection is only as honest as the answering terminal, so the rare terminal
 * that lies needs a correction keyed by its identity — the same technique
 * OpenTUI's own native detection uses (applyKnownGraphicsIdentity, and the
 * TERM_PROGRAM=vscode kitty_graphics correction). Entries are data: add one
 * here, never a new branch in the resolver.
 */
const graphicsCorrections: readonly {
  readonly terminalName: RegExp
  readonly requires?: { readonly sixel?: boolean; readonly kitty_graphics?: boolean }
  readonly protocol: ImageRenderProtocol
  readonly reason: string
}[] = [
  {
    // VS Code and Orca both present as "xterm.js": XTVERSION answers with the
    // library name, which outranks the TERM_PROGRAM identity fallback, so no
    // per-product name ever surfaces here. The xterm.js image addon behind
    // terminal.integrated.enableImages advertises BOTH Kitty graphics and
    // Sixel — but its Kitty path drops OpenTUI's placements while Sixel
    // renders reliably. Prefer Sixel whenever this identity advertises it;
    // addon disabled → no Sixel advertised → the entry does not match and
    // auto falls through to half-blocks.
    terminalName: /^xterm\.js$/i,
    requires: { sixel: true },
    protocol: "sixel",
    reason: "xterm.js image addon Kitty path drops OpenTUI placements",
  },
  {
    // Orca answers the Kitty graphics probe with OK, so no capability query
    // distinguishes it from Kitty; placements blank once its per-pane image
    // budget evicts them (stablyai/orca#23547, open as of October 2026).
    // Keyed on the TERM_PROGRAM identity for the case where Orca stops
    // answering XTVERSION.
    terminalName: /orca/i,
    protocol: "blocks",
    reason: "stablyai/orca#23547",
  },
]

const requirementsMet = (
  requires: { readonly sixel?: boolean; readonly kitty_graphics?: boolean } | undefined,
  capabilities: ImageProtocolCapabilities | null,
): boolean => {
  if (requires === undefined) return true
  if (requires.sixel !== undefined && capabilities?.sixel !== requires.sixel) return false
  if (
    requires.kitty_graphics !== undefined &&
    capabilities?.kitty_graphics !== requires.kitty_graphics
  ) {
    return false
  }
  return true
}

/**
 * Picks the sprite image protocol for the detected terminal.
 *
 * Capability-first: an explicit OPENTUI_IMAGE_PROTOCOL override (surfaced by
 * OpenTUI as the image_protocol capability) always wins, and everything else
 * stays "auto" so OpenTUI resolves from real capability queries — Kitty
 * graphics first, then Sixel (which the xterm.js image addon behind VS Code's
 * terminal.integrated.enableImages advertises through DA1), then half-blocks.
 * Only terminals known to misreport their capabilities need a correction
 * from the table above.
 */
export function spriteImageProtocol(
  capabilities: ImageProtocolCapabilities | null,
): ImageRenderProtocol {
  const configured = capabilities?.image_protocol
  if (configured !== undefined && configured !== "auto") return configured
  const name = capabilities?.terminal.name ?? ""
  const correction = graphicsCorrections.find(
    (entry) => entry.terminalName.test(name) && requirementsMet(entry.requires, capabilities),
  )
  return correction?.protocol ?? "auto"
}

/**
 * Tracks the resolved protocol reactively: capability detection answers
 * after startup, so the accessor flips once the terminal identifies itself.
 */
export function createImageProtocolState(source: CapabilitiesEventSource): {
  readonly protocol: ImageProtocolAccessor
  readonly dispose: () => void
} {
  const [protocol, setProtocol] = createSignal(spriteImageProtocol(source.capabilities))
  const listener = (capabilities: ImageProtocolCapabilities): void => {
    setProtocol(spriteImageProtocol(capabilities))
  }
  source.on("capabilities", listener)
  return {
    protocol,
    dispose: () => {
      source.off("capabilities", listener)
    },
  }
}
