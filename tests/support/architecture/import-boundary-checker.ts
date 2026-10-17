import { existsSync, readdirSync, readFileSync } from "node:fs"
import { builtinModules } from "node:module"
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

export type ImportBoundaryViolation = {
  readonly file: string
  readonly message: string
}

type ImportReference = Readonly<{
  specifier: string
  line: number
  runtime: boolean
  node: ts.Node
}>

type ModuleGraph = Readonly<{
  files: ReadonlySet<string>
  references: ReadonlyMap<string, readonly ImportReference[]>
  edges: ReadonlyMap<string, readonly Readonly<{ target: string; reference: ImportReference }>[]>
}>

// Shared test support lives three directories below the package root.
const checkerPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const allowedPackages = new Set(["zod"])
const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const unitTestPattern = /\.(?:test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const allowedTestRoots = new Set(["unit", "integration", "smoke", "support"])
const allowedIntegrationBuckets = new Set([
  "gameplay",
  "persistence",
  "server",
  "tui",
  "architecture",
  "content",
  "tooling",
  "package",
])
const genericSupportGroups = new Set(["helpers", "fixtures", "utils", "common"])
const forbiddenGlobalRuntimeNames = new Set([
  "Bun",
  "Deno",
  "process",
  "global",
  "globalThis",
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "navigator",
  "window",
  "document",
  "location",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "crypto",
  "console",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "queueMicrotask",
])

/**
 * Enforces the inward import rules for the domain and application layers.
 * Relative imports are resolved with TypeScript's bundler resolver so `.js`
 * source specifiers, directory indexes, and type-only dependencies are checked
 * in the same way as ordinary imports.
 */
export function checkImportBoundaries(sourceRoot: string): ImportBoundaryViolation[] {
  const root = resolve(sourceRoot)
  const files = [
    ...sourceFiles(resolve(root, "domain")),
    ...sourceFiles(resolve(root, "application")),
  ]
  const violations: ImportBoundaryViolation[] = []

  for (const file of files) {
    const layer = isWithin(file, resolve(root, "domain")) ? "domain" : "application"
    violations.push(...nonliteralImportViolations(file, layer))
    const references = readReferences(file)
    for (const reference of references) {
      const { specifier, line } = reference
      if (isRuntimeModule(specifier)) {
        violations.push({
          file,
          message: `line ${line}: ${layer} imports forbidden runtime module '${specifier}'`,
        })
        continue
      }
      if (!specifier.startsWith(".")) {
        if (!allowedPackages.has(specifier)) {
          violations.push({
            file,
            message: `line ${line}: ${layer} imports non-whitelisted package '${specifier}'`,
          })
        }
        continue
      }

      const target = resolveSource(file, specifier)
      if (target === null) {
        violations.push({
          file,
          message: `line ${line}: ${layer} has unresolved import '${specifier}'`,
        })
        continue
      }
      const inDomain = isWithin(target, resolve(root, "domain"))
      const inApplication = isWithin(target, resolve(root, "application"))
      if (
        (layer === "domain" && !inDomain) ||
        (layer === "application" && !inDomain && !inApplication)
      ) {
        violations.push({
          file,
          message: `line ${line}: ${layer} import '${specifier}' resolves outside allowed domain/application modules`,
        })
      }
    }
  }

  return violations
}

function nonliteralImportViolations(
  file: string,
  layer: "domain" | "application",
): ImportBoundaryViolation[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  const violations: ImportBoundaryViolation[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isDynamicLoadCall(node)) {
      const argument = node.arguments[0]
      if (argument === undefined || !ts.isStringLiteralLike(argument)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        violations.push({
          file,
          message: `line ${line}: ${layer} nonliteral dynamic import is not allowed (including require())`,
        })
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      (node.moduleReference.expression === undefined ||
        !ts.isStringLiteralLike(node.moduleReference.expression))
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      violations.push({
        file,
        message: `line ${line}: ${layer} nonliteral import-equals require is not allowed`,
      })
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument
      if (!ts.isLiteralTypeNode(argument) || !ts.isStringLiteralLike(argument.literal)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
        violations.push({
          file,
          message: `line ${line}: ${layer} nonliteral import type is not allowed`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

/** Checks layer imports, source-wide cycles, runtime entrypoint graphs, and public boundaries. */
export function checkArchitecture(sourceRoot: string): ImportBoundaryViolation[] {
  const root = resolve(sourceRoot)
  const graph = createModuleGraph(root)
  const program = ts.createProgram({
    rootNames: [...graph.files],
    options: {
      allowImportingTsExtensions: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      allowJs: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
    },
  })
  return [
    ...checkImportBoundaries(root),
    ...checkNonliteralArchitectureLoads(root, graph),
    ...checkCycles(root, graph),
    ...checkRuntimeEntrypointGraphs(root, graph, program),
    ...checkPublicEntrypointImports(root, graph),
    ...checkInnerRuntimeGlobals(root, graph, program),
  ]
}

/** Enforces public source entrypoints and the repository's test/support layout. */
export function checkRepositoryLayout(projectRoot: string): ImportBoundaryViolation[] {
  const root = resolve(projectRoot)
  const sourceRoot = resolve(root, "src")
  const testsRoot = resolve(root, "tests")
  const violations: ImportBoundaryViolation[] = []
  const allowedRootSources = new Set(["index.ts", "rpc.ts", "tui.tsx", "cli.ts"])

  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !sourceExtensions.has(extname(entry.name))) continue
    if (!allowedRootSources.has(entry.name)) {
      violations.push({
        file: resolve(sourceRoot, entry.name),
        message: `unexpected root source file '${entry.name}'; implementations belong in an owning module directory`,
      })
    }
  }

  if (existsSync(testsRoot)) {
    const entries = readdirSync(testsRoot, { withFileTypes: true })
    for (const entry of entries) {
      const path = resolve(testsRoot, entry.name)
      if (entry.isFile()) {
        violations.push({
          file: path,
          message:
            "tests/ may contain only approved category directories; files must be grouped beneath them",
        })
      } else if (entry.isDirectory() && !allowedTestRoots.has(entry.name)) {
        violations.push({
          file: path,
          message: `unapproved tests/ root directory '${entry.name}'; use unit, integration, smoke, or support`,
        })
      }
    }

    for (const [parentName, allowedChildren] of [
      ["unit", new Set(["src", "scripts"])],
      ["integration", allowedIntegrationBuckets],
      ["smoke", new Set(["package"])],
    ] as const) {
      const parent = resolve(testsRoot, parentName)
      if (!existsSync(parent)) continue
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory() && !allowedChildren.has(entry.name)) {
          violations.push({
            file: resolve(parent, entry.name),
            message: `unapproved ${parentName} directory '${entry.name}'`,
          })
        }
      }
    }

    for (const file of sourceFiles(testsRoot)) {
      const relativePath = relative(testsRoot, file).split(sep)
      const isExecutableTest = testFilePattern.test(file)
      if (
        isExecutableTest &&
        relativePath.some((part) => part === "support" || part === "_support")
      ) {
        violations.push({
          file,
          message: "executable tests must not live in shared support or local _support directories",
        })
      }

      if (relativePath[0] === "unit" && !isTestSupportPath(file, testsRoot) && !isExecutableTest) {
        violations.push({
          file,
          message: "unit/ may contain only mirrored executable test files",
        })
      }

      if (
        (relativePath[0] === "integration" || relativePath[0] === "smoke") &&
        !isTestSupportPath(file, testsRoot) &&
        !isExecutableTest
      ) {
        violations.push({
          file,
          message: `${relativePath[0]}/ may contain only executable tests and local support`,
        })
      }

      if (
        (relativePath[0] === "integration" || relativePath[0] === "smoke") &&
        isExecutableTest &&
        relativePath.length < 3
      ) {
        violations.push({
          file,
          message: `${relativePath[0]} tests must be placed inside an approved behavior bucket`,
        })
      }

      if (relativePath[0] === "unit" && isExecutableTest) {
        const sourceRootName = relativePath[1]
        const testRoot =
          sourceRootName === "src"
            ? resolve(root, "src")
            : sourceRootName === "scripts"
              ? resolve(root, "scripts")
              : null
        const testSuffix = file.match(unitTestPattern)
        const extension = testSuffix?.[1]
        if (testRoot === null || extension === undefined) {
          violations.push({
            file,
            message:
              "unit tests must mirror a source module under tests/unit/src or tests/unit/scripts",
          })
        } else {
          const testPath = relativePath.slice(2)
          const testName = testPath.at(-1) ?? ""
          const sourceName = testName.replace(/\.(?:test|spec)\.[^.]+$/, `.${extension}`)
          const sourceFile = resolve(testRoot, ...testPath.slice(0, -1), sourceName)
          if (!existsSync(sourceFile) || !sourceExtensions.has(extname(sourceFile))) {
            violations.push({
              file,
              message: `unit test has no matching implementation module '${relative(root, sourceFile).split(sep).join("/")}'`,
            })
          }
        }
      }
    }

    violations.push(...checkSupportLayout(testsRoot, testFilePattern, genericSupportGroups))
  }

  for (const directory of [sourceRoot, testsRoot, resolve(root, "scripts")]) {
    for (const file of sourceFiles(directory)) {
      const testPath = relative(testsRoot, file).split(sep)
      if (
        isWithin(file, testsRoot) &&
        (testPath.includes("_support") ||
          isWithin(file, resolve(testsRoot, "support/architecture/sample-projects")))
      )
        continue
      for (const reference of readReferences(file)) {
        if (!reference.specifier.startsWith(".")) continue
        const target = resolve(dirname(file), reference.specifier)
        const sourceRelative = relative(sourceRoot, target)
        const resolvedTarget = resolveSource(file, reference.specifier)
        const targetsFormalEntrypoint =
          resolvedTarget !== null &&
          [...allowedRootSources].some((entry) => resolvedTarget === resolve(sourceRoot, entry))
        const rootSourceTarget =
          !sourceRelative.startsWith(`..${sep}`) &&
          sourceRelative !== ".." &&
          !isAbsolute(sourceRelative) &&
          !sourceRelative.includes(sep)
        if (rootSourceTarget && !targetsFormalEntrypoint) {
          violations.push({
            file,
            message: `line ${reference.line}: import '${reference.specifier}' targets a non-entrypoint root source path; import its owning module instead`,
          })
        }
      }
    }
  }

  return violations
}

function checkSupportLayout(
  testsRoot: string,
  testPattern: RegExp,
  genericGroups: ReadonlySet<string>,
): ImportBoundaryViolation[] {
  const violations: ImportBoundaryViolation[] = []
  for (const directory of allDirectories(testsRoot)) {
    const relativePath = relative(testsRoot, directory).split(sep)
    const name = relativePath.at(-1)
    if (name === "_support") {
      const parent = dirname(directory)
      const testsByBasename = new Set(
        sourceFiles(parent)
          .filter((file) => dirname(file) === parent && testPattern.test(file))
          .map((file) => testBasename(file)),
      )
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || !testsByBasename.has(entry.name)) {
          violations.push({
            file: resolve(directory, entry.name),
            message: "local support must be grouped in _support/<test-basename> beside its test",
          })
        }
      }
    }
    if (relativePath[0] === "support" && relativePath.length === 2 && name !== undefined) {
      if (genericGroups.has(name)) {
        violations.push({
          file: directory,
          message: `shared support directory '${name}' is too generic; group support by purpose`,
        })
      }
    }
  }

  return violations
}

function allDirectories(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return []
    const child = resolve(directory, entry.name)
    return [child, ...allDirectories(child)]
  })
}

