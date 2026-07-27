---
type: surface-recon-addendum
target: https://bff.cinemark.com.ar/api
created: 2026-07-27
terrain: C (autenticado)
auth: sesión de cuenta real, capturada con consentimiento del titular
---

# El flujo de compra, mapeado con sesión

Capturado conduciendo el sitio con una cuenta real del usuario, con su
consentimiento y su participación directa. Dos funciones distintas (2D sala 7 y
3D sala 10) para poder diferenciar parámetro de ruta.

**El HAR se borró apenas terminó la extracción.** Llevaba email, teléfono,
`memberId` y cookies de sesión vivas. Lo que sigue son formas, no valores: los
identificadores concretos están reemplazados por `{placeholder}`.

Esto responde la pregunta que quedó abierta en
[seat-map-attempts.md](seat-map-attempts.md), donde ocho intentos sin cuenta
concluyeron, equivocadamente, que no había mapa de asientos.

## Existe, y es la API de Vista

El mapa de butacas se sirve por `GET /order-get-map`, en el mismo host y con el
mismo header `country: AR` que la superficie anónima. No hacía falta ningún host
nuevo ni ningún OCAPI: **estuvo siempre en la misma BFF, detrás del login.**

## Cómo se autentica el BFF (verificado 2026-07-27)

**La cookie de NextAuth no sirve contra el BFF.** Vive en `www.cinemark.com.ar`
y el BFF está en `bff.cinemark.com.ar`, así que no viaja. Mandarla igual devuelve
`401 member_session_not_found`.

Lo que el BFF acepta es un header:

```
member-session-id: <uuid>
```

Ese uuid sale de `GET /api/auth/session` **después** del login, en
`user.memberSessionId`. La misma respuesta trae `user.accessToken` (300 chars),
que no hace falta: probado como `Authorization: Bearer` y como `authorization`
pelado, los dos dan 401. También probado `x-member-session`, 401. El único que da
200 es `member-session-id`.

**El vencimiento real son unas 24 horas**, no los 30 días de la cookie. El campo
`user.expires` de la sesión es el que manda; guardar el de la cookie hace que el
CLI crea tener sesión válida cuando ya no la tiene.

```
GET /api/auth/session
{ "user": { "memberSessionId": "<uuid>", "memberId": "...", "accessToken": "...",
            "loyaltyLevel": 1, "expires": "2026-07-28T14:08:04.455Z" } }
```

## Secuencia observada

Del login al hold de asientos, en orden:

| # | Método | Endpoint | Qué hace |
|---|---|---|---|
| 1 | POST | `/api/auth/callback/credentials` | Login (NextAuth, en `www`) |
| 2 | GET | `/get-member` | Datos del socio, devuelve `memberId` |
| 3 | GET | `/cinema/showtimes/upgrade?theaterId=&sessionId=&sessionFormat=` | Detalle de la función |
| 4 | GET | `/get-prices?cinemaId=&sessionId=&feature=&salesChannelToken=&memberId=` | Tarifas para ese socio |
| 5 | POST | `/order-tickets` | **Crea la orden.** Devuelve `transIdTemp` |
| 6 | GET | `/order-get-map?cinemaId=&transIdTemp=&sessionId=` | **El mapa de asientos** |
| 7 | POST | `/order-set-seats` | **Reserva las butacas** (el hold) |
| 8 | GET | `/order-get-totals?transIdTemp=&cinemaId=` | Totales |
| 9 | GET | `/get-candy`, `/get-merchandising` | Candy y merchandising |

**El orden importa y es contraintuitivo:** primero se eligen tipos de entrada
(`order-tickets`), y recién eso devuelve el `transIdTemp` que habilita pedir el
mapa. No se puede ver el mapa de una función sin antes abrir una orden.

Rutas de página del flujo, todas POST del router de Next:
`/pelicula/{slug}/compra-entradas/entradas`, `/butacas`, `/candy`,
`/cinemarkstore`, `/mejoratuexperiencia`.

## El mapa de asientos

`GET /order-get-map` devuelve el layout nativo de Vista:

```jsonc
{
  "Code": 0,
  "Message": "...",
  "Data": {
    "physicalScreenLeft": "...",      // geometría de la pantalla
    "physicalScreenWidth": "...",
    "screenBoundaryPositionLeft": "...",
    "totalNumberOfAreas": 1,
    "areas": [{
      "areaNumber": "1",
      "areaCategory": "0000000001",   // se necesita para order-set-seats
      "areaLayoutRows": 14,           // grilla física
      "areaLayoutColumns": 14,
      "totalNumberOfRows": 14,
      "rows": [{
        "seatGridRowId": "5",         // coordenada, NO la letra de fila
        "rowPhysicalId": "...",       // la etiqueta impresa
        "seats": [{
          "gridSeatNumber": 10,       // coordenada de columna
          "seatNumber": "2",          // la etiqueta impresa
          "seatStatus": 4
        }]
      }]
    }],
    "seatDescriptions": { "seatStatuses": [...], "seatSpecialMessages": [...] }
  }
}
```

