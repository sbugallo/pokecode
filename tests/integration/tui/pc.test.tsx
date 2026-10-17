import { describe, expect } from "bun:test"
import { RGBA } from "@opentui/core"
import { stringWidth } from "bun"
import { createSignal } from "solid-js"
import { PcDetails } from "../../../src/adapters/opencode/tui/pc/details.js"
import { PokemonPcDialog } from "../../../src/adapters/opencode/tui/pc/dialog.js"
import { pcCopy } from "../../../src/adapters/presentation/pc-copy.js"
import type { PokemonManagementResult } from "../../../src/application/contracts/game.js"
import { pokemonInstanceSchema } from "../../../src/domain/pokemon/model.js"
import { renderTui, testTui, testTuiEach } from "../../support/tui.js"

const collection = Array.from({ length: 8 }, (_, index) =>
  pokemonInstanceSchema.parse({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    speciesId: index === 0 ? "bulbasaur" : "charmander",
    name: index === 0 ? "Bulbasaur" : `Charmander ${index}`,
    gender: index === 0 ? "female" : "male",
    level: index === 0 ? 5 : 10,
    experience: 0,
    ability: index === 0 ? "Overgrow" : "Blaze",
    nature: "Hardy",
    shiny: false,
    ivs: { hp: 31, attack: 30, defense: 29, specialAttack: 28, specialDefense: 27, speed: 26 },
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: [{ id: "tackle", name: "Tackle" }],
  }),
)

async function renderPc(
  options: {
    readonly partyIds?: readonly string[]
    readonly width?: number
    readonly height?: number
    readonly pokemon?: () => typeof collection
    readonly onClose?: () => void
    readonly onConfirm?: (ids: readonly string[]) => Promise<boolean>
    readonly onRename?: (id: string, name: string) => Promise<PokemonManagementResult["kind"]>
    readonly onRelease?: (id: string) => Promise<PokemonManagementResult["kind"]>
  } = {},
) {
  return renderTui(
    () => (
      <box width={90} maxWidth={(options.width ?? 100) - 2} id="pokecode-pc-host">
        <PokemonPcDialog
          pokemon={options.pokemon?.() ?? collection}
          partyIds={options.partyIds ?? collection.slice(0, 1).map((pokemon) => pokemon.id)}
          language="en"
          textColor="#ffffff"
          mutedColor="#808080"
          onClose={options.onClose ?? (() => {})}
          onConfirm={options.onConfirm ?? (async () => true)}
          onRename={options.onRename ?? (async () => "renamed")}
          onRelease={options.onRelease ?? (async () => "released")}
          resolveSprite={async () => ({ kind: "placeholder" })}
        />
      </box>
    ),
    { width: options.width ?? 100, height: options.height ?? 40, kittyKeyboard: true },
  )
}

