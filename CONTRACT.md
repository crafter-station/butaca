# butaca, command surface and JSON contract

Decided before code, per cli-build Phase 2. This file is the published contract.

## Audience and distribution (Phase 1)

Audience: people in Buenos Aires who want cinema tickets. Not developers.
Target: **npm with a Node shebang**. The native binary via `scriptc` was the
first choice by audience, and its own coverage gate blocked it: `fetch` and
`AbortController` have no lowering yet. See the case for the measurement.
Rule followed: written against Node's API surface (`fs`, `path`, `process`,
`fetch`) so npm and source targets stay reachable without a rewrite.

## Scope

**This file covers the anonymous surface only.** The authenticated half (`auth`,
`butacas`, `reservar`) has its own contract in
[CONTRACT-AUTH.md](CONTRACT-AUTH.md), with its own trust ladder, because it
writes to a third party's system and takes real inventory.

Everything below is read-only: every command is a GET against a public endpoint,
so nothing here can cost anyone anything.

The target's second surface **is now built**, under `CONTRACT-AUTH.md`. The three
properties that kept it out of this file are exactly why it lives in its own
contract with its own gates:

- Reading the seat map requires opening an order first, so `butacas` writes a
  transaction into their system on every call. It is classified write-soft, not
  read.
- The hold takes real inventory away from other buyers, so `reservar` is
  write-hard: confirmation, audit log, and a dry-run that exercises the real
  path.
- Both need the user's own account session, kept in the system keychain.

That split is what keeps the Phase 4 story honest in both directions: the
commands in this file genuinely need no trust ladder, and the ones that hold
seats genuinely need every gate.

Per cli-build Phase 4, safety is sized to the damage: a read-only CLI over a
public dataset earns `--json` and a `schema` command and stops there. **No trust
ladder, no audit log, no dry-run, no killswitch.** Adding them would be
decoration, and the skill names decoration as worse than absence.

## Commands

Noun-verb throughout.

```
butaca cines                          list theaters
butaca cartelera [--cine <slug>]      what is showing
butaca funciones --cine <slug>        showtimes with live seat availability
                 [--peli <slug>]
                 [--fecha YYYY-MM-DD]
                 [--formato 2D|3D|XD|DBOX|4D|PREMIER]
                 [--idioma SUB|CASTELLANO]
                 [--libres <n>]       only sessions with >= n seats free
butaca estrenos [--cine <slug>]       presale and upcoming releases
                [--todos]
butaca estrenos <search>              one release, with its sales
butaca schema [command]               operation shapes, versioned
```

Shorthand for the most common operation: `butaca <cine-slug>` is sugar for
`butaca funciones --cine <slug>`, because that is the ninety-percent case.

Global: `--json`, `--fields <a,b>`, `--no-cache`, `--open`, `--help`,
`--version`.

## Output mode

```ts
const machineMode = flags.json || !process.stdout.isTTY;
```

Resolved once, centrally. JSON when piped even without the flag.

## Envelope

Every command, success:

```json
{ "ok": true, "data": [], "meta": { "source": "bff.cinemark.com.ar", "fetchedAt": "...", "cached": false } }
```

Every command, failure:

```json
{ "ok": false, "error": { "code": "UPSTREAM_ERROR", "message": "...", "hint": "..." } }
```

Error codes: `UPSTREAM_ERROR`, `NOT_FOUND`, `BAD_INPUT`, `NETWORK_ERROR`,
`RATE_LIMITED`, `QUEUED` (Cloudflare Waiting Room).

Exit codes: `0` success, `1` user error (`BAD_INPUT`, `NOT_FOUND`), `2` system
failure (`UPSTREAM_ERROR`, `NETWORK_ERROR`, `QUEUED`).

## Data shapes

`cines` → `{ id, slug, name, address, city, region, lat, lng }`

`cartelera` → `{ id, corporateId, slug, title, runTime, rating, formats[], premiere }`

`funciones` → `{ sessionId, movie: {corporateId, name}, theater: {id, room},
dateTime, displayDate, format, language, seats: {available, capacity, pct} }`

**`seats.pct` is derived here, not taken from upstream.** The recon observed
`occupation.status` returning `HIGH` for all 275 sessions including one at 98
percent full, so the upstream field is not trustworthy. We compute
`available / capacity` and label it ourselves.

## Upstream notes that shape the code

- One required header: `country: AR`. Value is not validated upstream, but we
  send `AR` because that is what the site sends.
- Responses carry `cache-control: max-age=60` at Cloudflare's edge. For seat
  counts that staleness matters, so `funciones` appends the site's own
  `_t={epochMillis}` cache-buster by default, so `--no-cache` is already the
  behavior there. On every other endpoint the flag adds the buster: verified as
  `cf-cache-status: HIT` without it and `MISS` with it.
- `sessionDateTime` ends in `Z` but is local Buenos Aires time. Parsed as local,
  never as UTC. This is the single easiest way to ship a three-hour bug.
- `theater` accepts a comma-separated list.
- Movie cross-reference uses `corporateId`, not `id`.

## nextSteps

Included in `meta.nextSteps` where a next command exists, so an agent does not
have to infer it:

```json
"nextSteps": ["butaca funciones --cine palermo --peli toy-story-5"]
```

## Untrusted text

Movie titles and theater names are third-party free text. Escaped before
emitting, never interpolated anywhere it could read as an instruction.
