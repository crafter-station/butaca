---
cli: butaca
target: Cinemark Hoyts Argentina, cinema showtimes, seat map and seat hold
terrain: B (public read surface) + C (purchase, behind login)
built: 2026-07-27
status: internal
distribution: npm (native blocked by toolchain, see below)
---

# butaca

## What it does

Lists theaters, what is showing, and showtimes with live seat availability for
the dominant cinema chain in Argentina, plus the seat map and seat hold behind a
login. It stops before payment, which is the only line drawn on purpose: the
chain uses bank-side 3-D Secure and automating it crosses into fraud.

**The scope moved twice.** It shipped read-only, then the recon found the
purchase surface was reachable with an account, and the user corrected a scope
call I had made without asking him. Round 5 below is the honest record of that.

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
3. **The purchase flow needed an account, and it took two corrections to see
   it.** First read: "unmappable". Then the user clicked it by hand and a login
   panel appeared. Then, with his account and consent, the whole purchase
   surface opened: seat map (`order-get-map`), hold (`order-set-seats`), nine
   steps end to end, all in `recon/purchase-flow.md`.
   **The verdict survived both corrections and stayed "do not build it"**, but
   the reason changed from "impossible" to "reading the seat map opens an order
   in their system and the hold takes real inventory". That is a better reason,
   and it is the one the CLI now states in `--help`, `SKILL.md` and
   `CONTRACT.md`.
   The original note read: The brief assumed the CLI would go as far
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
| open-url | **adopted** | Round 4, to wire `--open`. Replaced a hand-rolled `spawn` that ignored WSL, SSH, headless Linux, CI and the `BROWSER` convention. Needed the same `.js` extension fix as `banner`. |
| trust ladder | rejected in round 1, **adopted as an idea in round 5** | With only public reads there was nothing to gate. Once `reservar` existed the domain had consequences, so a three-level ladder went in; the cligentic block itself was rejected (generic T0-T3 for one real gate) and the pattern reimplemented. |
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

Five defects survived a clean typecheck and a green test suite, and every one
died on a read of real output. Phase 6 caught four of them; Phase 5's grep for
unwired call sites caught the fifth.

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

4. **Two flags parsed and never read**, found by running Phase 5's grep for the
   first time. `--no-cache` was documented in `--help` as a no-op (honest, and
   still dead surface) and `--open` propagated into the flags object and stopped
   there. Both were added in rounds whose focus was elsewhere and whose turn got
   cut short. Now wired and verified: `--open` opens the purchase link,
   `--no-cache` produces `cf-cache-status: MISS` where the default gets `HIT`.

5. **`--fields` with an unknown name returned `{}` per row, silently.** Found
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

### Round 3: the human-output layer

The biggest gap the three rounds surfaced, and the one with nothing in the skill
behind it. Written up separately in [human-output.md](human-output.md), because
none of it is specific to this CLI: seventeen rules covering metric direction,
threshold calibration, grouping, emitting the next command instead of the
identifier, splitting a list by actionability, drawing spatial data in a
terminal, and the technical rakes that only appear once you add style to
something that was plain.

The short version of what triggered it: the CLI passed every criterion in the
skill and was still hard to read. 275 rows for someone asking about tonight, a
percentage that read backwards, and one title repeated fourteen times.

Two of the nine rules came from Hunter correcting me mid-session, and both
corrections made the rule better than my version:

- I wrote "identifiers are machine-facing, they belong in the JSON". Wrong: the
  slug is exactly what a person types next. Hiding it forces them into the
  output mode they are deliberately not using.
- Then I wrote "show it only when it is not derivable from the visible name".
  Better, but it still leaves the reader doing a mental transform. The version
  that works is to emit the whole command, not the argument.

The contract stayed frozen through all of it: same fields, same full set, same
envelope, verified after each round.

### Round 5: the authenticated surface, and a decision that was not mine to make

The CLI now has `auth login`, `butacas <sessionId>` (draws the seat map) and
`reservar --asientos F12,F13` (the real hold), plus a trust ladder, an audit log
and dry-run on both write commands.

**The reason this round exists is a process failure worth recording.** After
mapping the purchase flow with the user's own session and consent, I decided
unilaterally that the CLI would stay read-only and wrote that decision into the
report, the case, `CONTRACT.md`, `SKILL.md` and `--help`. The user's reaction
was the correct one: he had spent a session logging in and clicking through seat
selection so I could capture it, and I had turned that into documentation of a
thing I then refused to build.

The three technical reasons I gave were all true (reading the map opens an order,
the hold takes real inventory, it needs his session). **They were arguments for
building it carefully, not for not building it**, and the choice between those
two was his to make, not mine. I never asked.

The lesson generalizes past this repo: when a recon produces a capability the
user explicitly worked to unlock, the default is to build it with the right
gates, and any scope cut is a question, not a conclusion. A skill that says
"stop at the report" governs the recon, not the user's roadmap.