function isTestSupportPath(file: string, testsRoot: string): boolean {
  return relative(testsRoot, file)
    .split(sep)
    .some((part) => part === "support" || part === "_support")
}

function testBasename(file: string): string {
  return (
    file
      .replace(/\.(?:test|spec)\.[^.]+$/, "")
      .split(sep)
      .at(-1) ?? ""
  )
}

function checkNonliteralArchitectureLoads(
  root: string,
  graph: ModuleGraph,
): ImportBoundaryViolation[] {
  const violations: ImportBoundaryViolation[] = []
  for (const file of graph.files) {
    if (isWithin(file, resolve(root, "domain")) || isWithin(file, resolve(root, "application"))) {
      continue
    }
    for (const line of nonliteralDynamicImportLines(file)) {
      violations.push({
        file,
        message: `line ${line}: architectural source has a nonliteral dynamic import/require that cannot be checked`,
      })
    }
  }
  return violations
}

function checkCycles(root: string, graph: ModuleGraph): ImportBoundaryViolation[] {
  // Include every source module, including type-only imports and re-exports.
  const sourceModules = [...graph.files].sort()
  const sourceModuleSet = new Set(sourceModules)
  const state = new Map<string, "visiting" | "visited">()
  const stack: string[] = []
  const reported = new Set<string>()
  const violations: ImportBoundaryViolation[] = []

  const visit = (file: string) => {
    state.set(file, "visiting")
    stack.push(file)
    for (const edge of graph.edges.get(file) ?? []) {
      if (!sourceModuleSet.has(edge.target)) continue
      const targetState = state.get(edge.target)
      if (targetState === "visiting") {
        const start = stack.indexOf(edge.target)
        const cycle = [...stack.slice(start), edge.target]
        const key = canonicalCycle(cycle)
        if (!reported.has(key)) {
          reported.add(key)
          violations.push({
            file,
            message: `line ${edge.reference.line}: dependency cycle ${cycle.map((path) => displayPath(root, path)).join(" -> ")}`,
          })
        }
      } else if (targetState === undefined) {
        visit(edge.target)
      }
    }
    stack.pop()
    state.set(file, "visited")
  }

  for (const file of sourceModules) {
    if (state.get(file) === undefined) visit(file)
  }
  return violations
}

