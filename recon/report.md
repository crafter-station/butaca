---
type: surface-recon
target: https://www.cinemark.com.ar (Cinemark Hoyts Argentina)
created: 2026-07-27
terrain: B (read surface) + C (purchase surface, behind login)
auth: none for the read surface, one unvalidated header; account session for purchase
official-api: no
confidence: high on both surfaces, each driven end to end
---

# Cinemark Argentina, Recon

## What it is

Cinemark Hoyts is the dominant cinema chain in Argentina, 24 theaters. The site
is a Next.js SPA behind Cloudflare that reads from a public BFF at
`bff.cinemark.com.ar`. It exposes **two surfaces**: an anonymous read surface
(theaters, movies, showtimes, live occupancy) and a purchase surface behind an
account login. Both are mapped; the verdict recommends building only the first,
and the reason is not feasibility.

## Official surface

**None found.** Searched: `Cinemark Argentina API documentation`,
`cinemark.com.ar developer docs`, `Cinemark OpenAPI`, `Cinemark SDK`, npm
registry for `cinemark` and `cinemarkhoyts`.

Probed directly on the resolved origin, all 404 after following redirects:
`/openapi.json`, `/swagger.json`, `/.well-known/openapi.json`, `/api/schema`,
`/llms.txt`.

`robots.txt` returns 200 and is permissive: `User-Agent: * / Allow: /`, with no
`Crawl-delay` and no disallowed paths. Two sitemaps are declared.

Community wrappers exist on GitHub (`lndgalante/cinemark-api-wrapper`,
`tafarelyan/cinemark-python`) but their source was not reachable at the paths
tried, so nothing in this report derives from them.

**The target as briefed redirects.** `cinemarkhoyts.com.ar` 301s to
`cinemark.com.ar`. Everything below was mapped on the resolved origin.

## Authentication

**Every endpoint in the table below requires no authentication at all.** No
cookie, no bearer token, no API key, no `Origin`, no `Referer`, no `User-Agent`.

The one requirement is a single header:

```
country: AR
```

Omitting it returns HTTP 500 with
`{"code":"INTERNAL_ERROR","message":"Country undefined not implemented"}`.

**The value is not validated.** Observed: `AR`, `CL`, `PE`, `BR`, `US`, and the
nonsense value `XX` all return byte-identical Argentine data (24,616 bytes). It
is a presence check, not a routing key. An implementer should send `country: AR`
because that is what the site sends, but should not expect the value to select a
region, and should not assume the same host serves other Cinemark countries.

Account features use NextAuth with a credentials provider
(`/api/auth/providers` observed). `GET /api/auth/session` returns `{}` when
signed out. **The signed-in flow was not exercised**: no account was used, so
everything about authenticated behavior is unverified.

## Endpoints

Base: `https://bff.cinemark.com.ar/api`. All GET, all `country: AR`, all
observed in captured traffic and independently replayed outside the browser with
`curl` unless noted.

| Method | Path | Purpose | Auth | Verified |
|---|---|---|---|---|
| GET | `/cinema/theaters?limit={n}` | All 24 theaters: id, name, slug, address, city, lat/long, region | none | observed + replayed |
| GET | `/cinema/movies` | Movies now showing, chain-wide | none | observed + replayed |
| GET | `/cinema/movies?theater={id}` | Movies at one theater | none | observed + replayed |
| GET | `/cinema/movies/slug/{slug}` | One movie by slug | none | replayed (path from bundle) |
| GET | `/cinema/showtimes?theater={id}` | Every session at a theater, with seat availability | none | observed + replayed |
| GET | `/cinema/showtimes?movieCorporateId={cid}&theater={ids}` | Sessions filtered by movie; `theater` accepts a comma-separated list | none | observed + replayed |
| GET | `/cinema/formats` | Format catalogue (2D, 3D, XD, D-BOX, 4D, PREMIER) | none | observed + replayed |
| GET | `/cinema/locations` | Region/city catalogue, 162 KB | none | replayed (path from bundle) |
| GET | `/content/banners?loyaltyTierId={n}&variant={v}` | Marketing banners | none | observed + replayed |
| GET | `/content/in-app-notifications/page/{page}` | In-app notices; returned 13 bytes (empty) | none | observed + replayed |
| GET | `https://www.cinemark.com.ar/api/auth/session` | NextAuth session; `{}` signed out | cookie | observed |
| GET | `https://www.cinemark.com.ar/api/auth/providers` | Lists the credentials provider | none | replayed |

### The payload that matters

`/cinema/showtimes?theater=733` returned 275 sessions in one call (174 KB). Each
carries:

