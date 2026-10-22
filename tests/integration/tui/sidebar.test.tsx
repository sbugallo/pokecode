import { describe, expect } from "bun:test"
import { RGBA } from "@opentui/core"
import { stringWidth } from "bun"
import { createSignal } from "solid-js"
import {
  MoveChoiceCard,
  PendingChoiceCard,
  RegionChoiceCard,
} from "../../../src/adapters/opencode/tui/choices/cards.js"
import { EncounterCard } from "../../../src/adapters/opencode/tui/choices/encounter.js"
import "../../../src/adapters/opencode/tui/controls/native.js"
import {
  LocationProgress,
  PartyGrid,
  SidebarView,
  StarterButtons,
} from "../../../src/adapters/opencode/tui/sidebar/view.js"
import { pokemonInstanceSchema } from "../../../src/domain/pokemon/model.js"
import { evolutionAtLevel } from "../../../src/domain/progression/catalog.js"
import { speciesIdSchema } from "../../../src/domain/shared/identifiers.js"
import { makeTuiState, renderTui, testTui, testTuiEach } from "../../support/tui.js"

const placeholder = async () => ({ kind: "placeholder" as const })

describe("sidebar components", () => {
  async function testStarterGrid(width: number) {
    const selected: string[][] = []
    const spriteRequests: unknown[][] = []
    const [hoveredStarter, setHoveredStarter] = createSignal<string | null>(null)
    const [state, setState] = createSignal(
      makeTuiState({
        region: "galar",
        pendingChoices: [
          {
            id: "00000000-0000-4000-8000-000000000091",
            kind: "starter",
            payload: JSON.stringify({ region: "galar" }),
          },
        ],
      }),
    )
    const rendered = await renderTui(
      () => (
        <SidebarView
          hoveredEncounterAction={() => null}
          hoveredStarter={hoveredStarter}
          hoverStarter={setHoveredStarter}
          mutedColor={() => "#808080"}
          onChooseStarter={async (region, species) => {
            selected.push([region, species])
          }}
          onTravelRegion={async () => {}}
          onTravelLocation={async () => {}}
          onResolveEncounter={async () => {}}
          onResolveEvolution={async () => {}}
          onResolveMove={async () => {}}
          resolveSprite={async (...args) => {
            spriteRequests.push(args)
            return { kind: "placeholder" }
          }}
          imageProtocol={() => "auto"}
          setHoveredEncounterAction={() => {}}
          starterHoverBackground="#808080"
          state={state}
        />
      ),
      { width, height: 30 },
    )
    await rendered.flush()
    const frame = rendered.captureCharFrame()
    for (const name of ["Grookey", "Scorbunny", "Sobble"]) expect(frame).not.toContain(name)
    expect(frame).not.toContain("Bulbasaur")
    expect(frame).not.toContain("Chikorita")
    const lines = frame.split("\n")
    const row = lines.findIndex((line) => (line.match(/\?/g) ?? []).length === 3)
    const spriteColumns = [...(lines[row] ?? "").matchAll(/\?/g)].map((match) => match.index)
    type GridNode = {
      x: number
      width: number
      focusable?: boolean
      getChildren(): GridNode[]
    }
    const descendants = (node: GridNode): GridNode[] =>
      node.getChildren().flatMap((child) => [child, ...descendants(child)])
    const expectCenteredGrid = (expectedWidth: number) => {
      const cells = descendants(rendered.renderer.root).filter((node) => node.focusable)
      expect(cells).toHaveLength(3)
      const middle = cells[1]
      if (middle === undefined) throw new Error("Expected a middle starter cell")
      const currentFrame = rendered.captureCharFrame()
      const heading = currentFrame.split("\n").find((line) => line.includes("Galar"))
      if (heading === undefined) throw new Error("Expected the Galar heading")
      const headingCenter = heading.indexOf("Galar") + "Galar".length / 2
      expect(middle.x + middle.width / 2).toBe(headingCenter)
      expect(Math.abs(headingCenter - expectedWidth / 2)).toBeLessThanOrEqual(0.5)
      expect(cells[0]?.width).toBe(cells[2]?.width)
      expect(cells[0]?.width).toBe(middle.width)
      expect(middle.width % 2).toBe(1)
      const first = cells[0]
      const last = cells[2]
      if (first === undefined || last === undefined) throw new Error("Expected three starter cells")
      const gap = middle.x - (first.x + first.width)
      expect(last.x - (middle.x + middle.width)).toBe(gap)
      expect(gap).toBeGreaterThanOrEqual(1)
      expect(gap).toBeLessThanOrEqual(3)
      if (expectedWidth === 50) expect(gap).toBe(3)
      for (const child of middle.getChildren()) {
        // The sprite has an odd width, so no rounding allowance is needed.
        expect(child.x + child.width / 2).toBe(headingCenter)
      }
      for (const cell of cells) {
        // Check that the sprites and hover backdrops remain centered in their cells.
        for (const child of cell.getChildren()) {
          expect(
            Math.abs(child.x + child.width / 2 - (cell.x + cell.width / 2)),
          ).toBeLessThanOrEqual(0.5)
        }
      }
    }
    expectCenteredGrid(width)
    expect(spriteColumns).toHaveLength(3)
    expect(frame.match(/Galar/g)).toHaveLength(1)
    for (const species of ["grookey", "scorbunny", "sobble"]) {
      expect(spriteRequests).toContainEqual([species, false, "male"])
    }
    await rendered.mockMouse.moveTo(spriteColumns[1] ?? -1, row)
    await rendered.flush()
    expect(hoveredStarter()).toBe("scorbunny")
    const middle = descendants(rendered.renderer.root).filter((node) => node.focusable)[1]
    if (middle === undefined) throw new Error("Expected the middle starter")
    const backdrop = middle.getChildren().find((child) => child.width === middle.width + 2)
    expect(backdrop?.x).toBe(middle.x - 1)
    expectCenteredGrid(width)
    await rendered.mockMouse.click(spriteColumns[2] ?? -1, row)
    await rendered.flush()
    expect(selected).toEqual([["galar", "sobble"]])
    rendered.renderer.resize(width + 1, 30)
    await rendered.flush()
    expectCenteredGrid(width + 1)

    // A recovered choice stays scoped to its region even while visiting another.
    setState(
      makeTuiState({
        region: "kanto",
        pendingChoices: [
          {
            id: "00000000-0000-4000-8000-000000000092",
            kind: "starter",
            payload: JSON.stringify({ region: "johto" }),
          },
        ],
      }),
    )
    await rendered.flush()
    const nextFrame = rendered.captureCharFrame()
    expect(nextFrame).toContain("Johto")
    expect(nextFrame).not.toContain("Galar")
    for (const species of ["chikorita", "cyndaquil", "totodile"]) {
      expect(spriteRequests).toContainEqual([species, false, "male"])
    }
    for (const name of ["Chikorita", "Cyndaquil", "Totodile"]) expect(nextFrame).not.toContain(name)
    expect(nextFrame).not.toContain("Grookey")
    expect(nextFrame).not.toContain("Bulbasaur")
  }

  testTuiEach(
    [33, 34, 35, 36, 37, 38, 39, 40, 50],
    (width) => `shows a 1x3 starter sprite grid (${width} columns)`,
    testStarterGrid,
  )

  testTui("shows localized pending counts and excludes catch choices", async () => {
    const rendered = await renderTui(
      () => (
        <SidebarView
          hoveredEncounterAction={() => null}
          hoveredStarter={() => null}
          hoverStarter={() => {}}
          mutedColor={() => "#808080"}
          onChooseStarter={async () => {}}
          onTravelRegion={async () => {}}
          onTravelLocation={async () => {}}
          onResolveEncounter={async () => {}}
          onResolveEvolution={async () => {}}
          onResolveMove={async () => {}}
          resolveSprite={placeholder}
          imageProtocol={() => "auto"}
          setHoveredEncounterAction={() => {}}
          starterHoverBackground="#808080"
          state={() =>
            makeTuiState({
              locale: "es",
              pendingChoices: [
                { id: "00000000-0000-4000-8000-000000000081", kind: "move", payload: "{}" },
                { id: "00000000-0000-4000-8000-000000000082", kind: "catch", payload: "{}" },
                { id: "00000000-0000-4000-8000-000000000083", kind: "region", payload: "{}" },
              ],
              pendingEncounterCount: 2,
            })
          }
        />
      ),
      { width: 60, height: 8 },
    )
    await rendered.flush()
    expect(rendered.captureCharFrame()).toContain("Pendientes: 2 decisiones · 2 encuentros")
  })

  testTuiEach(
    [
      { language: "en" as const, width: 34, source: "unova", completed: "Unova" },
      { language: "es" as const, width: 34, source: "unova", completed: "Teselia" },
      { language: "en" as const, width: 24, source: "kanto", completed: "Kanto" },
      { language: "es" as const, width: 24, source: "kanto", completed: "Kanto" },
    ],
    ({ language, width }) =>
      `renders readable region choices with hover and keyboard feedback (${language}, ${width} columns)`,
    async ({ language, width, source, completed }) => {
      const traveled: string[] = []
      const names = [
        "Kanto",
        "Johto",
        "Hoenn",
        "Sinnoh",
        language === "es" ? "Teselia" : "Unova",
        "Kalos",
        "Alola",
        "Galar",
        "Paldea",
      ].filter((name) => name !== completed && name !== "Galar")
      const rendered = await renderTui(
        () => (
          <RegionChoiceCard
            choice={() => ({
              id: "00000000-0000-4000-8000-000000000041",
              kind: "region",
              payload: JSON.stringify({ region: source }),
            })}
            language={() => language}
            visitedRegionIds={() => [source, "galar"]}
            onTravel={async (regionId) => {
              traveled.push(regionId)
            }}
          />
        ),
        { width, height: 48 },
      )
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      expect(frame).toContain(language === "es" ? "¡Has completado" : "You've completed")
      expect(frame).toContain(`${completed}!`)
      expect(frame).not.toContain(source)
      for (const name of names) expect(frame).toContain(name)
      const regionRows = frame
        .split("\n")
        .filter((line) => names.some((name) => line.includes(name)))
      expect(regionRows.length).toBeGreaterThan(1)
      for (const row of regionRows) {
        expect(names.filter((name) => row.includes(name)).length).toBeLessThanOrEqual(
          width === 24 ? 1 : 2,
        )
      }
      const lines = frame.split("\n")
      const row = lines.findIndex((line) => line.includes("Johto"))
      const column = lines[row]?.indexOf("Johto") ?? -1
      await rendered.mockMouse.moveTo(column, row)
      await rendered.flush()
      const johtoBackground = () =>
        rendered
          .captureSpans()
          .lines.flatMap((line) => line.spans)
          .find((span) => span.text.includes("Johto"))?.bg
      expect(johtoBackground()).toEqual(RGBA.fromHex("#404040"))
      await rendered.mockMouse.moveTo(0, 0)
      await rendered.flush()
      expect(johtoBackground()).not.toEqual(RGBA.fromHex("#404040"))
      await rendered.mockMouse.click(column, row)
      await rendered.flush()
      expect(traveled).toEqual(["johto"])

      type Node = {
        focusable?: boolean
        focus?: () => void
        border?: boolean
        getChildren?: () => Node[]
      }
      const descendants = (node: Node): Node[] =>
        (node.getChildren?.() ?? []).flatMap((child) => [child, ...descendants(child)])
      const buttons = descendants(rendered.renderer.root).filter((node) => node.focusable)
      expect(buttons).toHaveLength(7)
      expect(buttons.every((node) => node.border === false)).toBe(true)
      expect(frame).not.toContain("Galar")
      const first = buttons[0]
      if (first?.focus === undefined) throw new Error("Region choices must be focusable")
      first.focus()
      rendered.mockInput.pressEnter()
      await rendered.flush()
      expect(traveled.at(-1)).toBe(source === "kanto" ? "johto" : "kanto")

      const dismissLabel = language === "es" ? "Cerrar" : "Dismiss"
      expect(frame).not.toContain(dismissLabel)
    },
  )

  testTuiEach(
    ["en", "es"] as const,
    (language) => `identifies the evolving Pokémon and previews all eight evolutions (${language})`,
    async (language) => {
      const pokemon = pokemonInstanceSchema.parse({
        id: "00000000-0000-4000-8000-000000000031",
        speciesId: "eevee",
        name: "Eevee",
        gender: "female",
        level: 25,
        experience: 0,
        ability: "run-away",
        nature: "hardy",
        shiny: true,
        ivs: { hp: 20, attack: 20, defense: 20, specialAttack: 20, specialDefense: 20, speed: 20 },
        evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
        moves: [],
      })
      const options = evolutionAtLevel("eevee", 25, pokemon.gender, "kanto")?.targets ?? []
      const choiceId = "00000000-0000-4000-8000-000000000032"
      const state = makeTuiState({
        party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
        choicePokemon: [pokemon],
        pendingChoices: [
          {
            id: choiceId,
            kind: "evolution",
            payload: JSON.stringify({ pokemonId: pokemon.id, options }),
          },
        ],
      })
      const spriteRequests: unknown[][] = []
      const selected: string[][] = []
      const rendered = await renderTui(
        () => (
          <PendingChoiceCard
            state={() => state}
            language={() => language}
            onResolveMove={async () => {}}
            onResolveEvolution={async (id, speciesId) => {
              selected.push([id, speciesId])
            }}
            resolveSprite={async (...args) => {
              spriteRequests.push(args)
              return { kind: "placeholder" }
            }}
            imageProtocol={() => "auto"}
          />
        ),
        { width: 34, height: 48 },
      )
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      expect(frame).toContain(
        language === "en" ? "Eevee is evolving!" : "¡Eevee está evolucionando!",
      )
      expect(options).toHaveLength(8)
      for (const speciesId of ["eevee", ...options.map((option) => option.speciesId)]) {
        expect(spriteRequests).toContainEqual([speciesId, true, "female"])
      }
      for (const option of options) expect(frame).toContain(option.name)

      const lines = frame.split("\n")
      const hoverRow = lines.findIndex((line) => line.includes("Vaporeon"))
      await rendered.mockMouse.moveTo(lines[hoverRow]?.indexOf("Vaporeon") ?? -1, hoverRow)
      await rendered.flush()
      expect(
        rendered
          .captureSpans()
          .lines.flatMap((line) => line.spans)
          .find((span) => span.text.includes("Vaporeon"))?.bg,
      ).toEqual(RGBA.fromHex("#404040"))
      const row = lines.findIndex((line) => line.includes("Sylveon"))
      await rendered.mockMouse.click(lines[row]?.indexOf("Sylveon") ?? -1, row)
      await rendered.flush()
      expect(selected).toEqual([[choiceId, "sylveon"]])

      type FocusableNode = {
        focusable?: boolean
        focus?: () => void
        x?: number
        y?: number
        width?: number
        border?: boolean
        getChildren?: () => FocusableNode[]
      }
      const descendants = (node: FocusableNode): FocusableNode[] =>
        (node.getChildren?.() ?? []).flatMap((child) => [child, ...descendants(child)])
      const first = descendants(rendered.renderer.root).find((node) => node.focusable)
      if (first?.focus === undefined) throw new Error("Evolution choices must be focusable")
      first.focus()
      await rendered.flush()
      expect(
        rendered
          .captureSpans()
          .lines.flatMap((line) => line.spans)
          .find((span) => span.text.includes("Vaporeon"))?.bg,
      ).toEqual(RGBA.fromHex("#404040"))
      const preview = first.getChildren?.()[0]?.getChildren?.()[0]
      const label = first.getChildren?.()[1]?.getChildren?.()[0]
      const center = (node: FocusableNode | undefined) => (node?.x ?? 0) + (node?.width ?? 0) / 2
      expect(first.border).toBe(false)
      expect(center(preview)).toBe(center(first))
      expect(center(label)).toBe(center(first))
      const initialY = preview?.y
      expect(initialY).toBeNumber()
      await Bun.sleep(260)
      await rendered.flush()
      expect(preview?.y).toBe(initialY)
      expect(
        rendered
          .captureCharFrame()
          .split("\n")
          .findIndex((line) => line.includes("Vaporeon")),
      ).toBe(hoverRow)
      rendered.mockInput.pressEnter()
      await rendered.flush()
      expect(selected.at(-1)).toEqual([choiceId, "vaporeon"])
    },
  )

  testTui("renders starter sprites without names for the supported regions", async () => {
    // GIVEN
    const rendered = await renderTui(
      () => (
        <StarterButtons
          resolveSprite={placeholder}
          imageProtocol={() => "auto"}
          hovered={() => null}
          hoverBackground="#808080"
          onChoose={async () => {}}
          onHover={() => {}}
        />
      ),
      { width: 40, height: 120 },
    )

    // WHEN
    await rendered.flush()

    // THEN
    const frame = rendered.captureCharFrame()
    expect(frame).toContain("Kanto")
    expect(frame).toContain("Johto")
    expect(frame).toContain("?")
    expect(frame).not.toContain("Bulbasaur")
    expect(frame).not.toContain("Chikorita")
  })

  testTui("allows a focused starter choice to be selected from the keyboard", async () => {
    // GIVEN
    const selected: Array<{ regionId: string; speciesId: string }> = []
    const rendered = await renderTui(
      () => (
        <StarterButtons
          resolveSprite={placeholder}
          imageProtocol={() => "auto"}
          hovered={() => null}
          hoverBackground="#808080"
          onChoose={async (regionId, speciesId) => {
            selected.push({ regionId, speciesId })
          }}
          onHover={() => {}}
        />
      ),
      { width: 40, height: 22 },
    )
    await rendered.flush()
    type FocusableNode = {
      focusable?: boolean
      focus?: () => void
      getChildren?: () => FocusableNode[]
    }
    const renderables = (node: FocusableNode): FocusableNode[] => {
      const children = node.getChildren?.() ?? []
      return children.flatMap((child) => [child, ...renderables(child)])
    }
    const firstButton = renderables(rendered.renderer.root as FocusableNode).find(
      (node) => node.focusable,
    )
    if (firstButton?.focus === undefined)
      throw new Error("Starter choices should expose focusable controls")

    // WHEN
    firstButton.focus()
    rendered.mockInput.pressEnter()
    await rendered.flush()

    // THEN
    expect(selected).toEqual([{ regionId: "kanto", speciesId: "bulbasaur" }])
  })

  testTui("updates travel availability, destination, and progress after travel", async () => {
    // GIVEN
    const [state, setState] = createSignal(
      makeTuiState({
        region: "kanto",
        location: "pallet-town",
        exploration: {
          locations: [
            { id: "pallet-town", name: "Pallet Town", unlocked: true, encounterless: true },
            { id: "kanto-route-1", name: "Route 1", unlocked: true, encounterless: false },
          ],
          locationUnlockProgress: 0,
          locationUnlockThreshold: 100_000,
          regionComplete: false,
        },
      }),
    )
    const rendered = await renderTui(
      () => (
        <LocationProgress
          state={state}
          onTravel={async (locationId) => {
            setState((previous) => ({ ...previous, location: locationId }))
          }}
        />
      ),
      { width: 50, height: 4 },
    )
    await rendered.flush()

    // WHEN
    const frame = rendered.captureCharFrame().split("\n")
    const travelRow = frame.findIndex((line) => line.includes("Travel"))
    const travelColumn = frame[travelRow]?.indexOf("Travel") ?? -1
    await rendered.mockMouse.click(travelColumn, travelRow)
    await rendered.flush()
    const afterTravel = rendered.captureCharFrame()
    setState((previous) => ({
      ...previous,
      exploration:
        previous.exploration === null
          ? null
          : { ...previous.exploration, locationUnlockProgress: 12_345 },
    }))
    await rendered.flush()

    // THEN
    expect(travelRow).toBeGreaterThanOrEqual(0)
    expect(travelColumn).toBeGreaterThanOrEqual(0)
    expect(afterTravel).toContain("Route 1 (Kanto)")
    expect(afterTravel).not.toContain("Pallet Town")
    expect(afterTravel).not.toContain("Travel")
    expect(afterTravel).toContain("Next location: 0.00%")
    expect(rendered.captureCharFrame()).toContain("Next location: 12.35%")
  })

  testTuiEach(
    [
      {
        name: "English shows catch and run",
        caught: true,
        language: "en" as const,
        catchLabel: "Catch",
        runLabel: "Run",
        caughtColor: "#22c55e",
      },
      {
        name: "Spanish shows localized encounter actions",
        caught: false,
        language: "es" as const,
        catchLabel: "Capturar",
        runLabel: "Huir",
        caughtColor: "#808080",
      },
    ],
    ({ name }) => name,
    async ({ caught, language, catchLabel, runLabel, caughtColor }) => {
      // GIVEN
      const rendered = await renderTui(
        () => (
          <EncounterCard
            encounter={() => ({
              id: "a058c8b8-6638-42d3-84a6-ea3f5f8d5003",
              kind: "ordinary",
              speciesId: speciesIdSchema.parse("pidgey"),
              name: "Pidgey",
              level: 2,
              gender: "female",
              shiny: true,
              caught,
              spriteUrl: "https://example.test/pidgey.png",
            })}
            hoveredAction={() => "catch"}
            language={() => language}
            mutedColor={() => "#808080"}
            onHover={() => {}}
            onResolve={async () => {}}
            resolveSprite={placeholder}
            imageProtocol={() => "auto"}
          />
        ),
        { width: 40, height: 12 },
      )

      // WHEN
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      const indicator = rendered
        .captureSpans()
        .lines.flatMap((line) => line.spans)
        .find((span) => span.text.includes("●"))

      // THEN
      expect(frame).toContain(
        language === "es" ? "✨ Pidgey salvaje ♀ Nv.2" : "✨ Wild Pidgey ♀ Lv.2",
      )
      expect(frame).toContain(catchLabel)
      expect(frame).toContain(runLabel)
      expect(indicator?.fg).toEqual(RGBA.fromHex(caughtColor))
    },
  )

  testTui("hides a resolved encounter instead of rendering an empty card", async () => {
    // GIVEN
    const rendered = await renderTui(
      () => (
        <EncounterCard
          encounter={() => null}
          hoveredAction={() => null}
          mutedColor={() => "#808080"}
          onHover={() => {}}
          onResolve={async () => {}}
          resolveSprite={placeholder}
          imageProtocol={() => "auto"}
        />
      ),
      { width: 40, height: 12 },
    )

    // WHEN
    await rendered.flush()

    // THEN
    expect(rendered.renderer.root.getChildren()).toHaveLength(0)
  })

  testTui("centers occupied party members without adding empty-slot labels", async () => {
    // GIVEN
    const pokemon = pokemonInstanceSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      speciesId: "bulbasaur",
      name: "Bulbasaur",
      gender: "male",
      level: 5,
      experience: 0,
      ability: "Overgrow",
      nature: "Hardy",
      shiny: false,
      ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      moves: [],
    })
    const rendered = await renderTui(
      () => (
        <PartyGrid
          party={() => [
            { position: 1, pokemon: null },
            { position: 2, pokemon },
          ]}
          resolveSprite={placeholder}
          imageProtocol={() => "auto"}
        />
      ),
      { width: 40, height: 10 },
    )

    // WHEN
    await rendered.flush()
    const frame = rendered.captureCharFrame()

    // THEN
    expect(frame).toContain("Bulbasaur ♂")
    expect(frame).toContain("Lv.5")
    expect(frame).not.toContain("1. Bulbasaur")
    expect(frame).not.toContain("Empty")
  })

  testTuiEach(
    [32, 40, 41],
    (width) =>
      `left-aligns moves while keeping the heading and sprite centered in a ${width}-column sidebar`,
    async (width) => {
      // GIVEN
      const pokemonId = "00000000-0000-4000-8000-000000000011"
      const pokemon = pokemonInstanceSchema.parse({
        id: pokemonId,
        speciesId: "goldeen",
        name: "Goldeen",
        level: 20,
        experience: 0,
        ability: "Swift Swim",
        nature: "Hardy",
        shiny: false,
        ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
        evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
        moves: [
          { id: "tackle", name: "Tackle" },
          { id: "tail-whip", name: "Tail Whip" },
          { id: "water-gun", name: "Water Gun" },
          { id: "withdraw", name: "Withdraw" },
        ],
      })
      const rendered = await renderTui(
        () => (
          <MoveChoiceCard
            choice={() => ({
              id: "00000000-0000-4000-8000-000000000012",
              kind: "move",
              payload: JSON.stringify({
                pokemonId,
                move: { id: "supersonic", name: "Supersonic" },
              }),
            })}
            party={() => []}
            choicePokemon={() => [pokemon]}
            onResolve={async () => {}}
            resolveSprite={placeholder}
            imageProtocol={() => "auto"}
            language={() => "es"}
          />
        ),
        { width, height: 48 },
      )

      // WHEN
      await rendered.flush()
      const frame = rendered.captureCharFrame()
      const names = ["Placaje", "Agitacola", "Pistola Agua", "Refugio", "Supersónico"]
      const actionRows = frame
        .split("\n")
        .filter((line) => names.some((name) => line.includes(name)))

      // THEN
      expect(frame).toContain("Goldeen quiere aprender")
      expect(frame).toContain("un nuevo movimiento")
      expect(actionRows).toHaveLength(5)
      for (const [index, name] of names.entries()) expect(actionRows[index]).toContain(name)
      expect(frame).toContain("Normal · Físico")
      expect(frame).toContain("Pot 40 · Prec 100% · PP 35")
      const card = rendered.renderer.root.getChildren()[0]
      const sprite = card?.getChildren()[1]
      expect(sprite?.width).toBe(8)
      expect(sprite?.height).toBe(4)
      expect(Math.abs((sprite?.x ?? 0) + 4 - width / 2)).toBeLessThanOrEqual(1)
      for (const label of ["Goldeen quiere aprender", "un nuevo movimiento"]) {
        const row = frame.split("\n").find((line) => line.includes(label))
        if (row === undefined) throw new Error(`Missing sidebar text: ${label}`)
        const center = stringWidth(row.slice(0, row.indexOf(label))) + stringWidth(label) / 2
        expect(Math.abs(center - width / 2)).toBeLessThanOrEqual(1)
      }
      for (const name of names) {
        const row = frame.split("\n").find((line) => line.includes(name))
        expect(row?.indexOf(name)).toBe(4)
      }
      for (const label of ["Normal · Físico", "Pot 40 · Prec 100% · PP 35"]) {
        const row = frame.split("\n").find((line) => line.includes(label))
        expect(row?.indexOf(label)).toBe(2)
      }
    },
  )

  testTui("refreshes the localized choice card when the queued move becomes active", async () => {
    // GIVEN
    const pokemonId = "00000000-0000-4000-8000-000000000021"
    const base = pokemonInstanceSchema.parse({
      id: pokemonId,
      speciesId: "goldeen",
      name: "Goldeen",
      level: 20,
      experience: 0,
      ability: "Swift Swim",
      nature: "Hardy",
      shiny: false,
      ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      moves: [
        { id: "peck", name: "Picotazo" },
        { id: "water-gun", name: "Pistola Agua" },
      ],
    })
    const first = {
      id: "00000000-0000-4000-8000-000000000022",
      kind: "move" as const,
      payload: JSON.stringify({ pokemonId, move: { id: "peck", name: "Picotazo" } }),
    }
    const second = {
      id: "00000000-0000-4000-8000-000000000023",
      kind: "move" as const,
      payload: JSON.stringify({ pokemonId, move: { id: "water-gun", name: "Pistola Agua" } }),
    }
    const [state, setState] = createSignal(
      makeTuiState({
        party: [
          { position: 1, pokemon: base },
          ...[2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
        ],
        pendingChoices: [first, second],
      }),
    )
    const rendered = await renderTui(
      () => (
        <PendingChoiceCard
          state={state}
          onResolveMove={async () => {}}
          onResolveEvolution={async () => {}}
          resolveSprite={placeholder}
          imageProtocol={() => "auto"}
          language={() => "es"}
        />
      ),
      { width: 40, height: 48 },
    )
    await rendered.flush()

    // WHEN
    setState((previous) => ({ ...previous, pendingChoices: [second] }))
    await rendered.flush()

    // THEN
    expect(rendered.captureCharFrame()).toContain("Goldeen quiere aprender")
    const grayNames = rendered
      .captureSpans()
      .lines.flatMap((line) => line.spans)
      .filter((span) => span.bg.equals(RGBA.fromHex("#6b7280")))
      .map((span) => span.text)
      .join("")
    expect(grayNames).toContain("Pistola Agua")
    expect(grayNames).not.toContain("Picotazo")
  })
})
