type EvolutionMethod = "happiness" | "level" | "other" | "stone" | "trade"

type Evolution = {
  readonly conditions: readonly {
    readonly kind: string
    readonly value: string | number | boolean
  }[]
  readonly method: EvolutionMethod
  readonly sourceSpeciesId: string
  readonly targetSpeciesId: string
}

const baselinePokemonAnilLevels: Readonly<Record<string, number>> = {
  "aipom>ambipom": 32,
  "applin>dipplin": 28,
  "basculin>basculegion": 40,
  "bisharp>kingambit": 42,
  "boldore>gigalith": 40,
  "bonsly>sudowoodo": 25,
  "bramblin>brambleghast": 30,
  "budew>roselia": 20,
  "cetoddle>cetitan": 34,
  "charjabug>vikavolt": 36,
  "chingling>chimecho": 30,
  "clamperl>huntail": 40,
  "clobbopus>grapploct": 30,
  "crabrawler>crabominable": 36,
  "dipplin>hydrapple": 50,
  "dunsparce>dudunsparce": 37,
  "duraludon>archaludon": 55,
  "dusclops>dusknoir": 45,
  "electabuzz>electivire": 50,
  "feebas>milotic": 37,
  "gimmighoul>gholdengo": 50,
  "girafarig>farigiraf": 40,
  "gligar>gliscor": 42,
  "graveler>golem": 45,
  "gurdurr>conkeldurr": 45,
  "haunter>gengar": 45,
  "karrablast>escavalier": 32,
  "kadabra>alakazam": 45,
  "lickitung>lickilicky": 35,
  "magmar>magmortar": 50,
  "magneton>magnezone": 45,
  "machoke>machamp": 45,
  "mantyke>mantine": 24,
  "meltan>melmetal": 50,
  "onix>steelix": 42,
  "phantump>trevenant": 38,
  "piloswine>mamoswine": 40,
  "poipole>naganadel": 50,
  "porygon>porygon2": 30,
  "primeape>annihilape": 44,
  "pumpkaboo>gourgeist": 37,
  "rhydon>rhyperior": 50,
  "rellor>rabsca": 30,
  "scyther>scizor": 45,
  "seadra>kingdra": 50,
  "shelmet>accelgor": 32,
  "stantler>wyrdeer": 40,
  "steenee>tsareena": 30,
  "tandemaus>maushold": 25,
  "tangela>tangrowth": 40,
  "ursaring>ursaluna": 45,
  "yanma>yanmega": 38,
}