function checkPublicEntrypointImports(root: string, graph: ModuleGraph): ImportBoundaryViolation[] {
  const publicEntrypoints = new Map(
    ["index.ts", "rpc.ts", "tui.tsx", "cli.ts"].map((path) => [resolve(root, path), path]),
  )
  const packageName = packageNameForChecker()
  const packageEntrypoints = new Map(
    packageName === null
      ? []
      : [
          [packageName, "index.ts"],
          [`${packageName}/rpc`, "rpc.ts"],
          [`${packageName}/tui`, "tui.tsx"],
        ],
  )
  const violations: ImportBoundaryViolation[] = []

  for (const importer of graph.files) {
    if (publicEntrypoints.has(importer)) continue
    for (const reference of graph.references.get(importer) ?? []) {
      const packageEntry = packageEntrypoints.get(reference.specifier)
      const target = reference.specifier.startsWith(".")
        ? resolveSource(importer, reference.specifier)
        : null
      const publicPath =
        packageEntry ?? (target === null ? undefined : publicEntrypoints.get(target))
      if (publicPath === undefined) continue
      violations.push({
        file: importer,
        message: `line ${reference.line}: implementation imports through formal public entrypoint '${publicPath}'`,
      })
    }
  }
  return violations
}

function packageNameForChecker(): string | null {
  const manifestPath = resolve(checkerPackageRoot, "package.json")
  if (!existsSync(manifestPath)) return null
  try {
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
    if (typeof manifest !== "object" || manifest === null || !("name" in manifest)) return null
    return typeof manifest.name === "string" ? manifest.name : null
  } catch {
    return null
  }
}