### Los ocho estados

| id | significado |
|---|---|
| 0 | DISPONIBLE |
| 1 | NO DISPONIBLE |
| 3 | OBESIDAD |
| 4 | SILLA DE RUEDAS |
| 5 | AUTO ASIGNADA |
| 6 | ROTA |
| 7 | RESERVADA POR EL USUARIO Y ROTA |
| 8 | BLOQUEADA |

Los estados 3 y 4 son **butacas de accesibilidad**, no ocupadas: un cliente que
las trate como "no disponible" pierde información, y uno que las ofrezca como
libres sin decir qué son es peor.

**El estado 5 (`AUTO ASIGNADA`) es por orden, no por sala.** Verificado abriendo
tres órdenes seguidas sobre la misma función: la butaca marcada fue `12-5`,
después `12-4` y después `10-8`. Es la que Cinemark preasigna a **esa**
transacción, o sea la que el sitio te deja marcada al entrar. Un cliente que la
trate como un atributo fijo de la sala se equivoca; es la sugerencia por defecto
para el hold.

### La distinción que importa para dibujarlo

**`gridSeatNumber` (posición física) no es `seatNumber` (etiqueta impresa).**
Lo mismo entre `seatGridRowId` y `rowPhysicalId`.

Dibujar por etiqueta cierra los pasillos silenciosamente; dibujar por coordenada
los muestra como huecos reales. Es exactamente lo que documenta el CLI de la otra
cadena sobre el mismo motor, y acá se confirma en un layout distinto: la
distinción es de Vista, no de una instalación.

**El eje horizontal va espejado, confirmado 2026-07-27 contra la sala 7 de
Palermo:**

```
fila  2: grid [1, 2, 3, 4, 5, 6] -> label [13, 11, 9, 7, 5, 3]
fila  3: grid [1, 2, 3, 4, 5, 6] -> label [13, 11, 9, 7, 5, 3]
```

`gridSeatNumber` crece hacia la izquierda de la etiqueta impresa: el grid 1 es
la butaca 13, el grid 6 es la butaca 3. Dibujar de izquierda a derecha por
`gridSeatNumber` sin invertir produce una imagen especular de la sala. Detalle
completo, con el fix y la nota de que el hold sigue usando la coordenada
original, en `CONTRACT-AUTH.md`.

## Abrir la orden

El paso que habilita todo lo demás. **Contrato completo, verificado
2026-07-27** con un request real que devolvió `transIdTemp: 20012805713`:

```jsonc
POST /order-tickets
{
  "sessionId": 159037,
  "cinemaId": 733,
  "salesChannelToken": "d792f0f7def937524c47b6e5036b70085302d9df18a7dfc48478ce3d2de4bef9",
  "memberId": 11540963,
  "ticketList": [{
    "areaCategoryCode": "",
    "hOCode": "1697",        // sale de /get-prices (ahí viene como hoCode, h minúscula)
    "recogId": 0,
    "promoId": 0,
    "voucher": "",
    "quantity": 1,
    "price": 2000000,        // en centésimos: 2000000 = $20.000
    "ticketsQty": 1,
    "buyOptions": [ /* el objeto buyOption entero, tal cual vino de get-prices */ ]
  }]
}
```

**Lo que faltaba en la primera captura:** `cinemaId`, `salesChannelToken` y
`memberId` a nivel superior del body. Sin ellos, Cinemark responde
`500 error_order_new "Uno o más campos son requeridos."`. El
`salesChannelToken` sale del env blob del sitio
(`SALES_CHANNEL_TOKEN_TICKET_CANDY`, ver `recon/report.md`); el `memberId` sale
de `GET /api/auth/session` (`user.memberId`), la misma llamada que ya trae
`memberSessionId`, y se cachea en `~/.butaca/config.json` al hacer login.

### El shape real de `GET /get-prices`

También verificado 2026-07-27, y distinto del que se había asumido: no es una
lista plana de tarifas, son categorías anidadas.

```jsonc
{
  "code": 0,
  "data": [
    {
      "categoryId": 1, "title": "GENERAL", "cssClass": "standard", "showTitle": true,
      "tickets": [
        {
          "quantity": 1,
          "hoCode": "1697",          // h minúscula acá, distinto de hOCode que pide order-tickets
          "title": "Entrada General\n",
          "cssClass": "ticket-reg",
          "description": "...",
          "ticketsQty": 1,
          "onlyBuy": true,
          "onlyBook": false,
          "buyOptions": [
            { "recogId": 0, "promoId": 0, "cssClass": "ticket-price-reg",
              "value": 2000000, "valueWithoutTax": 1526700, "service": 105000,
              "buttonQty": 1, "maxQty": 6, "type": 3, "level": 0, "balances": [] }
          ],
          "colorCode": "", "imageUrl": "..."
        }
      ]
    }
  ]
}
```

