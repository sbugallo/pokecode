import { describe, expect } from "bun:test"
import type { Renderable } from "@opentui/core"
import { createSignal } from "solid-js"
import { MoveList } from "../../../src/adapters/opencode/tui/components/move-list.js"
import { presentMove } from "../../../src/adapters/presentation/move-details.js"
import { makePokecodeSurface, renderTui, testTui, testTuiEach } from "../../support/tui.js"

const moves = [
  { id: "tackle", name: "Tackle" },
  { id: "growl", name: "Growl" },
  { id: "vine-whip", name: "Vine Whip" },
  { id: "growth", name: "Growth" },
  { id: "razor-leaf", name: "Razor Leaf" },
] as const

function find(root: Renderable, id: string): Renderable {
  const descendants = (node: Renderable): Renderable[] =>
    node.getChildren().flatMap((child) => [child, ...descendants(child)])
  const match = descendants(root).find((child) => child.id === id)
  if (match === undefined) throw new Error(`Missing renderable: ${id}`)
  return match
}

describe("shared move list", () => {
  testTuiEach(
    ["en", "es"] as const,
    (language) => `shows localized metadata and hover descriptions in ${language}`,
    async (language) => {
      const resolved: string[] = []
      const surface = makePokecodeSurface()
      const rendered = await renderTui(
        () => (
          <MoveList
            moves={moves}
            language={language}
            offeredMoveId="razor-leaf"
            theme={() => surface}
            height={28}
            onActivate={async (id) => {
              resolved.push(id)
            }}
          />
        ),
        { width: 32, height: 30 },
      )
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      const first = presentMove(moves[0], language)
      expect(frame).toContain(first.name)
      expect(frame).toContain(first.classification)
      expect(frame).toContain(first.stats)
      const button = find(rendered.renderer.root, "move-tackle")
      const offered = find(rendered.renderer.root, "move-razor-leaf")
      expect(button.width).toBeLessThan(32)
      expect(offered.width).toBeLessThan(32)
      expect(Math.abs(button.x + button.width / 2 - 16)).toBeLessThanOrEqual(1)
      const background = (name: string) =>
        rendered
          .captureSpans()
          .lines.flatMap((line) => line.spans)
          .find((span) => span.text.includes(name))?.bg
      expect(background(first.name)).toEqual(surface.primary.background)
      const offeredName = presentMove(moves[4], language).name
      expect(background(offeredName)).toEqual(surface.secondary.background)

      await rendered.mockMouse.moveTo(button.x + 1, button.y)
      await rendered.flush()
      expect(background(first.name)).toEqual(surface.primary.backgroundHovered)
      expect(rendered.captureCharFrame().replace(/\s+/g, " ")).toContain(first.description)
      expect(resolved).toEqual([])
      await rendered.mockMouse.click(button.x + 1, button.y)
      await rendered.flush()
      expect(resolved).toEqual(["tackle"])

      await rendered.mockMouse.moveTo(offered.x + 1, offered.y)
      await rendered.flush()
      expect(background(offeredName)).toEqual(surface.secondary.backgroundHovered)
      await rendered.mockMouse.click(offered.x + 1, offered.y)
      await rendered.flush()
      expect(resolved).toEqual(["tackle", "razor-leaf"])
    },
  )

  testTui("wraps Spanish stats and descriptions inside a narrow sidebar", async () => {
    const rendered = await renderTui(
      () => <MoveList centered moves={moves.slice(0, 1)} language="es" height={12} />,
      { width: 24, height: 14 },
    )
    await rendered.flush()
    find(rendered.renderer.root, "move-tackle").focus()
    await rendered.flush()
    const frame = rendered.captureCharFrame()
    const text = frame.replace(/\s+/g, " ")
    expect(text).toContain("Pot 40 · Prec 100% · PP 35")
    expect(text).toContain("Embestida con todo el cuerpo.")
    expect(frame.split("\n").every((line) => line.length <= 24)).toBe(true)
    expect(rendered.renderer.root.getChildren()[0]?.height).toBe(12)
    const lastLine = frame.split("\n").find((line) => line.includes("cuerpo."))
    if (lastLine === undefined) throw new Error("Missing wrapped description")
    expect(Math.abs(lastLine.indexOf("cuerpo.") + "cuerpo.".length / 2 - 12)).toBeLessThanOrEqual(1)
  })

  testTui(
    "keyboard focus scrolls to hidden moves and inspecting never activates them",
    async () => {
      const resolved: string[] = []
      const rendered = await renderTui(
        () => (
          <MoveList
            moves={moves}
            language="en"
            offeredMoveId="razor-leaf"
            height={9}
            onActivate={async (id) => {
              resolved.push(id)
            }}
          />
        ),
        { width: 30, height: 12, kittyKeyboard: true },
      )
      await rendered.flush()
      const offered = find(rendered.renderer.root, "move-razor-leaf")
      expect(rendered.captureCharFrame()).not.toContain("Razor Leaf")
      offered.focus()
      await rendered.flush()
      expect(rendered.captureCharFrame()).toContain("Razor Leaf")
      expect(resolved).toEqual([])
      rendered.mockInput.pressEnter()
      await rendered.flush()
      expect(resolved).toEqual(["razor-leaf"])
    },
  )

  testTui(
    "updates a focused move's metadata and description when the language changes",
    async () => {
      const [language, setLanguage] = createSignal<"en" | "es">("en")
      const rendered = await renderTui(
        () => <MoveList moves={moves.slice(0, 1)} language={language()} />,
        { width: 40, height: 12 },
      )
      await rendered.flush()
      find(rendered.renderer.root, "move-tackle").focus()
      await rendered.flush()
      setLanguage("es")
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      expect(frame).toContain("Placaje")
      expect(frame).toContain("Normal · Físico")
      expect(frame).toContain("Embestida con todo el cuerpo.")
    },
  )
})