function checkInnerRuntimeGlobals(
  root: string,
  graph: ModuleGraph,
  program: ts.Program,
): ImportBoundaryViolation[] {
  const checker = program.getTypeChecker()
  const violations: ImportBoundaryViolation[] = []

  for (const file of graph.files) {
    const layer = isWithin(file, resolve(root, "domain"))
      ? "domain"
      : isWithin(file, resolve(root, "application"))
        ? "application"
        : null
    if (layer === null) continue
    const source = program.getSourceFile(file)
    if (source === undefined) continue

    violations.push(...findGlobalRuntimeReferences(root, file, source, checker, layer))
  }
  return violations
}

function checkRuntimeGlobalReferences(
  root: string,
  file: string,
  program: ts.Program,
  graphName: string,
): ImportBoundaryViolation[] {
  const source = program.getSourceFile(file)
  if (source === undefined) return []
  return findGlobalRuntimeReferences(
    root,
    file,
    source,
    program.getTypeChecker(),
    `${graphName} graph`,
  )
}

function findGlobalRuntimeReferences(
  root: string,
  file: string,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  label: string,
): ImportBoundaryViolation[] {
  const violations: ImportBoundaryViolation[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      forbiddenGlobalRuntimeNames.has(node.text) &&
      isRuntimeValueIdentifier(node) &&
      !hasExplicitLocalBinding(checker, node, root)
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      violations.push({
        file,
        message: `line ${line}: ${label} references global runtime capability '${node.text}' instead of an injected/local binding`,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

function isRuntimeValueIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent
  if (ts.isTypeNode(parent)) return false
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isParameter(parent) ||
      ts.isImportClause(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isImportEqualsDeclaration(parent) ||
      ts.isBindingElement(parent) ||
      ts.isTypeParameterDeclaration(parent)) &&
    "name" in parent &&
    parent.name === node
  ) {
    return false
  }
  return true
}

function hasExplicitLocalBinding(
  checker: ts.TypeChecker,
  node: ts.Identifier,
  root: string,
): boolean {
  const symbol = checker.getSymbolAtLocation(node)
  if (symbol === undefined) return false
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    return (symbol.declarations ?? []).some((declaration) => {
      const declarationFile = resolve(declaration.getSourceFile().fileName)
      return isWithin(declarationFile, root) && !isAmbientDeclaration(declaration)
    })
  }
  return (symbol.declarations ?? []).some((declaration) => {
    const declarationFile = resolve(declaration.getSourceFile().fileName)
    return isWithin(declarationFile, root) && !isAmbientDeclaration(declaration)
  })
}

function isAmbientDeclaration(declaration: ts.Declaration): boolean {
  let current: ts.Node | undefined = declaration
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (
      ts.canHaveModifiers(current) &&
      (ts
        .getModifiers(current)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) ??
        false)
    ) {
      return true
    }
    current = current.parent
  }
  return current?.isDeclarationFile
}