El precio está en `buyOptions[0].value` (centésimos). `order-tickets` pide el
objeto `buyOptions[0]` entero, no solo `recogId`/`promoId`. Implementado en
`buildTicketList` (`src/commands/butacas.ts` y `src/commands/reservar.ts`).

## La reserva

```jsonc
POST /order-set-seats
{
  "numberOfSeats": 1,
  "seats": [{
    "areaCatCode": "0000000001",
    "areaNumber": "1",
    "gridSeatRowId": "5",       // coordenadas, no etiquetas
    "gridSeatNumber": "11"
  }],
  "cinemaId": 733,
  "transIdTemp": {number},
  "movie": { ... }
}
```

**Se reserva por coordenada de grilla.** Un cliente que le pida al usuario "fila
F, asiento 12" tiene que traducir la etiqueta a coordenada usando el mapa, porque
la API no acepta etiquetas.

## Registro, ahora completo

El flujo de alta que quedó a medias en [auth-surface.md](auth-surface.md):

```
POST /create-member           -> alta
POST /create-member-callback  -> confirmación tras verificar el mail
GET  /content/disclaimers/page/new-account -> textos legales
GET  /content/avatars         -> catálogo de avatares
```

Es de dos pasos con verificación por correo. El link del mail vuelve al sitio con
`?registerToken={hex64}&t={hex64}`.

**Validación de teléfono, medida:** el campo exige formato argentino de 10
dígitos (el placeholder del sitio es `1123456789`). Un número peruano de 9
dígitos se rechaza con "Teléfono inválido". Es una barrera de residencia, no un
bug, y coherente con que también pida complejo de preferencia y DNI.

## No hay deep link a la orden abierta (verificado 2026-07-27)

Con una orden abierta (`transIdTemp` fresco) y sesión activa, **ninguna URL
lleva al seat picker del sitio con esa orden cargada.** Probadas seis, todas
devuelven el 404 de la SPA:

| URL | resultado |
|---|---|
| `/butacas` | 404 SPA |
| `/checkout` | 404 SPA |
| `/pelicula/{slug}/compra-entradas/butacas` | 404 SPA |
| `/butacas?transIdTemp={id}` | 404 SPA |
| `/butacas?transaction={id}` | 404 SPA |
| `/checkout?transIdTemp={id}` | 404 SPA |

Las tres primeras también con la cookie de sesión, mismo resultado. **El estado
de la orden vive en memoria del cliente**, no en la URL ni en una cookie que el
servidor pueda leer para rehidratar la página.

Lo más cerca que se puede llegar es `/pelicula/{slug}?cine={cine}`, que sí está
verificado y deja el complejo preseleccionado. Es lo que emite `butaca butacas`
como `siteUrl`.

## El upstream corta la venta online

Después de abrir varias órdenes seguidas probando, `order-tickets` empezó a
devolver:

```
Estimado Cliente: Le informamos que nuestro sistema de venta de entradas online
se encuentra momentáneamente suspendido.
```

**La lectura pública y `get-prices` siguieron funcionando (200)**, así que el
corte es solo del flujo de compra, no de la API entera. No quedó claro si es una
ventana de mantenimiento programada o una reacción a la cadencia de órdenes: no
se midió cuánto dura. Un cliente debe tratar este mensaje como estado temporal y
no reintentar en loop.

## Qué queda fuera

- **El pago.** Se cortó deliberadamente antes de cargar tarjeta. Los endpoints de
  `/checkout` y los callbacks de MODO no se ejercitaron.
- **El TTL del `transIdTemp`.** Un reintento posterior contra el mismo id devolvió
  `500 error_get_order_map`, así que expira, pero no se midió cuánto dura.
- **Cinemark Club, historial de órdenes, medios de pago guardados.**

## Consecuencias para el CLI

Esto no cambia el corte actual de `butaca`, y refuerza por qué es el correcto:

1. **Ver el mapa de asientos requiere abrir una orden** (`order-tickets` antes de
   `order-get-map`). No es una lectura: es un efecto de escritura en su sistema.
   Un `butaca asientos <sesion>` crearía una transacción por cada consulta.
2. **El hold es una reserva real** que bloquea butacas para otras personas.
3. Ambos requieren sesión, y automatizar el login con la cuenta del usuario es
   una decisión con consecuencias que excede lo que el CLI hace hoy.

**El CLI se queda en la superficie anónima.** La ocupación agregada por función
responde "¿qué función tiene lugar?" sin abrir órdenes ni bloquear nada, y es la
respuesta correcta para el noventa por ciento de los casos.

Si algún día se agrega la mitad autenticada, este documento es el mapa: la
secuencia de nueve pasos, el shape del layout y el contrato del hold están todos
acá.