```json
{
  "movieId": "HO00012548",
  "movieName": "LA ODISEA",
  "corporateId": "110137",
  "language": { "id": "...", "name": "SUBTITULADA", "shortName": "SUB" },
  "formats": [ { "id": "3", "name": "2D", "shortName": "2D" } ],
  "theaterId": "733",
  "theaterRoom": "4",
  "sessionId": "161235",
  "sessionFormat": "2D",
  "sessionDateTime": "2026-07-27T11:30:00.000Z",
  "sessionDisplayDate": "2026-07-27",
  "isLateNightSession": false,
  "occupation": { "availableSeats": 247, "capacity": 250, "status": "HIGH" },
  "premiere": true
}
```

**`occupation` is the interesting field and it is free.** Live seat counts per
session, unauthenticated, one call per theater. That is enough to answer "which
showing still has room" and "how fast is this selling" without ever touching the
purchase flow.

Caveat on `occupation.status`: every one of the 275 sessions returned `HIGH`,
including sessions at 100 percent availability and one at 221/226. The other
values in the site legend (Media, Baja, Completa) were never observed, so the
thresholds are unknown. `availableSeats` and `capacity` are trustworthy because
they are raw numbers. **Do not build on `status` without deriving it yourself
from the ratio.**

## Blockers

**Cloudflare Waiting Room is armed.** The first response sets a
`__cfwaitingroom` cookie. It admitted every request during this recon, so the
queue was not active, but it exists and will engage on a high-demand release.
Any client must handle being queued.

**The purchase flow could not be entered from the anonymous surface.** This was
read at the time as the central finding, and it was wrong: the flow opens a login
panel, which none of the attempts below detected because none of them looked at
the screen. See the Correction section below. What was tried, all of it failing:

- Clicking a showtime on the theater listing page: native click via
  agent-browser ref, JS `.click()`, and `.click()` after `scrollIntoView`.
- The same three, on the movie detail page, with the theater correctly selected
  and the button in its enabled state.
- The same, in a **headed** browser, so this is not a headless block.
- The same, with the cookie-consent banner and the floating ad both removed.

In every case the URL did not change, no tab opened, no dialog or drawer
appeared in the DOM, and `history.pushState` / `window.open` hooks recorded
nothing.

**What the click does do is emit purchase telemetry.** The HAR shows a
DoubleClick beacon with `type=carrito` and a Google Ads conversion with
`bttype=purchase` firing on the click, and a Twitter `adsct` event carrying
`"value":"Palermo SELECCIONAR"`. So the handler runs. It reports the intent to
three ad networks and then does not navigate.

**No purchase endpoint appears in any bundle read from the anonymous surface.**
(With a session, the endpoints do exist and are listed in the Correction section.
They are not in these bundles because the purchase code loads on demand.) The listing page
bundle exposes exactly seven paths, all reads: `cinema/formats`, `locations`,
`movie/`, `movies`, `movies/slug/`, `showtimes`, `theaters`. All 42 chunks of
the `/compra-entradas` route were downloaded and searched: the only
purchase-adjacent paths are `/checkout/modocallback`,
`/checkout/paymentstatuscallback`, `/supersavers/cancel-order` and
`/supersavers/order-details`. Every other hit (`bookingId`, `orderId`,
`order_page.*`) is a translation key or a CSS class, not an endpoint.

**Guessed routes return a 404 page under HTTP 200.** `/compra-entradas`,
`/pelicula/{slug}`, `/entradas` and `/butacas` all return HTTP 200 while
rendering "UPS! ESTA PÁGINA NO EXISTE." Route existence cannot be tested with a
status code on this site. `/pelicula/toy-story-5/compra-entradas/{sessionId}`,
assembled from the bundle's own URL builder, rendered the same 404 page.

**A separate legacy ticketing host exists**: `tickets.cinemarkhoyts.com.ar`
redirects to `tickets.cinemark.com.ar/NSCineSales/`, a Vue plus jQuery app with
`nsLogin.js`, `nsPayment.js`, and an embedded MODO wallet bundle
(`ecommerce-modal.modo.com.ar`). The URL reached from the config blob serves a
promotional pricing page, not a seat picker. **Whether the live purchase flow
runs on this host is unverified**, and it is the single highest-value thing to
resolve next.

**Rate limiting: measured, none observed.** 25 sequential requests with no
delay, 25 HTTP 200s, zero 429s. No `RateLimit-*` or `Retry-After` headers on any
response. Responses carry `cache-control: public, max-age=60` and
`cf-cache-status: HIT`, so repeat reads are served by Cloudflare's edge and may
be up to 60 seconds stale. That staleness matters for seat counts.