function checkRuntimeEntrypointGraphs(
  root: string,
  graph: ModuleGraph,
  program: ts.Program,
): ImportBoundaryViolation[] {
  const constraints = [
    {
      entry: "index.ts",
      name: "server",
      forbidden: (path: string) =>
        /(?:^|\/)adapters\/opencode\/tui\//.test(path) ||
        /(?:^|\/)(?:tui|tui-controls)\.(?:ts|tsx)$/.test(path),
    },
    {
      entry: "tui.tsx",
      name: "TUI",
      forbidden: (path: string) =>
        /(?:^|\/)adapters\/sqlite\//.test(path) ||
        /(?:^|\/)adapters\/opencode\/server\//.test(path) ||
        /(?:^|\/)adapters\/sprites\/(?:cache|.*cache)\.ts$/.test(path) ||
        /(?:^|\/)(?:sprite-cache|game-repository)\.ts$/.test(path),
    },
    {
      entry: "rpc.ts",
      name: "RPC",
      forbidden: (path: string) =>
        /(?:^|\/)adapters\/(?:sqlite|opencode\/server|opencode\/tui|sprites\/cache)(?:\/|\.)/.test(
          path,
        ) ||
        path === "index.ts" ||
        path === "cli.ts",
    },
  ] as const
  const violations: ImportBoundaryViolation[] = []

  for (const constraint of constraints) {
    const entry = resolve(root, constraint.entry)
    if (!existsSync(entry)) {
      violations.push({ file: entry, message: `${constraint.name} runtime entrypoint is missing` })
      continue
    }
    const reachable = runtimeReachability(entry, root, graph)
    for (const file of reachable.files) {
      const display = displayPath(root, file)
      if (constraint.forbidden(display)) {
        violations.push({
          file: entry,
          message: `${constraint.name} entrypoint reaches forbidden runtime dependency '${display}'`,
        })
      }
      if (constraint.name !== "server") {
        violations.push(...checkRuntimeGlobalReferences(root, file, program, constraint.name))
      }
      for (const line of nonliteralDynamicImportLines(file)) {
        violations.push({
          file,
          message: `line ${line}: ${constraint.name} runtime graph has a nonliteral dynamic import that cannot be checked`,
        })
      }
      for (const reference of graph.references.get(file) ?? []) {
        const forbiddenExternal =
          (constraint.name === "RPC" &&
            reference.runtime &&
            isRpcForbiddenExternal(reference.specifier)) ||
          (constraint.name === "server" && isServerForbiddenExternal(reference.specifier)) ||
          (constraint.name === "TUI" &&
            (reference.specifier === "bun"
              ? !isAllowedTuiBunImport(reference)
              : reference.runtime && isTuiForbiddenExternal(reference.specifier)))
        if (forbiddenExternal) {
          violations.push({
            file,
            message: `line ${reference.line}: ${constraint.name} runtime graph imports forbidden dependency '${reference.specifier}'`,
          })
        }
      }
    }
    for (const { file, reference, target } of reachable.unresolved) {
      violations.push({
        file,
        message:
          target === undefined
            ? `line ${reference.line}: ${constraint.name} graph has unresolved local import '${reference.specifier}'`
            : `line ${reference.line}: ${constraint.name} graph local import '${reference.specifier}' escapes the indexed source root to '${relative(root, target).split(sep).join("/")}'`,
      })
    }
  }
  return violations
}

