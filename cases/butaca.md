---
cli: butaca
target: Cinemark Hoyts Argentina, cinema showtimes and seat availability
terrain: B
built: 2026-07-27
status: internal
distribution: npm (native blocked by toolchain, see below)
---

# butaca

## What it does

Lists theaters, what is showing, and showtimes with live seat availability for
the dominant cinema chain in Argentina. Read-only. It cannot buy a ticket, and
that limit is a recon finding rather than a scope preference.

## Recon

Report: `recon/report.md`. Friction: `recon/friction.md`.

**Terrain B was the right classification and was confirmed rather than assumed.**
A Next.js SPA reading from a public BFF at `bff.cinemark.com.ar`.

Three things the recon caught that a build-first approach would have paid for:

1. **The target as briefed redirects.** `cinemarkhoyts.com.ar` 301s to
   `cinemark.com.ar`. Caught in Phase 1 by following redirects on the origin,
   before any browser work.
2. **Auth is one unvalidated header.** Every endpoint needs `country: AR` and
   nothing else. No cookie, no token, no Origin, no User-Agent. The value is not
   checked: `XX` returns identical Argentine data. Found by reading the error
   body of a failed replay (`"Country undefined not implemented"`), not by
   diffing headers.
3. **The purchase flow is unmappable, not merely un-automatable.** This is the
   finding that changed the project. The brief assumed the CLI would go as far
   as holding seats and hand off a checkout URL, with payment deliberately left
   out. Recon could not observe a single purchase request: four HAR captures,
   headed and headless, with the consent banner and floating ad removed, native
   clicks and JS clicks, all produced no navigation, no dialog, and nothing on
   `history.pushState` or `window.open` hooks. All 42 chunks of the
   `/compra-entradas` route were downloaded and searched; the only
   purchase-adjacent paths are two payment callbacks. What the click *does* do is
   emit conversion beacons to three ad networks, including a Google Ads
   `bttype=purchase`.

So the honest position was "the hold step is unmapped", not "unimplemented". The
verdict was **build it narrowly, read half only**, and the user chose that path
over waiting for a manual checkout capture.

**The scope cut in the brief was drawn one step too optimistically.** That is the
recon earning its cost: the wrong version of this project ships a `hold` command
built against a guessed endpoint.

## Distribution choice

Audience: people in Buenos Aires who want cinema tickets. Not developers. Phase
1's matrix points that straight at a native binary, no runtime prerequisite.

**The gate blocked it, and the gate was right to run.** `scriptc coverage
src/cli.ts` reported 91 percent statically compilable. The blocked remainder is
`fetch`, `Response`, and `AbortController`, which have no lowering in scriptc
0.0.15. Since the code is plain Node `fetch` per the skill's own rule, no rewrite
would change this.

Shipped target is npm with `#!/usr/bin/env node`, `engines.node >=20`. The
"write against Node's API surface" rule did exactly what it promises: the native
target reopens with a scriptc release, not a rewrite.

**Round 2 correction: the case claimed that target before the code delivered
it.** The prose above was written in round 1 and was accurate about the decision
and wrong about the artifact. `package.json` still carried
`"bin": {"butaca": "./src/cli.ts"}` and a `build` script pointing at the blocked
scriptc path, so an install would have handed a `.ts` file to `node` and failed.
Now built with `bun build --target node --outfile dist/cli.js` (12 modules,
27.35 KB, zero runtime dependencies), `bin` points at `dist/cli.js`,
`prepublishOnly` runs the build, and `files` ships `dist`, `skills`, `README.md`,
and `CONTRACT.md`. Verified two ways: the artifact runs under plain `node`
(`node dist/cli.js cines --json` returns live data), and `npm pack --dry-run`
lists four files totalling 10.9 KB packed.

The lesson is narrower than "verify the build": **a case can record a decision
correctly and still describe an artifact that does not exist.** Round 1 verified
the CLI by running `bun run src/cli.ts`, which is exactly the invocation that
cannot see a broken `bin`. That is the gap the new Phase 6 closes by requiring a
global link.

