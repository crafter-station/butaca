# butaca, command surface and JSON contract

Decided before code, per cli-build Phase 2. This file is the published contract.

## Audience and distribution (Phase 1)

Audience: people in Buenos Aires who want cinema tickets. Not developers.
Target: **native binary** via `scriptc`, no runtime prerequisite.
Rule followed: written against Node's API surface (`fs`, `path`, `process`,
`fetch`) so npm and source targets stay reachable without a rewrite.

## Scope

Read-only. The recon verdict blocks the purchase half: no seat or hold endpoint
was ever observed. See `recon/report.md`. Every command here is a GET against a
public endpoint, so nothing in this CLI can cost anyone anything.

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
butaca schema [command]               operation shapes, versioned
```

Shorthand for the most common operation: `butaca <cine-slug>` is sugar for
`butaca funciones --cine <slug>`, because that is the ninety-percent case.

Global: `--json`, `--fields <a,b>`, `--no-cache`, `--help`, `--version`.

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
  `_t={epochMillis}` cache-buster by default. `--no-cache` is therefore the
  default behavior for `funciones` and a no-op flag elsewhere; documented rather
  than silent.
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
