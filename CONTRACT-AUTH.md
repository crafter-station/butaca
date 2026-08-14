# butaca, superficie autenticada

Contrato de los comandos que necesitan cuenta. Escrito antes del código, per
`cli-build` Phase 2. Complementa `CONTRACT.md`, que cubre la superficie anónima.

Origen del mapeo: recon del flujo de compra y de la superficie de auth,
verificados contra la API real. Las notas del recon no se publican.

## Qué cambia respecto de la mitad anónima

La mitad anónima es read-only sobre datos públicos, y por eso Phase 4 justificó
no tener trust ladder ni audit log. **Acá no aplica esa exención.** Estos
comandos:

- escriben en el sistema de un tercero (abrir una orden es un `POST`),
- toman inventario real (el hold bloquea butacas de otras personas),
- operan con las credenciales del usuario.

Los tres son los criterios exactos que la skill usa para exigir el aparato de
seguridad completo. Así que esta mitad **sí** lleva trust ladder, dry-run,
audit log y confirmación.

## Comandos

```
butaca auth login                      guarda credenciales, abre sesión
butaca auth status                     ¿hay sesión? ¿de quién? ¿vence cuándo?
butaca auth logout                     borra sesión y credenciales

butaca butacas <sessionId>             dibuja el mapa de asientos
       [--cine <slug>]
       [--dry-run]                     no abre orden, explica qué haría

butaca reservar <sessionId>            hold real de butacas
       --asientos 7-12,7-13
       [--asignada]                    la butaca que Cinemark preasigna
       [--orden <transIdTemp>]         reusa la orden que abrió `butacas`
       [--dry-run]                     valida sin reservar
       [--yes]                         saltea la confirmación
```

## Trust ladder

Tres niveles, por consecuencia y no por comodidad.

| Nivel | Comandos | Gate |
|---|---|---|
| **read** | `auth status` | ninguno |
| **write-soft** | `butacas` | avisa que abre una orden; `--dry-run` disponible |
| **write-hard** | `reservar` | confirmación explícita, audit log, `--dry-run` que ejercita el camino real |

`butacas` es **write-soft y no read**, y esto es lo contraintuitivo del target:
mirar el mapa exige `POST /order-tickets` antes, o sea consultar ya escribe. Un
usuario que corre `butaca butacas` diez veces deja diez transacciones abiertas
en el sistema de Cinemark. El comando tiene que decirlo.

## Credenciales

**La contraseña nunca toca el disco.** Va al keychain de macOS:

```
security add-generic-password -s butaca -a <email> -w <password> -U
```

En `~/.butaca/config.json` (permisos 600) solo se guarda:

```jsonc
{
  "email": "...",           // identificador, no secreto
  "session": {
    "cookie": "...",           // cookie de NextAuth
    "memberSessionId": "...",  // header member-session-id contra el BFF
    "memberId": "...",         // exigido por order-tickets; cacheado al loguear
    "expiresAt": "..."         // ISO
  }
}
```

`memberId` sale de `GET /api/auth/session` (`user.memberId`), la misma llamada
que ya trae `memberSessionId` al loguear. Cachearlo ahí evita pedirlo a
`/get-member` en cada comando que abre una orden.

Per la skill: *store identifiers, take secrets from the environment*. El email
es identificador, la contraseña es secreto.

Fallback sin keychain (Linux, CI): `BUTACA_EMAIL` y `BUTACA_PASSWORD` del
entorno. Si no hay ninguno de los dos y no hay TTY, falla con
`AUTH_REQUIRED` en vez de colgarse pidiendo input.

## Flujo de login

Verificado contra la API real:

```
GET  /api/auth/csrf                  -> csrfToken
POST /api/auth/callback/credentials  -> 200 + cookie, o 401 CredentialsSignin
GET  /api/auth/session               -> {} si no hay sesión
```

## Envelopes

Mismo shape que el resto del CLI. Códigos nuevos:

| code | exit | cuándo |
|---|---|---|
| `AUTH_REQUIRED` | 1 | no hay sesión y el comando la necesita |
| `AUTH_EXPIRED` | 1 | la sesión venció; hint dice `butaca auth login` |
| `AUTH_FAILED` | 1 | credenciales rechazadas (401 del upstream) |
| `SEATS_UNAVAILABLE` | 1 | los asientos pedidos ya no están libres |
| `ORDER_FAILED` | 2 | el upstream rechazó abrir la orden |

## Shapes

`butacas` →
```jsonc
{
  "sessionId": "159037",
  "movie": { "slug": "spider-man-un-nuevo-dia", "name": "SPIDER-MAN: UN NUEVO DÍA" },
  "showtime": { "dateTime": "15/08/2026 21:00", "displayDate": "2026-08-15", "format": "2D", "language": "SUB" },
  "theater": { "id": "733", "room": "7" },
  "transIdTemp": 20012804416,
  "screen": { "rows": 14, "columns": 14 },
  "areas": [{
    "code": "0000000001",
    "number": "1",
    "seats": [{
      "row": "F",              // rowPhysicalId, la etiqueta impresa
      "number": "12",          // seatNumber, la etiqueta impresa
      "gridRow": "5",          // seatGridRowId, la coordenada
      "gridNumber": "11",      // gridSeatNumber, la coordenada
      "status": "DISPONIBLE",
      "statusId": 0
    }]
  }],
  "summary": { "total": 196, "available": 180, "accessible": 4, "broken": 2 },
  "sugeridas": [{ "row": "10", "number": "16", "label": "10-16", "distanciaPantalla": 0.69, "desviacionCentro": 0.02, "score": 0.98 }],
  "siteUrl": "https://www.cinemark.com.ar/pelicula/spider-man-un-nuevo-dia?cine=palermo"
}
```