## Gotchas

**The public config ships in a cookie on the first response.** `CNK_PUBLIC_ENVS`
is lz-string compressed and holds 75 keys, including three API base URLs
(`CLIENT_BFF_BASE_URL`, `LOCAL_BFF_BASE_URL`, and an internal Kubernetes service
name `ar-bff-api.ar-www-frontend.svc.cluster.local`), a
`SALES_CHANNEL_TOKEN_TICKET_CANDY`, and the full feature-flag set. Reading it
skips most of the bundle work. Decode with
`lz-string.decompressFromEncodedURIComponent` **after** a `decodeURIComponent`
pass, since the cookie is percent-encoded on top of the lz encoding. Applying
the codec to the raw value returns short mojibake that looks like a wrong-codec
result.

`CNK_FEATURE_FLAGS` ships uncompressed next to it and names flags worth knowing:
`BuyAsGuest: "false"`, `SpecialSeats: "true"`, `CustomSeats: "true"`,
`TicketPurchaseReturn: "true"`. **`BuyAsGuest: false` is the load-bearing one**:
buying appears to require an account.

**Theater 733 is Palermo.** It also appears as `REGALA_CINE_DEFAULT_CINEMA_ID`
in the config, which is a coincidence of defaults, not a meaning.

**Two different movie identifiers.** `/cinema/movies` returns `id` (a UUID) and
`corporateId` (`"109144"`). The showtimes filter takes `movieCorporateId`, not
`id`, and the corporateId is also what appears as `movieId` on a session
(`"HO00012548"` is a third form). Use `corporateId` to cross-reference.

**`theater` accepts a comma-separated list** in the showtimes filter
(`theater=733,103,734,2016,730`), which the single-theater form does not suggest.
One call can cover several theaters.

**`limit=9007199254740991`** is what the site itself sends to `/cinema/theaters`
(`Number.MAX_SAFE_INTEGER`). A sane limit works fine.

**`sessionDateTime` carries a `Z` suffix but is local Buenos Aires time.** The
11:30 session shows `2026-07-27T11:30:00.000Z` and displays as 11:30hs on the
site. Treating it as real UTC shifts every showtime by three hours.

## Needs verification

Each item names the step that would confirm it.

1. **Where the purchase flow actually lives.** Confirm by driving the flow in a
   real, non-automated browser with devtools open, clicking a showtime, and
   recording the first request that leaves. If nothing leaves, the click is
   gated client-side and the gate is the finding.
2. **Whether the flow is bot-gated rather than broken.** Same click in a normal
   user's browser. If it works there and not under automation, the site is
   detecting the automation surface, which forecloses the CLI's purchase half.
3. **Whether purchase requires an account** (`BuyAsGuest: false` suggests yes).
   Confirm by reaching the checkout signed out.
4. **Whether a seat-map endpoint exists.** Five candidate paths were probed
   (`cinema/seats?session=`, `cinema/session/{id}`, `cinema/showtime/{id}`,
   `booking/seats?session=`, `cinema/showtimes/{id}`) and all returned 404.
   These were guesses, not observations, and their absence proves nothing. Only
   a real capture of the seat picker settles it.
5. **Whether `tickets.cinemark.com.ar/NSCineSales/` is the live engine.**
   Confirm by completing one purchase manually and watching which host serves
   the seat map.
6. **`occupation.status` thresholds.** Only `HIGH` was ever observed. Confirm by
   sampling a nearly-full session, or derive the ratio yourself and ignore the
   field.
7. **Whether the Waiting Room engages under load.** Only observable during a
   high-demand on-sale.
8. **Authenticated behavior, entirely.** No account was used. Nothing about
   signed-in endpoints, session lifetime, or token rotation is known.

## Correction, 2026-07-27: two surfaces, both now mapped

Everything above was written from the anonymous surface alone, and it framed the
purchase flow as technically unreachable. That was wrong twice over, and both
corrections landed the same day.

**First: the blocker was a login, not a wall.** Clicking a showtime and then
"Comprar entradas" opens a login panel. Eight technical attempts concluded the
click "did nothing"; the user clicked it by hand and the panel appeared. The
account of that error is in [seat-map-attempts.md](seat-map-attempts.md), and it
is worth reading because the mistake is more instructive than the result.

**Second: with an account, the whole purchase surface opened.** Captured by
driving the site with the account holder's own session and consent, across two
different sessions (2D and 3D) so parameters could be told apart from paths. The
HAR was deleted immediately after extraction; it carried email, phone, memberId
and live cookies.