function runtimeReachability(
  entry: string,
  root: string,
  graph: ModuleGraph,
): Readonly<{
  files: ReadonlySet<string>
  unresolved: readonly Readonly<{ file: string; reference: ImportReference; target?: string }>[]
}> {
  const files = new Set<string>()
  const unresolved: { file: string; reference: ImportReference; target?: string }[] = []
  const pending = [entry]

  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || files.has(file)) continue
    files.add(file)
    for (const reference of graph.references.get(file) ?? []) {
      if (!reference.runtime) continue
      if (!reference.specifier.startsWith(".")) continue
      const target = resolveSource(file, reference.specifier)
      if (target === null) {
        unresolved.push({ file, reference })
        continue
      }
      if (isWithin(target, root)) pending.push(target)
      else unresolved.push({ file, reference, target })
    }
  }
  return { files, unresolved }
}

function nonliteralDynamicImportLines(file: string): number[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  const lines: number[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isDynamicLoadCall(node)) {
      const argument = node.arguments[0]
      if (argument === undefined || !ts.isStringLiteralLike(argument)) {
        lines.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      (node.moduleReference.expression === undefined ||
        !ts.isStringLiteralLike(node.moduleReference.expression))
    ) {
      lines.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return lines
}

function createModuleGraph(root: string): ModuleGraph {
  const files = sourceFiles(root).sort()
  const references = new Map<string, readonly ImportReference[]>()
  const edges = new Map<string, readonly { target: string; reference: ImportReference }[]>()
  for (const file of files) {
    const fileReferences = readReferences(file)
    references.set(file, fileReferences)
    const fileEdges = fileReferences.flatMap((reference) => {
      if (!reference.specifier.startsWith(".")) return []
      const target = resolveSource(file, reference.specifier)
      return target !== null && isWithin(target, root) ? [{ target, reference }] : []
    })
    edges.set(file, fileEdges)
  }
  return { files: new Set(files), references, edges }
}

function readReferences(file: string): ImportReference[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  const references: ImportReference[] = []
  const add = (specifier: string, node: ts.Node, runtime: boolean) => {
    references.push({
      specifier,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      runtime,
      node,
    })
  }
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) {
        add(node.moduleSpecifier.text, node, importDeclarationIsRuntime(node))
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression
        if (expression !== undefined && ts.isStringLiteralLike(expression)) {
          add(expression.text, node, !node.isTypeOnly)
        }
      }
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) {
        add(node.moduleSpecifier.text, node, exportDeclarationIsRuntime(node))
      }
    } else if (ts.isCallExpression(node) && isDynamicLoadCall(node)) {
      const argument = node.arguments[0]
      if (argument !== undefined && ts.isStringLiteralLike(argument)) add(argument.text, node, true)
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
        add(argument.literal.text, node, false)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return references
}

function isDynamicLoadCall(node: ts.CallExpression): boolean {
  return (
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === "require")
  )
}

function importDeclarationIsRuntime(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause
  if (clause === undefined) return true
  // `verbatimModuleSyntax` emits even an all-type named import as an empty
  // runtime import; only the whole-clause `import type` form is erased.
  return !clause.isTypeOnly
}

function exportDeclarationIsRuntime(node: ts.ExportDeclaration): boolean {
  // Likewise, `export { type T } from` preserves a runtime module edge under
  // verbatimModuleSyntax; only `export type { T } from` is erased.
  return !node.isTypeOnly
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return sourceExtensions.has(extname(path)) &&
      !path.endsWith(".d.ts") &&
      !path.endsWith(".d.mts") &&
      !path.endsWith(".d.cts")
      ? [path]
      : []
  })
}

