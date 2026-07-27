# Friction log: butaca recon

Target: Cinemark Hoyts Argentina (cinemarkhoyts.com.ar)
Opened: 2026-07-27, before Phase 0.
Skills under test: surface-recon 0.2.0 (candidate), cli-build 0.2.0 (candidate).

Both skills had never run end to end against a real target before this. This log
is the input that decides whether they graduate to stable.

## Entries

### La pieza estructural que falta en la skill: un target tiene DOS superficies

Esto es lo que ordena todos los hallazgos de abajo, y es un cambio de forma en
`surface-recon`, no una regla más.

**Hoy la skill hace clasificar un target en UN terreno.** Terrain B (SPA con API
interna) o Terrain C (portal con login), y seguís ese playbook. Este target es
los dos a la vez, y esa es la situación normal y no la excepción:

| | superficie | terreno | qué expone |
|---|---|---|---|
| **anónima** | lectura | B | 10 endpoints JSON, un header, sin rate limit |
| **autenticada** | compra | C | asientos, reserva, pago |

El reporte quedó escrito como si el target fuera solo B, con el checkout
"inalcanzable". La verdad es que la superficie B está completa **y hay una
segunda superficie detrás de un login que ni siquiera intenté**. Me enteré al
final, por un screenshot de Hunter.

Lo que cambia si la skill modela esto:

1. **Phase 0 clasifica por superficie, no por target.** "Terrain B para lectura,
   C para compra" es una salida válida y más honesta que elegir uno.
2. **Detectar la frontera de auth es un objetivo explícito de la Phase 2**, no
   algo que aparece si tenés suerte. La pregunta "¿qué se desbloquea con una
   cuenta?" hay que hacérsela siempre, aunque no tengas cuenta. La respuesta
   "hay un login en el paso N del flujo X" ya es un hallazgo entregable.
3. **El veredicto se parte en dos.** "Build it narrowly" describe mal esto. Lo
   correcto acá era: *build ahora la superficie anónima; la autenticada está
   mapeada hasta la puerta y necesita una cuenta y tu autorización*.
4. **El reporte debe decir qué NO se intentó y por qué.** El mío no tenía esa
   sección, y por eso "no encontré el checkout" se leía como "no existe" en vez
   de "no crucé una puerta que vi".

Para el CLI construido encima, la consecuencia práctica es la que Hunter nombró:
el CLI anónimo es legítimo y completo, y si algún día se agrega la superficie
autenticada, **son dos modos con contratos distintos** (uno sin credenciales y
otro con), no un CLI con más comandos. Un aviso en el `--help` del tipo "esto
cubre lo público; comprar requiere cuenta" es más honesto que el silencio
actual, que deja creer que el CLI cubre todo lo que el servicio hace.

### Ronda 2: buscando el mapa de asientos (8 intentos, ninguno llegó)

Detalle completo en [seat-map-attempts.md](seat-map-attempts.md). Lo que va acá
son las reglas agnósticas que salieron, candidatas a la skill.