**This contradicts the skill's framing.** `build-and-runtime.md` presents the
three targets as an audience question. For any CLI that talks to an HTTP API,
which is most of what `surface-recon` plus `cli-build` produce together, the
native target is currently gated by toolchain maturity regardless of audience.
The matrix should carry that caveat, since the audience answer here was
unambiguous and still not actionable.

## Blocks adopted

Two blocks adopted (`banner`, plus `detect` as its dependency), the rest
rejected. The safety blocks share one reason: the CLI is read-only over public
data, so there is nothing to gate, nothing to undo, and no receipt worth writing.

| Block | Decision | Reason |
|---|---|---|
| banner | **adopted** | Added in round 2 under cli-build 0.4.0, which requires a banner on bare invoke and `--help`. Taken as a block rather than written by hand for one reason: it writes to stderr, so a piped run stays clean. Needed three mechanical fixes to compile under `strict` plus `nodenext`, see below. |
| detect | **adopted** | Dependency of `banner`, supplies `shouldColor()` for the `NO_COLOR` and non-TTY fallback. |
| trust ladder | rejected | Read-only over public data. Nothing to gate. |
| killswitch | rejected | No mutation exists to stop. |
| audit log | rejected | Nothing worth a receipt; no writes, no money, no third-party effects. |
| dry-run | rejected | Every command is already a safe read. |
| JSON mode | hybrid, reimplemented | Adopted the pattern (`flags.json \|\| !process.stdout.isTTY`, resolved once centrally), wrote the code, because the envelope in `CONTRACT.md` is the published contract and outranks a shared shape. |
| atomic write | rejected | Writes no files. |
| XDG paths / config / session | rejected | No credentials, no state to persist. |
| error map | hybrid, reimplemented | Same reason as JSON mode: contract-defined codes. |
| doctor | rejected | One header and one host. `--help` covers it. |

Phase 4's "size the friction to the damage" is what makes this defensible rather
than lazy. The reference material is rich enough that the default pull is to
adopt blocks because they look like diligence, and the skill's own line about a
documented feature that does nothing being worse than no feature is the
counterweight.

## What broke

Four defects survived a clean typecheck and a green test suite, and every one
died on a read of real output. Phase 6's "definition of done is observed
behavior" caught all four.

1. **`--fields` ignored in JSON mode.** Applied only in the human-table branch,
   so the flag worked for humans and was silently dropped for agents: exactly
   inverted. Fix: move `applyFields` before the `machineMode` branch in
   `cines.ts`, `cartelera.ts`, `funciones.ts`.
2. **Sessions sorted by formatted date string.** `.sort()` ran on `dateTime`
   (`DD/MM/YYYY`), so across a 15-day window `01/08` sorted before `27/07` and
   `butaca funciones --cine palermo` opened with next month's showings. Fix:
   `sortKey()` sorting on `displayDate` (ISO) plus the time. Regression test in
   `tests/funciones.test.ts` covering the July/August case.
3. **Human table showed `hora` without `fecha`.** Correct ordering, unreadable
   output: five rows of `11:30` with no way to tell today from next Thursday.
   Fix: `fecha` column added.

4. **`--fields` with an unknown name returned `{}` per row, silently.** Found
   after declaring the build done, while running one last sanity check with the
   column names printed by the human table (`--fields hora,pelicula`). Those are
   valid table headers and invalid JSON keys, since the JSON carries `dateTime`
   and `movie`. Output was eleven empty objects, `ok: true`, exit 0. Worst
   possible shape for an agent: a successful envelope containing nothing. Fix:
   `applyFields` now throws `BAD_INPUT` naming the unknown field and listing the
   available ones. Three regression tests, including the zero-rows case.

**Defects 2 and 3 were invisible because every fixture was same-day.** The tests
verified shape correctly and could not see logic that only misbehaves across a
boundary.

**Defect 4 is the sharper lesson.** A test asserting `applyFields(rows, ["a",
"c"])` picks two of three fields passes whether unknown fields throw or vanish,
because it never passes an unknown field. The suite tested the happy path of a
function whose entire failure mode is the unhappy path. The bug was not a
missing test so much as a test that could not fail.