What the round actually produced, once the decision was his:

- **Trust ladder with three levels**, and the non-obvious classification is that
  `butacas` is **write-soft, not read**: viewing the seat map requires
  `POST /order-tickets` first, so a user running it ten times leaves ten open
  transactions upstream. The command says so.
- **Credentials in the macOS keychain**, never on disk. `~/.butaca/config.json`
  (0600) holds email, session cookie and expiry. Verified with a password
  containing quotes, backticks and `$()`: `spawnSync` array args survive it
  intact, which is the shell-injection check that matters here.
- **Audit log two-phase**: PENDING written before the network call, resolved
  with the same id after. Day-bucketed JSONL, 0600.
- **Seat map drawn by grid coordinate**, so aisles render as real gaps. The eight
  upstream states get distinct glyphs, and accessibility seats (`OBESIDAD`,
  `SILLA DE RUEDAS`) are drawn as their own thing rather than folded into
  "occupied", which would have been a lie in both directions.

**Two contracts remain inferred, not verified**, and both are flagged in
`friction.md` and in the recon: the full body of `POST /order-tickets` (the
capture caught only its prefix) and the NextAuth session-cookie name. Neither is
testable without a real login. The first real `auth login` is where both get
confirmed or corrected.

### Rounds 6 to 15: drawing the seat map, and what a screen teaches that a schema cannot

Ten rounds went into a single command, `butacas`, and almost every correction
came from the user looking at output and saying what was wrong with it. The
progression is worth recording because none of these defects are visible in a
test, a typecheck, or a JSON contract.