- [surface-recon] **Un screenshot habría cerrado esto en el intento 1 en lugar
  del 8.** Después de descubrir el login, saqué una captura del mismo flujo: el
  panel se ve entero, con sus campos y sus botones, de un vistazo. Costo: un
  comando. Yo había gastado ocho intentos hookeando red, grepeando bundles y
  caminando fibers, todas herramientas que miran *representaciones* del estado
  mientras la pantalla mostraba la respuesta en texto grande.
  **Regla propuesta:** cuando una interacción no produce el efecto esperado,
  **screenshot antes que network tab**. Es la única herramienta que no depende
  de saber qué estás buscando: el grep necesita el nombre correcto, el hook de
  red necesita que haya tráfico, el fiber necesita saber qué prop mirar. La
  imagen no necesita hipótesis previa. Es literalmente el consejo que la skill
  `signature-repro` da para bugs visuales ("capturá y MIRÁ con tus propios
  ojos"), y que no está en `surface-recon`.
- [agent-browser] **`react tree` sin `--json` imprime "Done" y nada más.** Con
  `--json` devuelve el árbol completo (211 KB acá). El modo humano está roto y
  el fallo se parece a "esta página no tiene React", que fue exactamente lo que
  concluí en la primera ronda cuando lo anoté como que "devolvió vacío". Dos
  rondas creyendo que la herramienta no aplicaba a este target.
  Vale reportarlo upstream: un comando que falla devolviendo éxito silencioso es
  peor que uno que errorea.
- [surface-recon] **REGLA DURA propuesta, no sugerencia: si el target es React o
  Next.js, `react tree` es obligatorio y va ANTES de tocar el bundle.** Cómo se
  detecta el target en un comando: `x-powered-by: Next.js` en los headers, un
  `#__next` o `__NEXT_DATA__` en el HTML, o `/_next/static/` en los assets. Si
  eso da positivo, el primer movimiento es:
  ```bash
  agent-browser open <url> --enable react-devtools
  agent-browser react tree --json
  ```
  Es el equivalente para React de lo que la skill ya dice para Electron
  ("conectate al puerto de debug en vez de desempacar el asar"): existe una vía
  de introspección de primera clase y usar grep sobre el bundle minificado en su
  lugar es trabajar a ciegas por elección.
  El `--enable react-devtools` **hay que pasarlo al abrir**; no se puede activar
  después, y omitirlo hace que los comandos `react` devuelvan vacío, que es
  indistinguible de "esta app no usa React".
- [surface-recon] **Para una SPA de React, `react tree` es más barato que todo
  lo que hice y ninguna referencia lo pone primero.** Con
  `open --enable react-devtools` y `react tree --json`, el árbol trae los `key`
  que los desarrolladores escribieron a mano, que son nombres de dominio y no
  identificadores minificados. En este target aparecen literalmente:
  ```
  key="Login:button"
  key="sessions-group-2D - SUBTITULADA"
  key="Horarios"
  ```
  `key="Login:button"` en el árbol **es** la respuesta a "¿por qué se corta el
  flujo?", disponible sin haber cliqueado nada. Y `react inspect <id> --json`
  devuelve props, hooks, state **y el archivo fuente con línea**, que es el
  puente directo del componente al bundle.
  Phase 3 menciona `react tree` en una lista de técnicas para "cuando el tráfico
  no alcanza". Para Terrain B con React debería ser de los primeros movimientos,
  no un recurso tardío: los `key` de dominio sobreviven a la minificación
  justamente porque son strings escritos por humanos.
- [gate] **EL HALLAZGO MÁS IMPORTANTE DE TODA LA SESIÓN, y es un gate que
  falta.** Concluí por escrito que el flujo de compra "no producía nada" después
  de ocho intentos. Hunter cliqueó a mano y le apareció **un panel de login**.
  El flujo existía: chip, "Comprar entradas", correo y contraseña. Lo que
  faltaba no era un endpoint sino una cuenta.
  Tres errores encadenados, todos evitables:
  1. Confundí *"mi automatización no lo logra"* con *"no existe"*. Los ocho
     intentos eran correctos; la inferencia no.
  2. **Busqué el resultado y nunca miré el obstáculo.** Buscaba un endpoint de
     asientos, así que miraba tráfico de red y grepeaba el DOM por selectores
     con "seat". Un panel de login no genera tráfico y no contiene esa palabra:
     era invisible para todo lo que yo estaba mirando. Nunca leí lo que la
     página decía.
  3. **Tenía las dos piezas escritas y no las conecté.** Mi propio reporte lista
     `/api/auth/providers` entre los endpoints observados y anota el feature
     flag `BuyAsGuest: false`. Esas dos líneas explicaban todo, y busqué ocho
     caminos alternativos igual.
  **Gate propuesto, para "Antes de concluir que algo no existe":** cuando una
  acción de UI no produce el efecto esperado, **leé la pantalla antes de mirar
  la red**. Un `innerText` del body cuesta un comando y detecta las tres razones
  más comunes de que un flujo se corte: un login, un consentimiento, o un error
  visible. Todas invisibles para el network tab y para un grep por el nombre del
  recurso que buscás.
  **Segundo gate, más general:** un veredicto negativo tiene que declarar
  explícitamente qué precondiciones se cumplieron. "No hay endpoint de asientos"
  es incompleto; "no hay endpoint de asientos alcanzable **sin cuenta**" es la
  afirmación que la evidencia sostenía, y sale sola si el gate te obliga a
  nombrar las precondiciones.
- [surface-recon] **Un código de error inusual no es una pista hasta que
  probaste que un valor absurdo no lo produce igual.** Perseguí un 502 (en vez
  del 404 esperado) creyendo que significaba "el gateway conoce esta ruta y el
  backend no responde". Un control con `/zzz` devolvió el mismo 502: era la
  respuesta genérica para cualquier ruta desconocida. La regla en una línea:
  antes de invertir en una hipótesis basada en un código de respuesta, pediー
  una ruta imposible y comparé. Cuesta un comando y desarma la hipótesis falsa
  más común del recon.
- [surface-recon] **Un cliente existente para el mismo software base es la mejor
  fuente de hipótesis, y no es evidencia sobre este target.** Un CLI de otra
  cadena sobre el mismo motor de ticketing me dio los paths exactos
  (`/ocapi/v1/showtimes/{id}/seat-layout`). Todos 404 acá. Mismo software,
  decisión de despliegue distinta: una instalación reexpone la API del proveedor
  y la otra la tapa con una capa propia. Vale como playbook: buscá un cliente
  conocido del mismo motor para saber **qué** buscar, pero cada endpoint sigue
  necesitando su propia verificación.
- [surface-recon] **Diferencia de sets de chunks para ubicar el código de una
  ruta.** Comparar el listado de bundles de la ruta que te interesa contra el de
  una ruta que ya entendés aísla los chunks exclusivos. Acá redujo 42 chunks a
  1. Es una técnica de recon que ninguna referencia menciona y que cuesta dos
  `grep` y un `comm`. (En este caso el chunk resultó ser un loader `next/dynamic`,
  pero eso también es información: dice que el código real no se descarga hasta
  llegar al flujo.)
- [surface-recon] **Leer el estado interno del framework antes de deobfuscar.**
  Recorriendo el fiber de React desde un elemento visible aparecieron las props
  del componente (`sessions`, `onSelectSession`) con el objeto de dominio
  completo, ya parseado. Phase 3 menciona `react tree` y `eval` de globals, pero
  no este movimiento concreto: **caminar el fiber hacia arriba desde un nodo que
  podés ubicar por su texto**. Es más barato que grepear un bundle minificado y
  devuelve datos tipados en vez de strings.
- [surface-recon] **La prueba que cierra un "no se puede": llamar al handler
  interno con todas las salidas hookeadas.** Mientras solo cliqueás la UI, un
  resultado negativo es ambiguo (¿cliqueé mal? ¿faltaba un paso?). El
  experimento concluyente es obtener el handler del framework, llamarlo con el
  argumento correcto, y tener hookeados `fetch`, `XMLHttpRequest.open`,
  `window.open`, `history.pushState` y `history.replaceState`. Si no sale nada
  por ninguna de las cinco, el corte es del proveedor y no tuyo. **Sugerencia
  para gates.md**: hoy los gates cubren "no afirmes que existe sin verlo"; falta
  el simétrico, "no afirmes que no existe sin haber ejercitado el camino
  interno". Un veredicto negativo también necesita su prueba.
- [surface-recon] **La instrumentación de terceros del propio target es
  evidencia sobre su arquitectura.** El tag de Google Ads del sitio lleva
  `trigger;navigation-source, not-event-source`, o sea la propia cadena declara
  que esa conversión se cuenta por navegación. Eso convierte "el clic no hace
  nada" en "el clic debería navegar y algo lo impide", que es un diagnóstico
  distinto y mucho más preciso. Los parámetros de analytics están en texto plano
  en el HAR y nadie los mira: describen el flujo que el equipo del sitio cree
  tener, y cuando no coincide con lo que observás, la brecha es el hallazgo.
- [surface-recon] **Un veredicto negativo bien documentado es un entregable.**
  Ocho intentos con su criterio de descarte cierran la pregunta para el próximo
  que la agarre. Sin eso, "no encontré el mapa de asientos" invita a que alguien
  repita los mismos ocho caminos. La skill valora el reporte de lo que existe;
  debería valorar igual el registro de lo que se probó y falló, con el costo de
  cada intento.

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