const pokemonAnilLevels: Readonly<Record<string, number>> = {
  ...baselinePokemonAnilLevels,
  "aipom>ambipom": 32,
  "applin>dipplin": 28,
  "axew>fraxure": 30,
  "baltoy>claydol": 33,
  "basculin>basculegion": 40,
  "bisharp>kingambit": 42,
  "boldore>gigalith": 40,
  "bonsly>sudowoodo": 25,
  "bramblin>brambleghast": 30,
  "brionne>primarina": 36,
  "budew>roselia": 20,
  "cacnea>cacturne": 30,
  "carkol>coalossal": 40,
  "caterpie>metapod": 9,
  "cetoddle>cetitan": 34,
  "charjabug>vikavolt": 36,
  "chewtle>drednaw": 24,
  "chingling>chimecho": 30,
  "clamperl>huntail": 40,
  "clauncher>clawitzer": 35,
  "clobbopus>grapploct": 30,
  "crabrawler>crabominable": 36,
  "cubchoo>beartic": 34,
  "dartrix>decidueye": 36,
  "deerling>sawsbuck": 32,
  "deino>zweilous": 36,
  "dewpider>araquanid": 26,
  "dipplin>hydrapple": 50,
  "drizzile>inteleon": 36,
  "ducklett>swanna": 30,
  "dunsparce>dudunsparce": 37,
  "duosion>reuniclus": 38,
  "duraludon>archaludon": 55,
  "dusclops>dusknoir": 45,
  "duskull>dusclops": 30,
  "dwebble>crustle": 32,
  "electabuzz>electivire": 50,
  "elekid>electabuzz": 25,
  "elgyem>beheeyem": 33,
  "feebas>milotic": 37,
  "foongus>amoonguss": 36,
  "frillish>jellicent": 35,
  "gimmighoul>gholdengo": 50,
  "girafarig>farigiraf": 40,
  "glameow>purugly": 28,
  "gligar>gliscor": 42,
  "golett>golurk": 35,
  "gothita>gothorita": 25,
  "gothorita>gothitelle": 38,
  "graveler>golem": 45,
  "grimer>muk": 32,
  "gulpin>swalot": 28,
  "gurdurr>conkeldurr": 45,
  "haunter>gengar": 45,
  "hoothoot>noctowl": 24,
  "joltik>galvantula": 32,
  "kabuto>kabutops": 35,
  "kadabra>alakazam": 45,
  "kakuna>beedrill": 16,
  "karrablast>escavalier": 32,
  "klang>klinklang": 40,
  "klink>klang": 25,
  "koffing>weezing": 30,
  "kricketot>kricketune": 15,
  "larvesta>volcarona": 55,
  "ledyba>ledian": 21,
  "lickitung>lickilicky": 35,
  "litleo>pyroar": 30,
  "litten>torracat": 16,
  "litwick>lampent": 34,
  "machoke>machamp": 45,
  "machop>machoke": 26,
  "magby>magmar": 25,
  "magmar>magmortar": 50,
  "magneton>magnezone": 45,
  "mantyke>mantine": 24,
  "meltan>melmetal": 50,
  "metapod>butterfree": 16,
  "mienfoo>mienshao": 34,
  "mime-jr>mr-mime": 20,
  "natu>xatu": 28,
  "noibat>noivern": 42,
  "nosepass>probopass": 40,
  "omanyte>omastar": 35,
  "onix>steelix": 42,
  "paras>parasect": 22,
  "pawniard>bisharp": 32,
  "phantump>trevenant": 38,
  "piloswine>mamoswine": 40,
  "poipole>naganadel": 50,
  "poliwag>poliwhirl": 22,
  "popplio>brionne": 16,
  "porygon>porygon2": 30,
  "porygon2>porygon-z": 50,
  "primeape>annihilape": 44,
  "psyduck>golduck": 30,
  "pumpkaboo>gourgeist": 37,
  "raboot>cinderace": 36,
  "rellor>rabsca": 30,
  "rhydon>rhyperior": 50,
  "rowlet>dartrix": 16,
  "rufflet>braviary": 35,
  "salandit>salazzle": 30,
  "sandile>krokorok": 25,
  "sandygast>palossand": 40,
  "scraggy>scrafty": 32,
  "scyther>scizor": 45,
  "seadra>kingdra": 50,
  "sentret>furret": 25,
  "shelmet>accelgor": 32,
  "shinx>luxio": 16,
  "shuppet>banette": 32,
  "silicobra>sandaconda": 31,
  "skorupi>drapion": 32,
  "skrelp>dragalge": 35,
  "skwovet>greedent": 20,
  "slugma>magcargo": 33,
  "sneasel>weavile": 38,
  "solosis>duosion": 25,
  "spinarak>ariados": 21,
  "spritzee>aromatisse": 27,
  "stantler>wyrdeer": 40,
  "steenee>tsareena": 30,
  "stufful>bewear": 30,
  "surskit>masquerain": 25,
  "swirlix>slurpuff": 27,
  "tangela>tangrowth": 40,
  "tarountula>spidops": 20,
  "thwackey>rillaboom": 36,
  "timburr>gurdurr": 23,
  "torracat>incineroar": 36,
  "trubbish>garbodor": 26,
  "tympole>palpitoad": 20,
  "tynamo>eelektrik": 30,
  "ursaring>ursaluna": 45,
  "vanillish>vanilluxe": 40,
  "vanillite>vanillish": 25,
  "vullaby>mandibuzz": 35,
  "weedle>kakuna": 9,
  "yanma>yanmega": 38,
  "zweilous>hydreigon": 55,
}

function evolutionKey(sourceSpeciesId: string, targetSpeciesId: string): string {
  return `${sourceSpeciesId}>${targetSpeciesId}`
}

// Every genuine branch must be offered together, before any automatic evolution
// can consume the source species. Preserve native or reviewed Añil milestones.
const branchingEvolutionLevels: Readonly<Record<string, number>> = {
  applin: 28,
  kirlia: 30,
  nincada: 20,
  poliwhirl: 36,
  scyther: 45,
  slowpoke: 37,
  snorunt: 42,
}

const regionalAnilLevels: Readonly<Record<string, number>> = {
  "graveler-alola>golem-alola": 45,
  "grimer-alola>muk-alola": 32,
}

export function levelForEvolution(evolution: Evolution): number {
  const branchLevel = branchingEvolutionLevels[evolution.sourceSpeciesId]
  if (branchLevel !== undefined) return branchLevel
  const copied =
    regionalAnilLevels[evolutionKey(evolution.sourceSpeciesId, evolution.targetSpeciesId)] ??
    pokemonAnilLevels[evolutionKey(evolution.sourceSpeciesId, evolution.targetSpeciesId)]
  if (copied !== undefined) return copied
  const nativeLevel = evolution.conditions.find(
    (condition) => condition.kind === "level" && typeof condition.value === "number",
  )
  if (nativeLevel !== undefined && typeof nativeLevel.value === "number") return nativeLevel.value
  if (evolution.sourceSpeciesId === "eevee") return 25
  if (evolution.sourceSpeciesId === "sneasel" && evolution.targetSpeciesId === "sneasler") return 38
  if (evolution.sourceSpeciesId === "mime-jr" || evolution.sourceSpeciesId === "happiny") return 25
  switch (evolution.method) {
    case "happiness":
      return 30
    case "stone":
      return 36
    case "trade":
    case "other":
    case "level":
      return 40
  }
}
