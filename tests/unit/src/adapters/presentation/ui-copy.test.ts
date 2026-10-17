import { describe, expect, test } from "bun:test"
import { uiCopy } from "../../../../../src/adapters/presentation/ui-copy.js"

describe("localized UI copy", () => {
  test.each(["en", "es"] as const)("keeps PokéCode branding in %s", (language) => {
    const copy = uiCopy(language)

    expect(copy.title).toBe("PokéCode")
    expect(copy.commandGroup).toBe("PokéCode")
  })

  test("prompts move selection in each supported language", () => {
    // GIVEN
    const languages = ["en", "es"] as const

    // WHEN
    const descriptions = languages.map((language) => uiCopy(language).moveDescription)

    // THEN
    expect(descriptions).toEqual(["Choose a move to forget:", "Elige un movimiento que olvidar:"])
    expect(uiCopy("en").movePrompt("Bulbasaur")).toBe("Bulbasaur wants to learn\na new move")
    expect(uiCopy("es").movePrompt("Bulbasaur")).toBe(
      "Bulbasaur quiere aprender\nun nuevo movimiento",
    )
  })

  test("localizes pending decision and encounter queue counts", () => {
    expect(uiCopy("en").queueCounts(2, 3)).toBe("Pending: 2 decisions · 3 encounters")
    expect(uiCopy("es").queueCounts(1, 1)).toBe("Pendientes: 1 decisión · 1 encuentro")
  })

  test.each([
    {
      language: "en" as const,
      ordinary: "Wild Pidgey ♀ Lv.2",
      shiny: "✨ Wild Pidgey ♀ Lv.2",
    },
    {
      language: "es" as const,
      ordinary: "Pidgey salvaje ♀ Nv.2",
      shiny: "✨ Pidgey salvaje ♀ Nv.2",
    },
  ])("formats concise $language encounter headings", (scenario) => {
    // GIVEN
    const copy = uiCopy(scenario.language)

    // WHEN
    const ordinary = copy.encounter({
      genderSymbol: "♀",
      kind: "ordinary",
      level: 2,
      name: "Pidgey",
      shiny: false,
    })
    const shiny = copy.encounter({
      genderSymbol: "♀",
      kind: "special",
      level: 2,
      name: "Pidgey",
      shiny: true,
    })

    // THEN
    expect(ordinary).toBe(scenario.ordinary)
    expect(shiny).toBe(scenario.shiny)
  })
})