So this target has **two surfaces, not one terrain**:

| Surface | Terrain | Auth | Status |
|---|---|---|---|
| Read (theaters, movies, showtimes, occupancy) | B | none, one header | fully mapped |
| Purchase (prices, seat map, hold) | C | account session | fully mapped |

### The authenticated endpoint table

All observed with a live session. Base `https://bff.cinemark.com.ar/api` unless
noted. Full shapes and the nine-step sequence in
[purchase-flow.md](purchase-flow.md); the login and registration contracts in
[auth-surface.md](auth-surface.md).

| Method | Path | Purpose | Verified |
|---|---|---|---|
| POST | `www/api/auth/callback/credentials` | Login (NextAuth) | observed |
| GET | `www/api/auth/csrf` | CSRF, required before the POST | observed + replayed |
| GET | `/get-member` | Member record, yields `memberId` | observed |
| GET | `/cinema/showtimes/upgrade?theaterId=&sessionId=&sessionFormat=` | Session detail | observed |
| GET | `/get-prices?cinemaId=&sessionId=&salesChannelToken=&memberId=` | Member-specific pricing | observed |
| POST | `/order-tickets` | **Opens the order**, returns `transIdTemp` | observed |
| GET | `/order-get-map?cinemaId=&transIdTemp=&sessionId=` | **The seat map** | observed |
| POST | `/order-set-seats` | **The hold**, by grid coordinates | observed |
| GET | `/order-get-totals?transIdTemp=&cinemaId=` | Order totals | observed |
| GET | `/get-candy`, `/get-merchandising` | Concessions | observed |
| POST | `/create-member` + `/create-member-callback` | Registration, two-step with email | observed |
| POST | `/reminder-password` | Password recovery | observed + replayed |

**The ordering is the non-obvious part:** `order-tickets` must run before
`order-get-map`. There is no way to read a seat map without first opening an
order, which makes "check the seats" a write against their system rather than a
read.

**Payment was deliberately not exercised.** The capture stopped before card
entry.

## Verdict

**Build the read surface. Do not build the purchase surface, even though it is
now fully mapped.**

This verdict changed twice. It started as "the hold step is unmapped"; then the
mapping succeeded; and the recommendation still came out the same, for a reason
that has nothing to do with feasibility.

### Build: the read surface

Ten unauthenticated JSON endpoints, one unvalidated header, no rate limit, stable
REST shapes, and live seat-availability counts per session. A CLI answering "what
is showing near me, in what format, with how many seats left" is buildable today
and needs no account. **This is what `butaca` is.**

### Do not build: the purchase surface

Not because it is out of reach. The seat map (`order-get-map`), the hold
(`order-set-seats`) and the full nine-step sequence are captured, with shapes,
in [purchase-flow.md](purchase-flow.md). A client could be written from that
document alone.

The reason is what the calls **do**:

1. **Reading the seat map is a write.** `order-tickets` must open an order before
   `order-get-map` will answer. A `butaca asientos <session>` command would
   create a transaction in their system on every invocation, including the ones
   where the user is just looking.
2. **The hold takes real inventory.** `order-set-seats` blocks seats other people
   could buy. An automated client that holds and abandons costs the chain
   revenue and costs other customers seats.
3. **It requires the user's own account session**, which means a CLI would be
   automating credentials against a service whose terms were never reviewed for
   that use.

Any one of those is enough. Together they make the purchase half a place where
building is possible and inadvisable.

### Maintenance risk

Every endpoint is undocumented and unversioned, with no deprecation path. The
read shapes look stable: clean REST, a consistent `{data: [...]}` envelope, and
they back the site's own homepage, so they will not vanish quietly. The realistic
failure is a field rename inside `occupation` or a new required header next to
`country`, both cheap to detect with a smoke test.

The purchase endpoints carry a different risk profile entirely: they sit behind a
session, they mutate state, and the site actively resists automated input (the
phone-validation field ignores synthetic events, and showtime clicks do not
navigate under automation). Anything built there breaks on purpose, not by
accident.

### What a next implementer should read

- This report: the read surface and its gotchas.
- [purchase-flow.md](purchase-flow.md): the authenticated sequence, seat-map
  shape, and hold contract. Written to be buildable, kept as documentation of
  what exists rather than an invitation.
- [auth-surface.md](auth-surface.md): login, registration and recovery contracts.
- [seat-map-attempts.md](seat-map-attempts.md): eight approaches that failed, and
  why the conclusion drawn from them was wrong. The most reusable file of the set.
- [friction.md](friction.md): what slowed the recon down, for whoever maintains
  the skill.