describe("Pokémon PC dialog", () => {
  testTui("refreshes renamed rows and removes freed Pokemon from the party draft", async () => {
    const [pokemon, setPokemon] = createSignal([...collection])
    const rendered = await renderPc({
      pokemon,
      onRename: async (id) => {
        setPokemon((current) =>
          current.map((entry) => (entry.id === id ? { ...entry, name: "Leaf" } : entry)),
        )
        return "renamed"
      },
      onRelease: async (id) => {
        setPokemon((current) => current.filter((entry) => entry.id !== id))
        return "released"
      },
    })
    await rendered.flush()
    rendered.mockInput.pressKey("r")
    await rendered.flush()
    rendered.mockInput.pressEnter()
    await rendered.flush()
    expect(rendered.captureCharFrame()).toContain("Leaf ♀ Lv.5")
    expect(rendered.captureCharFrame()).not.toContain("Bulbasaur")
    rendered.mockInput.pressKey("f")
    await rendered.flush()
    rendered.mockInput.pressEnter()
    await rendered.flush()
    expect(rendered.captureCharFrame()).not.toContain("Leaf")
    expect(rendered.captureCharFrame()).toContain("Charmander 1 ♂ Lv.10")
    expect(rendered.captureCharFrame()).toContain("(0/6)")
  })

  testTui("renames the inspected Pokemon without saving or changing the party draft", async () => {
    const names: string[] = []
    let saves = 0
    const rendered = await renderPc({
      onRename: async (id, name) => {
        expect(id).toBe(String(collection[1]?.id))
        names.push(name)
        return "renamed"
      },
      onConfirm: async () => {
        saves += 1
        return true
      },
    })
    await rendered.flush()
    rendered.mockInput.pressArrow("down")
    rendered.mockInput.pressKey(" ")
    rendered.mockInput.pressKey("r")
    await rendered.flush()
    expect(rendered.captureCharFrame()).toContain("New name")
    rendered.mockInput.pressKey(" ")
    rendered.mockInput.pressKey("r")
    await rendered.flush()
    rendered.mockInput.pressEnter()
    await rendered.flush()
    expect(names).toHaveLength(1)
    expect(names[0]).toContain(" r")
    expect(saves).toBe(0)
    expect(rendered.captureCharFrame()).toContain("(2/6)")
    expect(rendered.captureCharFrame()).toContain("Pokemon renamed")
  })

  testTui(
    "requires confirmation to free a Pokemon and Escape cancels only the action",
    async () => {
      const released: string[] = []
      let closed = 0
      const rendered = await renderPc({
        onRelease: async (id) => {
          released.push(id)
          return "released"
        },
        onClose: () => {
          closed += 1
        },
      })
      await rendered.flush()
      rendered.mockInput.pressKey("f")
      await rendered.flush()
      expect(rendered.captureCharFrame()).toContain("cannot be undone")
      expect(released).toEqual([])
      rendered.mockInput.pressEscape()
      await rendered.flush()
      expect(closed).toBe(0)
      rendered.mockInput.pressArrow("down")
      rendered.mockInput.pressKey("f")
      await rendered.flush()
      rendered.mockInput.pressArrow("up")
      rendered.mockInput.pressEnter()
      await rendered.flush()
      expect(released).toEqual([collection[1]?.id ?? ""])
      expect(rendered.captureCharFrame()).toContain("Pokemon freed")
      expect(closed).toBe(0)
    },
  )

  testTui("shows release rejections without losing party edits", async () => {
    const rendered = await renderPc({ onRelease: async () => "last-party-pokemon" })
    await rendered.flush()
    rendered.mockInput.pressKey("f")
    await rendered.flush()
    rendered.mockInput.pressEnter()
    await rendered.flush()
    expect(rendered.captureCharFrame()).toContain("last party Pokemon")
    expect(rendered.captureCharFrame()).toContain("(1/6)")
  })

  testTui("uses more vertical space in tall terminals without exceeding the viewport", async () => {
    const rendered = await renderPc({ height: 60 })
    await rendered.flush()
    const host = rendered.renderer.root.getChildren()[0]
    const modal = host?.getChildren()[0]
    expect(modal?.height).toBe(44)
    expect((modal?.y ?? 0) + (modal?.height ?? 0)).toBeLessThanOrEqual(60)
  })

  testTui(
    "shows stats before move metadata and inspects attacks without changing the team",
    async () => {
      let saves = 0
      const rendered = await renderPc({
        onConfirm: async () => {
          saves += 1
          return true
        },
      })
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      expect(frame.indexOf("Value EV IV")).toBeLessThan(frame.indexOf("Moves"))
      expect(frame).toContain("Normal · Physical")
      expect(frame).toContain("Pow 40 · Acc 100% · PP 35")
      const rows = frame.split("\n")
      const row = rows.findIndex((line) => line.includes("Tackle"))
      const column = rows[row]?.indexOf("Tackle") ?? -1
      await rendered.mockMouse.moveTo(column, row)
      await rendered.flush()
      expect(rendered.captureCharFrame()).toContain("A physical attack")
      await rendered.mockMouse.click(column, row)
      await rendered.flush()
      expect(saves).toBe(0)
      expect(rendered.captureCharFrame()).toContain("(1/6)")
    },
  )

  testTuiEach(
    ["en", "es"] as const,
    (language) =>
      `updates nature stat colors and arrows without changing column alignment in ${language}`,
    async (language) => {
      // GIVEN
      const [nature, setNature] = createSignal("Hardy")
      const rendered = await renderTui(
        () => (
          <PcDetails
            pokemon={pokemonInstanceSchema.parse({ ...collection[0], nature: nature() })}
            language={language}
            textColor="#d1d5db"
            resolveSprite={async () => ({ kind: "placeholder" })}
          />
        ),
        { width: 40, height: 30 },
      )
      const labels = pcCopy(language).statNames

      for (const [name, increased, decreased] of [
        ["Lonely", 1, 2],
        ["Modest", 3, 1],
        ["Careful", 4, 3],
        ["Timid", 5, 1],
        ["Hardy", -1, -1],
        ["Docile", -1, -1],
        ["Serious", -1, -1],
        ["Bashful", -1, -1],
        ["Quirky", -1, -1],
      ] as const) {
        // WHEN
        setNature(name)
        await rendered.flush()
        const spans = rendered.captureSpans().lines.flatMap((line) => line.spans)
        const statRows = labels.map((label) =>
          spans.find((span) =>
            span.text
              .trimStart()
              .replace(/^[↑↓] /, "")
              .startsWith(`${label} `),
          ),
        )

        // THEN
        for (const [index, row] of statRows.entries()) {
          expect(row).toBeDefined()
          expect(row?.fg).toEqual(
            index === increased
              ? RGBA.fromHex("#ef4444")
              : index === decreased
                ? RGBA.fromHex("#3b82f6")
                : RGBA.fromHex("#d1d5db"),
          )
          expect(row?.text.trim()).toMatch(/\s+\d+\s+0\s+\d+$/)
          const indicator = index === increased ? "↑" : index === decreased ? "↓" : " "
          expect(row?.text).toContain(`${indicator} ${labels[index]}`)
          expect(row?.text.indexOf(labels[index] ?? "")).toBe(
            statRows[0]?.text.indexOf(labels[0] ?? ""),
          )
        }
      }
    },
  )

  testTui(
    "keeps the member list and centered details together inside the host layout",
    async () => {
      // GIVEN
      const rendered = await renderPc()

      // WHEN
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      const rows = frame.split("\n")
      const center = (label: string) => {
        const row = rows.find((line) => line.includes(label))
        if (row === undefined) throw new Error(`Missing rendered detail: ${label}`)
        return row.indexOf(label) + label.length / 2
      }

      // THEN
      expect(frame).toContain("Bulbasaur ♀ Lv.5")
      expect(frame).toContain("Space: Toggle")
      expect(frame).toContain("Esc: Cancel")
      const host = rendered.renderer.root.getChildren()[0]
      const modal = host?.getChildren()[0]
      const panes = modal?.getChildren()[1]?.getChildren() ?? []
      const [list, details] = panes
      expect(host?.width).toBe(90)
      expect(panes).toHaveLength(2)
      expect(list?.y).toBe(details?.y)
      expect((list?.x ?? 0) + (list?.width ?? 0)).toBeLessThanOrEqual(details?.x ?? 0)
      expect(Math.abs(center("Nature: Hardy") - center("Bulbasaur ♀ Lv.5"))).toBeLessThanOrEqual(1)
      expect(
        Math.abs(center("  Stat        Value EV IV") - center("Bulbasaur ♀ Lv.5")),
      ).toBeLessThanOrEqual(1)
    },
  )

  testTui("supports keyboard navigation and commits a membership draft once", async () => {
    // GIVEN
    const saved: (readonly string[])[] = []
    let closed = 0
    const rendered = await renderPc({
      onConfirm: async (ids) => {
        saved.push(ids)
        return true
      },
      onClose: () => {
        closed += 1
      },
    })
    await rendered.flush()

    // WHEN
    rendered.mockInput.pressArrow("down")
    rendered.mockInput.pressKey(" ")
    await rendered.flush()
    const draft = rendered.captureCharFrame()
    rendered.mockInput.pressEnter()
    await rendered.flush()

    // THEN
    expect(draft).toContain("(2/6)")
    expect(saved).toEqual([collection.slice(0, 2).map((pokemon) => pokemon.id)])
    expect(closed).toBe(1)
  })

  testTui("scrolling keeps the selected member aligned with its inspected details", async () => {
    // GIVEN
    const rendered = await renderPc({ height: 16 })
    await rendered.flush()

    // WHEN
    rendered.mockInput.pressArrow("down")
    await rendered.flush()
    const inspectedFirst = rendered.captureCharFrame()
    for (let index = 1; index < collection.length; index += 1) rendered.mockInput.pressArrow("down")
    await rendered.flush()

    // THEN
    expect(inspectedFirst).toContain("Charmander 1 ♂ Lv.10")
    expect(inspectedFirst).toContain("(1/6)")
    const rows = rendered.captureCharFrame().split("\n")
    const member = rows.find((row) => row.includes("Charmander 7 Lv.10"))
    const details = rows.find((row) => row.includes("Charmander 7 ♂ Lv.10"))
    expect(member).toBeDefined()
    expect(details).toBeDefined()
    expect(member?.indexOf("Charmander 7")).toBeLessThan(details?.indexOf("Charmander 7") ?? -1)
  })

  testTuiEach(
    [
      {
        name: "a seventh member is rejected",
        partyIds: collection.slice(0, 6).map((pokemon) => pokemon.id),
        action: (rendered: Awaited<ReturnType<typeof renderPc>>) => {
          for (let index = 0; index < 6; index += 1) rendered.mockInput.pressArrow("down")
          rendered.mockInput.pressKey(" ")
        },
        message: "at most six",
      },
      {
        name: "an empty team cannot be confirmed",
        partyIds: [],
        action: (rendered: Awaited<ReturnType<typeof renderPc>>) => rendered.mockInput.pressEnter(),
        message: "at least one",
      },
    ],
    ({ name }) => name,
    async ({ partyIds, action, message }) => {
      // GIVEN
      const saved: (readonly string[])[] = []
      const rendered = await renderPc({
        partyIds,
        onConfirm: async (ids) => {
          saved.push(ids)
          return true
        },
      })
      await rendered.flush()

      // WHEN
      action(rendered)
      await rendered.flush()

      // THEN
      expect(saved).toEqual([])
      expect(rendered.captureCharFrame()).toContain(message)
    },
  )

  testTui("Escape discards membership edits without submitting them", async () => {
    // GIVEN
    const saved: (readonly string[])[] = []
    let closed = false
    const rendered = await renderPc({
      onConfirm: async (ids) => {
        saved.push(ids)
        return true
      },
      onClose: () => {
        closed = true
      },
    })
    await rendered.flush()

    // WHEN
    rendered.mockInput.pressKey(" ")
    rendered.mockInput.pressEscape()
    await rendered.flush()

    // THEN
    expect(closed).toBe(true)
    expect(saved).toEqual([])
  })

  testTui("keeps keyboard controls visible in a narrow and short terminal", async () => {
    // GIVEN
    const rendered = await renderPc({ width: 50, height: 24 })

    // WHEN
    await rendered.flush()

    // THEN
    const frame = rendered.captureCharFrame()
    expect(frame).toContain("Bulbasaur")
    expect(frame).toContain("Space: Toggle")
    expect(frame).toContain("Esc: Cancel")
    expect(frame.split("\n").every((line) => line.length <= 50)).toBe(true)
  })

  testTui(
    "keeps the stat table reachable with horizontal navigation in a short terminal",
    async () => {
      // GIVEN
      const rendered = await renderPc({ width: 50, height: 24 })
      await rendered.flush()

      // WHEN
      rendered.mockInput.pressArrow("right")
      await rendered.flush()

      // THEN
      expect(rendered.captureCharFrame()).toContain("Value EV IV")
      expect(rendered.captureCharFrame()).toContain("(1/6)")
      expect(rendered.captureCharFrame()).toContain("Esc: Cancel")
    },
  )

  testTui("prevents duplicate confirmation while a save is pending", async () => {
    // GIVEN
    const pending = Promise.withResolvers<boolean>()
    let submissions = 0
    const rendered = await renderPc({
      onConfirm: () => {
        submissions += 1
        return pending.promise
      },
    })
    await rendered.flush()

    // WHEN
    try {
      rendered.mockInput.pressEnter()
      rendered.mockInput.pressEnter()
      pending.resolve(true)
      await rendered.flush()

      // THEN
      expect(submissions).toBe(1)
    } finally {
      pending.resolve(true)
      await pending.promise
      await rendered.flush()
    }
  })

  testTui("keeps the edited dialog open when the server rejects confirmation", async () => {
    // GIVEN
    let closed = false
    const rendered = await renderPc({
      onConfirm: async () => false,
      onClose: () => {
        closed = true
      },
    })
    await rendered.flush()

    // WHEN
    rendered.mockInput.pressEnter()
    await rendered.flush()

    // THEN
    expect(closed).toBe(false)
    expect(rendered.captureCharFrame()).toContain("could not be saved")
  })

  testTuiEach(
    ["en", "es"] as const,
    (language) => `aligns localized stat columns in ${language}`,
    async (language) => {
      // GIVEN
      const pokemon = pokemonInstanceSchema.parse({
        id: "00000000-0000-4000-8000-000000000099",
        speciesId: "pyroar",
        name: "Pyroar",
        gender: "female",
        level: 5,
        experience: 0,
        ability: "Overgrow",
        nature: "Hardy",
        shiny: true,
        ivs: { hp: 31, attack: 31, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 },
        evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
        moves: [],
      })
      const rendered = await renderTui(
        () => (
          <PcDetails
            pokemon={pokemon}
            language={language}
            textColor="#d1d5db"
            resolveSprite={async () => ({ kind: "placeholder" })}
          />
        ),
        { width: 40, height: 30 },
      )

      // WHEN
      await rendered.flush()
      const rows = rendered.captureCharFrame().split("\n")
      const header = rows.find((row) => row.includes("EV") && row.includes("IV"))
      const hp = rows.find((row) => /25\s+0\s+31/.test(row))

      // THEN
      expect(header).toBeDefined()
      expect(hp).toBeDefined()
      if (header !== undefined && hp !== undefined) {
        const evEnd = stringWidth(hp.slice(0, hp.lastIndexOf("0") + 1))
        const ivEnd = stringWidth(hp.slice(0, hp.lastIndexOf("31") + 2))
        expect(stringWidth(header.slice(0, header.indexOf("EV") + 2))).toBe(evEnd)
        expect(stringWidth(header.slice(0, header.indexOf("IV") + 2))).toBe(ivEnd)
      }
    },
  )
})