The timezone trap the recon flagged (`sessionDateTime` ends in `Z` but is local
Buenos Aires time) did *not* break, because it was written into `CONTRACT.md`
before any code existed. Verified against raw upstream: `2026-07-27T11:30:00.000Z`
renders as `11:30`, not `08:30`.

### Round 2, under cli-build 0.4.0

A fifth defect, found by a check aimed at something else. The skill's banner
requirement comes with a verification (`stdout` must stay empty on bare invoke),
and running it returned 810 bytes. The banner was innocent: it writes to stderr
exactly as the block promises. The 810 bytes were `HELP_TEXT`, which round 1 had
been writing to **stdout** on bare invoke, alongside exit code 1.

So an agent that piped `butaca` with no arguments received human help prose on
the data stream together with an error exit. Nobody had looked because a bare
invoke is not a case anyone thinks to test. Fixed by splitting the two: bare
invoke writes help to stderr and exits 1, explicit `--help` keeps stdout because
there the help *is* the requested output.

**The generalizable part: verifying a new feature doubles as a probe on old
features that share its stream.** The banner check found a defect that predated
the banner by a full round.

The three cligentic fixes, all mechanical, none logic:

| Symptom | Cause |
|---|---|
| `TS2835` on the `detect` import | Block imports `../platform/detect` without the `.js` extension ESM requires under `nodenext`. |
| `from`/`to` possibly undefined | `const [from, to] = gradient.map(hexToRgb)` loses the tuple type. Split into two calls. |
| `glyph` possibly undefined | `GLYPHS[ch] ?? GLYPHS[" "]` is still an indexed access under `noUncheckedIndexedAccess`. Replaced the fallback with a `BLANK` constant. |

Worth reporting upstream: the block is described as plain TypeScript you own
after copying, which reads as compiling unchanged, and it does not under strict
plus nodenext.

## What I would do differently

**Build fixtures that cross the boundaries the code sorts and filters on.** One
date rollover in the fixture file kills defects 2 and 3 before a human ever looks
at output. This is the single highest-value change and it belongs in the skill,
not just in this project: `cli-build` says to test the JSON contract per command,
which produced 54 tests that all shared one day and hid an ordering bug
underneath them.

**Stop assembling URLs from bundle strings.** Four attempts were burned building
checkout routes out of grepped constants, each returning a 404 page served under
HTTP 200. `surface-recon` warns about driving the real action, but a sentence in
Phase 2 did not stop me; a gate worded as a prohibition would have.

**Read the error body before diffing headers.** The 500 named the missing header
outright. The playbook's advice is to diff against the HAR, which works and is
slower.

## Evidence

- Repo: `/Users/raillyhugo/Programming/crafter-station/butaca`
- Source: `src/{api,args,cli,datetime,escape,format,types}.ts`,
  `src/commands/{cines,cartelera,funciones,schema}.ts`
- Tests: 59 passing, 145 assertions, 7 files, fixture-based, no network
- Typecheck: clean, strict, no `any`
- Live verification: `butaca cines` (24 theaters), `butaca funciones --cine
  palermo` (275 sessions, 2026-07-27 through 2026-08-29, chronological),
  `--libres 245`, `--formato 3D`, bad slug -> `NOT_FOUND` exit 1, missing
  `--cine` -> `BAD_INPUT` exit 1
- No audit log: deliberate, see the rejection table
- HARs from recon deleted after use; they carried live session cookies

Round 2 additions:

- Agent manual: `skills/butaca/SKILL.md`, written from `src/` and
  `butaca schema --json` rather than from memory
- Distribution: `bun build --target node`, 12 modules, 27.35 KB, zero runtime
  dependencies. `npm pack --dry-run` lists 4 files, 10.9 KB packed
- Ran under plain `node` (not just bun): `node dist/cli.js cines --json` returned
  live theater data
- Linked globally and run by name from outside the repo: `which butaca` resolves
  to `~/.bun/bin/butaca`; `butaca cines --json | jq '.data[0]'` returned Abasto
- Banner: gradient block under TTY, plain text under `NO_COLOR=1`, and
  `butaca 2>/dev/null | wc -c` returns 0 on bare invoke