function resolveSource(importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null
  const compilerResolved = ts.resolveModuleName(
    specifier,
    importer,
    {
      allowImportingTsExtensions: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ESNext,
    },
    ts.sys,
  ).resolvedModule?.resolvedFileName
  if (compilerResolved !== undefined) return resolve(compilerResolved)

  const path = resolve(dirname(importer), specifier)
  const extension = extname(path)
  const substitutions: Readonly<Record<string, readonly string[]>> = {
    ".js": [".ts", ".tsx", ".js"],
    ".jsx": [".tsx", ".ts", ".jsx"],
    ".mjs": [".mts", ".mjs"],
    ".cjs": [".cts", ".cjs"],
  }
  const candidates =
    substitutions[extension] !== undefined
      ? substitutions[extension].map(
          (replacement) => `${path.slice(0, -extension.length)}${replacement}`,
        )
      : extension === ""
        ? [
            `${path}.ts`,
            `${path}.tsx`,
            `${path}.mts`,
            `${path}.cts`,
            `${path}.js`,
            `${path}.jsx`,
            `${path}.mjs`,
            `${path}.cjs`,
            resolve(path, "index.ts"),
            resolve(path, "index.tsx"),
            resolve(path, "index.mts"),
            resolve(path, "index.cts"),
            resolve(path, "index.js"),
            resolve(path, "index.jsx"),
            resolve(path, "index.mjs"),
            resolve(path, "index.cjs"),
          ]
        : [path]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function isRuntimeModule(specifier: string): boolean {
  return specifier.startsWith("bun:") || nodeBuiltins.has(specifier)
}

function isRpcForbiddenExternal(specifier: string): boolean {
  return (
    isRuntimeModule(specifier) ||
    specifier.startsWith("bun:") ||
    specifier === "bun" ||
    isTuiForbiddenIoPackage(specifier) ||
    specifier.startsWith("@opentui/") ||
    isSolidRuntimeSpecifier(specifier) ||
    specifier === "@opencode/plugin" ||
    (specifier.startsWith("@opencode/plugin/") && specifier !== "@opencode/plugin/rpc")
  )
}

function isTuiRuntimeExternal(specifier: string): boolean {
  return (
    isRuntimeModule(specifier) || specifier.startsWith("bun:") || isTuiForbiddenIoPackage(specifier)
  )
}

function isServerForbiddenExternal(specifier: string): boolean {
  return (
    specifier.startsWith("@opentui/") ||
    isSolidRuntimeSpecifier(specifier) ||
    specifier === "@opencode/plugin/tui" ||
    specifier.startsWith("@opencode/plugin/tui/")
  )
}

function isTuiForbiddenExternal(specifier: string): boolean {
  if (specifier === "@opencode/plugin") return true
  if (specifier.startsWith("@opencode/plugin/")) {
    return !(
      specifier === "@opencode/plugin/tui" ||
      specifier.startsWith("@opencode/plugin/tui/") ||
      specifier === "@opencode/plugin/rpc" ||
      specifier.startsWith("@opencode/plugin/rpc/")
    )
  }
  return isTuiRuntimeExternal(specifier)
}

function isSolidRuntimeSpecifier(specifier: string): boolean {
  return specifier === "solid-js" || specifier.startsWith("solid-js/")
}

function isAllowedTuiBunImport(reference: ImportReference): boolean {
  if (!ts.isImportDeclaration(reference.node)) return false
  const clause = reference.node.importClause
  if (clause === undefined || clause.isTypeOnly || clause.name !== undefined) return false
  const bindings = clause.namedBindings
  if (bindings === undefined || !ts.isNamedImports(bindings) || bindings.elements.length !== 1) {
    return false
  }
  const binding = bindings.elements[0]
  return (
    binding !== undefined &&
    !binding.isTypeOnly &&
    (binding.propertyName?.text ?? binding.name.text) === "stringWidth"
  )
}

function isTuiForbiddenIoPackage(specifier: string): boolean {
  return /(?:^|[/@-])(?:sqlite|better-sqlite3|sql.js|fs-extra|graceful-fs|glob|fast-glob|node-fetch|undici|axios|got|request|superagent|ky|cross-fetch|isomorphic-fetch|ws|socket\.io-client|graphql-request|cacache|cache|cache-manager|cacheable|lru-cache|keyv|node-cache|file-system-cache|filesystem-cache|flat-cache)(?:$|[/@-])/.test(
    specifier,
  )
}

function isWithin(path: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, path)
  return (
    pathFromDirectory !== "" &&
    !pathFromDirectory.startsWith(`..${sep}`) &&
    pathFromDirectory !== ".."
  )
}

function displayPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/")
}

function canonicalCycle(cycle: readonly string[]): string {
  const members = cycle.slice(0, -1)
  const rotations = members.map((_, index) => [...members.slice(index), ...members.slice(0, index)])
  return rotations.map((rotation) => rotation.join("\0")).sort()[0] ?? cycle.join("\0")
}