**Se exponen las dos representaciones a propósito.** El humano lee `F12`; la API
de reserva solo acepta `gridRow`/`gridNumber`. Ocultar las coordenadas obligaría
a un agente a re-derivarlas.

`reservar` →
```jsonc
{
  "transIdTemp": 20012804416,
  "seats": [{ "row": "F", "number": "12" }],
  "seatHeld": true,
  "browserCheckoutAvailable": false,
  "sideEffect": "seat_held",
  "siteUrl": "https://www.cinemark.com.ar/pelicula/spider-man-un-nuevo-dia?cine=palermo",
  "expiresAt": "..."          // si el upstream lo informa
}
```

## El body de order-tickets (verificado, ya no parcial)

Confirmado 2026-07-27 con un request real que devolvió `transIdTemp: 20012805713`:

```jsonc
POST /order-tickets
{
  "sessionId": 159037,
  "cinemaId": 733,                    // FALTABA: sin esto, 500 error_order_new
  "salesChannelToken": "...",         // FALTABA: hardcodeado, sale del bundle del sitio
  "memberId": 10000001,               // FALTABA: de la sesión, ver Credenciales
  "ticketList": [{
    "areaCategoryCode": "",
    "hOCode": "1697",                 // ojo: la respuesta de get-prices trae hoCode (h minúscula)
    "recogId": 0,
    "promoId": 0,
    "voucher": "",
    "quantity": 1,
    "price": 2000000,                 // centésimos: 2000000 = $20.000
    "ticketsQty": 1,
    "buyOptions": [ /* el objeto buyOption entero, tal cual vino de get-prices */ ]
  }]
}
```

Sin `cinemaId`, `salesChannelToken` y `memberId` a nivel superior, Cinemark
responde `500 error_order_new "Uno o más campos son requeridos."`. Implementado
en `openOrder` (`src/api-auth.ts`).

## Los ocho estados de asiento

Del upstream, verificados:

| id | upstream | glifo | significado |
|---|---|---|---|
| 0 | DISPONIBLE | `·` | libre |
| 1 | NO DISPONIBLE | `x` | vendida |
| 3 | OBESIDAD | `O` | accesibilidad, no ocupada |
| 4 | SILLA DE RUEDAS | `W` | accesibilidad, no ocupada |
| 5 | AUTO ASIGNADA | `a` | asignada automáticamente |
| 6 | ROTA | `/` | fuera de servicio |
| 7 | RESERVADA Y ROTA | `/` | idem |
| 8 | BLOQUEADA | `#` | bloqueada por el cine |

**3 y 4 no son "ocupadas".** Un cliente que las pinte como vendidas miente; uno
que las ofrezca como libres sin decir qué son, también.

## El eje va espejado (confirmado 2026-07-27)

Un CLI de otra cadena sobre el mismo motor de ticketing documenta que su sala
tiene el **asiento 1 a la derecha**, así que dibujar las columnas de izquierda a
derecha produce una imagen invertida y el usuario busca su butaca del lado
equivocado. Lo verificaron comparando butacas ocupadas contra el sitio.

**Confirmado contra el mapa real de la sala 7 de Palermo:**

```
fila  2: grid [1, 2, 3, 4, 5, 6] -> label [13, 11, 9, 7, 5, 3]
fila  3: grid [1, 2, 3, 4, 5, 6] -> label [13, 11, 9, 7, 5, 3]
```

`gridSeatNumber` crece hacia la **izquierda** de la etiqueta impresa: el grid 1
es la butaca 13, el grid 6 es la butaca 3. Dibujar de izquierda a derecha por
`gridSeatNumber` sin invertir produce una imagen especular de la sala.

El índice de columna es `columnas - gridSeatNumber`, no `gridSeatNumber - 1`.
Implementado en `buildGrid` (`src/seat-map.ts`). **El espejo es solo para
dibujar**: `order-set-seats` sigue recibiendo el `gridSeatNumber` original, sin
invertir (`toHoldSeatEntries` en `src/commands/reservar.ts` lee `seat.gridNumber`
directo de `parseSeatMap`, nunca del índice de `buildGrid`). Mezclar los dos
reservaría la butaca equivocada.

## Dibujo del mapa

Por **coordenada de grilla**, no por etiqueta. Los pasillos son huecos en la
grilla; dibujar por etiqueta los cierra silenciosamente. Esto está verificado en
dos cadenas distintas sobre el mismo motor de ticketing.

```
        P A N T A L L A
   ────────────────────────────

 A  · · · · ·   · · · · ·  · ·
 B  · · x x ·   · · · · ·  W W
 F  · · · · ·   x x · · ·  · ·

 · libre   x vendida   W silla de ruedas
```

## Qué sigue fuera

**El pago.** `reservar` devuelve `browserCheckoutAvailable: false` y un
`siteUrl` que no preserva la orden. Los callbacks de MODO y la entrada de
tarjeta no se automatizan: eso cruza a 3-D Secure del banco y es territorio de
fraude.