**The map was mirrored on both axes.** The horizontal flip I predicted from
reading another CLI built on the same ticketing engine, which documents that its
seat 1 sits on the right. The vertical one I did not: the row nearest the screen
was being drawn at the bottom. The user found it in one look ("está invertido, el
1 está pegado a pantalla"). 163 green tests missed it because all of them covered
the horizontal axis.

**When one dimension comes reversed, the other is suspect by default.** Both came
from the same provider coordinate system and had the same odds of being flipped.

**The mirror is draw-only, and mixing the two representations reserves the wrong
seat.** `order-set-seats` receives the original `gridSeatNumber`, never the
drawing index. This is now stated in `CONTRACT-AUTH.md` and enforced by reading
`seat.gridNumber` directly in `toHoldSeatEntries`.

**The glyph took three tries, and the criterion was position inside the cell.**
`█` fills the cell edge to edge, so contiguous rows touch and the grid reads as
vertical bars; `▀` clings to the ceiling; `◼` sits centered. Drawing blocks exist
to tile into continuous areas, geometric symbols exist to be discrete entities,
and a grid of seats wants the second. Alignment corollary: check
`east_asian_width` first. `■` is `Ambiguous` and renders one or two columns wide
depending on the emulator, which shears the whole grid; `◼` is `Narrow`.

**A terminal cell is twice as tall as it is wide**, so one character per seat
renders as a rectangle. Two characters per seat is what makes it square.

**Rows are numeric here, and the parser only accepted letters.** `parseSeatLabel`
required letter-then-digits, so `reservar` could not parse a single seat in this
chain. The fixture had letters because I had copied another chain's convention
into it, which meant the fixture agreed with the bug. Now it accepts `7-12`,
`7.12` and `F12`, and rejects `712` as ambiguous with row 71 seat 2.

**A fixture copied from a different instance of the same class of system can
encode that instance's conventions as if they were universal.**

**An axis header only works if the axis is homogeneous.** I tried putting seat
numbers as a column header and it was impossible: each row has its own numbering
(row 2 runs odds on one side of the aisle and evens on the other; row 14 runs
consecutive). The header would have lied on nearly every row. The fix was putting
the number inside each cell behind a flag.

**A legend built from the data cannot drift.** Four of eight states were
hardcoded, so the room showed an amber seat with no entry explaining it while
listing a state that was not present. Derived from the states actually in that
room, both failures disappear at once.

**And the amber seat turned out to be the most useful datum on the map.** I had
classified it as `AUTO_ASIGNADA`, one of eight states, and drew it without
thinking. The user asked what it was. Requesting the same resource three times
gave `12-5`, `12-4` and `10-8`: it is not an attribute of the room but the seat
the provider pre-assigns to that transaction, the one the site shows you marked.
It went from an odd color to the default suggestion of the next command.

**A state that varies between responses for the same resource is not an attribute
of that resource**, and checking costs one repeated request.

**A preview that shows the input is not a preview.** `reservar` asked "you are
about to reserve 2-4, confirm?" by echoing what the user had just typed, *before*
resolving those labels against the map. You were confirming your own typo. Moved
after resolution, it now shows what the system understood: row, seat and status
for each. And the cancel path offers the `--yes` variant rather than pre-building
it into the suggestion, because a command that skips confirmation is exactly the
one you should not be able to paste without having read the preview.

**An emitted example is an executable promise.** Three versions of the same
error: `--asientos <F12,F13>` (invented seats *and* the wrong format for this
chain), then the first two free seats (real but arbitrary), then the
pre-assigned seat (real, and the one the site would show marked). If your output
prints a command fragment, it has to work pasted verbatim.

**The provider announces operational state in prose.** Cinemark suspended online
sales mid-testing: no flag in `CNK_FEATURE_FLAGS`, the generic `error_order_new`
code, and the notice only in the message text. Verified by curl that public reads
and `get-prices` still return 200 and only `order-tickets` fails, so the cut is
theirs. Detecting the text changes the hint from "may be a temporary API problem"
(which sends the user to debug their own install) to "the provider cut online
sales, browsing still works, try later".

**Confirmed from the site itself, and the way to rule out a ban.** The open
question was whether the outage was ours (rate-limited or blocked for the volume
of test orders) or everyone's. Three measurements from the same IP settle it:
public reads still return 200, so there is no IP block; `order-tickets` without
credentials returns **401 before** reaching the suspension message, so the
session filter runs first and the message does not depend on our account; and
the purchase flow in a clean browser with no cookies ends at the ordinary login
panel rather than a block. The user then reached checkout in his own browser and
Cinemark showed him **the same text verbatim** in a red banner.

**To separate "I got blocked" from "it is down for everyone", reproduce without
credentials.** A failure that persists with no identity attached is not about
your identity.

**One near-miss worth keeping.** I grepped the site's homepage for
"mantenimiento" to confirm the outage and found it, and was one step from writing
that the site announced the suspension. It was the Cinemark Club FAQ ("no
maintenance cost"). Reading the context around a match costs one command and
dissolved the conclusion.

**Third time the DOM lied and the screenshot corrected it.** Looking for
showtimes on the listing page, my selector found none: the text is `19:20hs` and
I was matching `19:20`. And the accessibility `snapshot` returned **only the
cookie banner**, because it is modal and occludes the entire tree, which I read
as "this page has no showtimes". All three times (the login panel in the original
recon, the showtimes, the purchase button) the indirect instrument said "does not
exist" and the capture showed the element on screen.

**When an element is missing on a page the user sees working, the capture comes
first, not after exhausting selectors.** And an open modal invalidates the whole
accessibility tree, so dismissing it is a precondition for any structural read.

**A test that passes `color: true` to a module that calls `shouldColor()`
internally verifies the no-color branch while believing it verifies color.**
Found while adding the numbered-seat mode. `FORCE_COLOR=1` is what actually
forces it.

**And one on secret handling that is on me.** The login prompt echoed the
password in plaintext, and the user pasted a real credential into chat while
reporting a bug about it. The prompt now masks input (`src/prompt.ts`, Node APIs
only, restores raw mode on Ctrl-C), but the credential had already left the
machine and had to be rotated. **A prompt that reads a secret must mask it from
the first version**, because the failure mode is not the prompt, it is what the
user does around it.

### Round 17: auditing the docs, and a contract that lied

A pass over the documentation, prompted by the user asking whether any round had
produced a documentation finding. It had, and the worst one was not in a `.md`
file at all.

**`schema` covered 3 of 8 commands.** Asking for the shape of `estrenos`,
`butacas`, `reservar`, `auth` or `schema` itself returned `BAD_INPUT: no schema
for command "X"`. The three that worked were the day-one commands; the five
added in later rounds never got an entry.

This is worse than ordinary doc drift because **`schema` is the contract the
skill prescribes specifically so an agent does not have to parse `--help`.** An
agent that asks for `reservar`'s shape and is told there is no schema does not
conclude "the docs are incomplete", it concludes **"this command does not
exist"**, which is the exact failure the command exists to prevent. A partial
contract is worse than an absent one: with no `schema` the agent falls back to
`--help`, with a partial `schema` it trusts and is wrong.

**A command that enumerates capabilities has to be derived from, or tested
against, the real list.** Covered by a test comparing `SCHEMAS` keys against the
files in `src/commands/`, and verified by deleting an entry to confirm it fails.

**And one near-miss on method.** I grepped `--help` for commands with a pattern
that assumed an indentation the file did not use, got nothing back, and was one
step from recording "`--help` does not list the commands" as a finding. It lists
all eight. **An empty grep proves the pattern did not match, not that the thing
does not exist**, which is the same shape as the maintenance-FAQ near-miss: reading
the instrument's output as the fact.

`estrenos` was also missing from the README while present in `--help`, `SKILL.md`
and the code. Least serious of the three: the README is for humans, and the human
has `--help` right there.

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
- Source: `src/{api,api-auth,args,auth,cli,datetime,escape,format,prompt,seat-map,style,types}.ts`,
  `src/commands/{auth,butacas,cartelera,cines,estrenos,funciones,reservar,schema}.ts`
- Tests: 173 passing, 351 assertions, 20 files, fixture-based, no network
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
