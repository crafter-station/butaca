# Friction log: butaca recon

Target: Cinemark Hoyts Argentina (cinemarkhoyts.com.ar)
Opened: 2026-07-27, before Phase 0.
Skills under test: surface-recon 0.2.0 (candidate), cli-build 0.2.0 (candidate).

Both skills had never run end to end against a real target before this. This log
is the input that decides whether they graduate to stable.

## Entries

- [gate] The domain gate fired at Phase 1, before any browser work, and it was
  cheap. The target as briefed (`cinemarkhoyts.com.ar`) 301s to
  `cinemark.com.ar`. A `curl -L` writing `%{url_effective}` caught it in one
  command. The gate is worded for Phase 2 capture ("is the domain you captured
  where the functionality lives"), but the check that catches it is a
  redirect-follow that belongs in Phase 1, next to the spec-path probes, since
  you are already curling the origin there. Suggested fix: add "resolve the
  target to its final origin before probing spec paths" to Phase 1.
- [terrain B] The single highest-value artifact of this whole recon came from
  `curl -sI` on the origin, before opening a browser: the site sets a
  `CNK_PUBLIC_ENVS` cookie on the first response holding 75 keys of public
  config, lz-string compressed. It contains three API base URLs (public BFF,
  local BFF, and an internal Kubernetes service name), a sales-channel token,
  and the full feature-flag set. Phase 3 does mention "before deobfuscating a
  bundle, eval the framework globals; hydration payloads and public config are
  frequently right there", which is the right instinct, but it is filed under
  "dig where traffic is not enough" (Phase 3) when in this case it was reachable
  in Phase 1 from response headers alone. Suggested playbook edit for terrain B:
  "read the Set-Cookie headers on the first response before anything else;
  Next.js apps commonly ship public config there, sometimes compressed."
- [surface-recon] Decoding that blob cost more than it should have. The value is
  lz-string but `decompressFromEncodedURIComponent` fails on the raw cookie
  value and succeeds only after a `decodeURIComponent` pass first, because the
  cookie is percent-encoded on top of the lz encoding. My first attempt returned
  20 chars of mojibake, which reads like a wrong-codec result rather than a
  wrong-preprocessing result and sent me looking for other codecs. Worth a line
  in the terrain B playbook: try the codec on both the raw and the
  percent-decoded value before concluding it is not that codec.
- [agent-browser] Good failure, worth recording as a positive. `click` on the
  cookie-consent button refused with "Element 'e2' is covered by <a inside
  div#ad-floating> at its click point, so the input would land on that element
  instead." That is the error message doing real work: it named the covering
  element by selector, so the fix (`eval` remove `#ad-floating`, then click) was
  one step. A tool that had silently clicked the ad would have navigated me off
  the site mid-capture and polluted the HAR.
- [agent-browser] `eval` snippets share one JS scope across invocations, so a
  second call declaring the same `const b` dies with "Identifier 'b' has already
  been declared" even though it is a separate command. The failure looks like a
  syntax error in your own snippet, not like state carried from a prior call.
  Wrapping every snippet in an IIFE fixes it. Worth a line in the core guide,
  since the natural way to write these is bare `const`.
- [agent-browser] `agent-browser errors` printed ten lines of a bare red cross
  with no message text. An error list with no errors in it is worse than an
  empty list, because it says something is wrong and refuses to say what. I
  could not use the output at all and had to fall back to the HAR.
- [surface-recon] The skill says "drive the actual action, not just the home
  page" and I still burned four attempts guessing checkout URLs from strings
  grepped out of the bundle (`/compra-entradas`, `/pelicula/{slug}/compra-entradas/{id}`),
  each returning a 404 page that renders with HTTP 200 in the SPA. The guidance
  exists but it is a sentence inside Phase 2; what would actually have stopped
  me is a gate worded as a prohibition: "a route assembled from bundle strings
  is not an observed route. Navigate by driving the UI, and if the UI will not
  navigate, that is the finding." Suggested as a new entry under "During
  capture" in gates.md.
- [terrain B] Terrain B's playbook assumes clicking the thing reveals the
  endpoint. On this target the showtime elements are `div`s with React onClick
  handlers that fire analytics (a doubleclick `type=carrito` beacon is
  observable in the HAR) but perform no navigation and no API call, in a
  headless browser. The playbook has no branch for "the click is observable in
  telemetry but produces no state change", which is the exact shape of a
  bot-gated purchase funnel.
- [terrain B] The single most useful move in this recon is not in any playbook:
  reading the error body of a failing replay. The unauthenticated call returned
  500 with `{"code":"INTERNAL_ERROR","message":"Country undefined not
  implemented"}`, which named the one missing header outright. The playbook's
  advice for a failing replay is to diff headers against the HAR, which would
  have worked but slower (the captured request carried eight custom headers, and
  I would have bisected). Suggested addition to terrain B: "when a replay fails,
  read the response body before diffing headers. Internal APIs leak the missing
  precondition in their error text far more often than public ones."
- [gate] The "did you parse the response body, or trust the status code" gate
  earned its place twice here, in a direction it does not currently describe. It
  is worded for false success (200 that is really a failure). Both times it
  mattered here it was the inverse: a 500 that was really a precise, actionable
  error message, and a 404 SPA page served with HTTP 200. Suggest widening the
  wording to "the status code and the body can disagree in both directions".
- [surface-recon] Nothing in the skill tells you to bound your greps. A
  `grep -oE '"[^"]*(api|Seat)[^"]{0,40}"'` against a 3 MB minified bundle
  backtracked until the 120s tool timeout killed it and the command was moved to
  the background. Phase 3 warns "beware of large artifacts, pipe to a file and
  grep the file", which I had already done: the file was not the problem, the
  unbounded `[^"]*` prefix was. Suggested sharpening: "bound every quantifier in
  a bundle grep and put a timeout on it. An unanchored `.*` or `[^"]*` against a
  minified megabyte can hang long enough to look like a network stall."
- [gate] The gates caught one real defect in my own draft at review time. I had
  written the five probed seat paths into the endpoint table before catching
  that they were guesses that returned 404, not observations. "Did you observe
  this request, or infer it" fired correctly, and they moved to Needs
  verification with the note that their absence proves nothing. Working as
  intended, and it fired late rather than never.
- [gate] Missing gate, high value: nothing checks whether the flow the user
  actually asked for was reached. Every gate here is about the accuracy of what
  you did map. I mapped ten endpoints accurately and never entered the purchase
  flow, which is the half the brief cared about. A recon can pass every existing
  gate and still miss the point. Suggested new gate under "Before delivering":
  "Did you reach the flow the user asked about? If the report's verdict rests on
  a flow you never entered, say so in the verdict line itself, not only under
  Needs verification."
- [surface-recon] Phase 5 offers three verdicts and none of them fit cleanly.
  The truthful answer here is split by surface: build the read half, do not
  build the write half yet. I wrote it as "build it, narrowly" plus a paragraph,
  which works, but "narrowly" in the skill means "only these endpoints are
  solid" (a scope statement), not "one half is blocked pending evidence" (a
  confidence statement). Suggested: let the verdict be per-surface when a target
  splits into read and write, since that split is common and the difference
  matters more than any single label.
- [surface-recon] Phase 1 says "try the conventional spec paths directly" and
  lists them. It does not say to follow redirects. Probing without `-L` returned
  `301` for all seven paths, which is indistinguishable from a site that
  redirects everything to a login and reads as a wall. With `-L` the same paths
  return honest 404s. One flag changed the apparent terrain. Worth one clause in
  the phase text.
