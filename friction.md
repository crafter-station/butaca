# Friction log: butaca build

Skill under test: cli-build 0.2.0 (candidate). First end-to-end run.
Opened before Phase 1, per the skill.

## Entries

### Ronda 2 (2026-07-27, cli-build 0.4.0)

- [cli-build] El chequeo del banner encontró un defecto que el banner no causó.
  La skill pide verificar que `stdout` quede limpio en bare invoke, y al
  correrlo dio 810 bytes. El banner estaba bien (va a stderr, como promete el
  bloque): lo que ensuciaba stdout era el `HELP_TEXT` que el CLI ya escribía ahí
  desde la ronda 1, con exit 1. O sea un agente que pipea `butaca` sin argumentos
  recibía prosa de ayuda humana en el stream de datos, junto a un exit code de
  error. Nadie lo había mirado porque el bare invoke no es un caso que uno
  pruebe. Arreglado: bare invoke escribe la ayuda a stderr, `--help` explícito
  la deja en stdout porque ahí la ayuda es la salida pedida. Vale como
  aprendizaje general: **la verificación de un feature nuevo sirve como sonda
  sobre features viejos que comparten el stream.**
- [cli-build] El criterio de Phase 6 dice que `skills/<name>/SKILL.md` "makes the
  CLI installable with `npx skills add <owner>/<repo>`", pero ese chequeo **no se
  puede correr hasta que el repo remoto exista**. Acá el SKILL.md quedó escrito y
  bien formado y `npx skills add crafter-station/butaca --list` falla con
  "Authentication failed", que es indistinguible de un SKILL.md mal armado si uno
  no mira el mensaje. O sea el criterio de done mezcla dos cosas que fallan por
  razones distintas: el archivo existe y es válido (verificable local) contra el
  repo es alcanzable (depende de un push). Sugerencia: separar el criterio en
  "el SKILL.md existe con frontmatter válido" (local) y "instalable desde el
  remoto" (post-push), o nombrar que el segundo solo aplica una vez publicado.
- [cligentic] El bloque `banner` no compila bajo `strict` con
  `moduleResolution: nodenext` y `noUncheckedIndexedAccess`. Tres fallas, todas
  mecánicas: (1) importa `../platform/detect` sin la extensión `.js` que exige
  ESM en nodenext, (2) `const [from, to] = gradient.map(hexToRgb)` pierde el tipo
  tupla y deja ambos `possibly undefined`, (3) `GLYPHS[ch] ?? GLYPHS[" "]` sigue
  siendo `string[] | undefined` porque el fallback también es un acceso indexado.
  Ninguna es de lógica y las tres frenan el build. Los arreglos son de una línea
  cada uno (extensión explícita, dos llamadas separadas a `hexToRgb`, una
  constante `BLANK` en vez del acceso indexado como fallback). Vale reportarlo
  upstream: cualquier proyecto TS estricto que copie este bloque pega contra lo
  mismo, y el bloque se vende como "plain TypeScript you own outright", que
  sugiere que compila tal cual.
- [cli-build] La skill dice que el banner "disappears when there is no TTY or
  `NO_COLOR` is set", pero el bloque no hace eso: con `NO_COLOR` **no
  desaparece**, degrada a texto plano (nombre, versión, tagline en tres líneas a
  stderr). Verificado corriendo `NO_COLOR=1` bajo TTY. Las dos conductas son
  defendibles, pero la línea de la skill describe una y el bloque implementa la
  otra. Como la skill manda tomar el bloque justamente para no escribir esto a
  mano, la descripción debería coincidir con lo que el bloque hace.
- [cli-build] Phase 6 says "definition of done is observed behavior. Run the
  command. Show the output." That criterion works, and it caught three separate
  defects that passed both the typechecker and 54 green tests:
  1. `--fields` was applied only in human-table mode and silently ignored in
     JSON mode, which is exactly the mode an agent uses.
  2. `funciones` sorted by the already-formatted `DD/MM/YYYY` string, so a
     15-day result set opened with August sessions before today's. Tests were
     green because every fixture was same-day.
  3. The human table printed `hora` without `fecha`, so the sorted output was
     unreadable across days: five rows of `11:30` with no way to tell which was
     today.
  All three are invisible to a test suite built from same-day fixtures and
  visible in one second of reading real output. This is the strongest evidence
  in this run that Phase 6's criterion earns its place.
- [cli-build] A fourth defect surfaced *after* I had written the case file and
  declared the build done, on one last sanity run: `--fields` with a name that
  exists in the human table but not in the JSON (`--fields hora,pelicula`)
  returned eleven empty objects under `ok: true` with exit 0. A successful
  envelope containing nothing is the worst possible output for an agent. The
  existing test passed `applyFields(rows, ["a","c"])`, all valid names, so it
  could not fail regardless of how unknown fields were handled. Suggested
  addition to Phase 6, distinct from the fixture-boundary point above: "for any
  function whose failure mode is bad input, assert on the bad input. A test that
  only passes valid arguments cannot distinguish a validating implementation
  from a silently-dropping one."
- [cli-build] Related, and worth its own line because it is a naming hazard the
  skill does not mention: this CLI accepts `--fields` against two different key
  spaces, the JSON shape and the human table's column headers, and they diverge
  (`dateTime` vs `hora`). The skill introduces `--fields` in json-contract.md as
  a context-discipline flag without noting that a table renderer usually
  relabels columns, which makes the flag ambiguous the moment both modes exist.
  Either the flag validates against the mode in play (what I did) or the two key
  spaces must be kept identical. Silence on this produced the defect.
- [cli-build] Gap worth naming: nothing in the skill tells you to build fixtures
  that span the boundaries your code sorts or filters on. The corpus lesson
  "test the JSON contract per command" produced 54 tests that all used one day
  of showtimes, and the ordering bug lived underneath them. Suggested addition
  to Phase 6: "fixtures should cross at least one boundary the code orders or
  filters by (a date rollover, a month rollover, an empty set). A fixture set
  that never crosses a boundary tests the shape and not the logic."
- [cli-build] Phase 1's distribution matrix pointed cleanly at a native binary
  here (audience is non-technical, so no runtime prerequisite), and the skill
  says to run `scriptc coverage` as the gate before committing. The gate fired
  correctly and returned 91 percent, but the blocked 9 percent is
  `fetch`/`Response`/`AbortController`, which have no scriptc lowering in 0.0.15.
  So for **any CLI that talks to an HTTP API**, which is most of what these two
  skills produce together, the native target is currently unreachable no matter
  how the code is written. The skill presents the three targets as an audience
  question; for this whole class of tool it is currently a toolchain-maturity
  question. Worth a caveat in build-and-runtime.md rather than discovering it
  after choosing the target. Cost here was low only because the "write against
  Node's API surface" rule kept npm reachable without a rewrite, exactly as the
  skill promises.
- [cli-build] Phase 4's "size the friction to the damage" was the most useful
  single line in the skill for this build. The recon verdict made butaca
  read-only over public data, so the correct answer was no trust ladder, no
  audit log, no dry-run, no killswitch. Without that line the default pull is to
  add them because the reference material is rich and they look like diligence.
  The skill's own framing (a documented feature that does nothing is worse than
  no feature) is what makes leaving them out defensible rather than lazy.
