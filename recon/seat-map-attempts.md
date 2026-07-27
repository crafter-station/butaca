# Mapear asientos: ocho intentos, una conclusión equivocada, y la corrección

> **CORRECCIÓN (2026-07-27, después de escribir todo lo de abajo).** La
> conclusión original de este archivo, "el clic no produce nada", **era falsa**.
> Hunter cliqueó a mano y le apareció un panel de login. Reproducido y
> confirmado: el flujo es **chip de horario, luego "Comprar entradas", luego un
> panel pidiendo correo y contraseña**. Lo que faltaba no era un endpoint, era
> una **cuenta**. Ver "La corrección" al final, que es la parte que importa.
>
> Los ocho intentos quedan escritos tal cual porque el error metodológico es más
> instructivo que el resultado.
>
> **RESUELTO (mismo día).** Con una cuenta real, el mapa de asientos apareció en
> `GET /order-get-map`, en la misma BFF que ya conocíamos. Nunca hizo falta otro
> host ni OCAPI: estuvo todo el tiempo detrás del login. Contrato completo,
> secuencia de nueve pasos y shape del layout en
> [purchase-flow.md](purchase-flow.md).


Registro completo de la búsqueda del mapa de butacas de Cinemark Argentina.
Ninguno de los ocho caminos llegó, y el valor de este archivo es que **cierra la
pregunta con evidencia** en vez de dejarla abierta para que el próximo la
reintente.

El método es reusable aunque el target no: es una escalera de intentos ordenada
de más barato a más caro, con un criterio de descarte por escalón.

## Contexto

Un CLI hermano para otra cadena (Cine Colombia) **sí** dibuja el mapa de
asientos y compra entradas. Ambas cadenas corren sobre Vista Cinema, el mismo
software de ticketing. Así que la pregunta no era "¿se puede?" sino "¿expone
esta instalación lo mismo que aquella?".

La respuesta resultó ser que no, y el porqué es interesante.

## Los ocho intentos

### 1. Copiar el path OCAPI del CLI hermano

El otro CLI llama a `/ocapi/v1/showtimes/{id}/seat-layout` y
`/ocapi/v1/showtimes/{id}/seat-availability`. Probé los dos contra la BFF con el
`sessionId` real.

**404 los dos.** También bajo `cinema/`, `showtimes/` y sin prefijo.

### 2. Perseguir un 502 que parecía una pista

`bff.host/ocapi/...` devolvía **502** en lugar de 404, lo que sugiere un gateway
intentando rutear a un backend que no responde. Parecía la pista buena.

Lo maté con un control: probé `/zzz` y `/zzz/yyy`. **También 502.** El 502 es la
respuesta genérica del gateway para cualquier ruta desconocida; solo
`/api/cinema/*` devuelve 200.

Un código de error inusual no es una pista hasta que probás que un valor
absurdo no lo produce igual.

### 3. Buscar el host de Vista por DNS

Cinco candidatos: `ocapi.`, `api.`, `vista.`, `multiplex.`, `tickets.`.

Tres sin DNS. `api.` y `tickets.` resuelven, ambos a la misma IP de Cloudflare.
`api.` devuelve 404 en todos los paths OCAPI y en el clásico
`/WSVistaWebClient/RESTData.svc/`.

### 4. Leer el bundle de la ruta del seat picker

`/butacas` y `/asientos` existen como rutas. Bajé los 42 chunks de `/butacas` y
busqué endpoints.

Solo aparecen las rutas de UI (`/butacas`, `/asientos`, `/seats`). Ninguna ruta
de API con "seat" en el nombre.

### 5. Aislar el chunk exclusivo del seat picker

Comparé el set de chunks de `/butacas` contra el de `/cartelera/{cine}`. Difieren
en **exactamente uno**: ese tiene que ser el del picker.

Son 25 KB y su único contenido relevante es `next/dynamic`: es un loader. El
código real se descarga bajo demanda y nunca se pide sin llegar al flujo.

### 6. Cargar la ruta directamente en el browser

`/butacas` sin contexto de sesión renderiza la página de "esta página no existe".
La ruta necesita estado previo que no se alcanza por URL.

### 7. Leer el estado interno de React del chip de horario

Acá apareció lo más útil. Recorriendo el fiber desde el chip, encontré el
componente que los renderiza, con props:

```
["label", "sessions", "isSelected", "onSelectSession", "isLast", ...]
```

`sessions` trae el objeto completo de cada función (sessionId, sala, formato,
idioma, ocupación). O sea **el cliente ya tiene todo lo que necesita**, y aun así
el clic no produce nada.

### 8. Llamar al handler interno directamente

El intento definitivo: saltear la UI y llamar `onSelectSession(sessions[0])` con
el sessionId correcto, desde la consola.

Antes hooké **todas** las salidas posibles: `fetch`, `XMLHttpRequest.open`,
`window.open`, `history.pushState` y `history.replaceState`.

**Cero requests. Cero navegación.** El handler solo marca selección local.

Lo mismo con el botón "Comprar entradas", que está presente y habilitado:
produce beacons a tres redes publicitarias (Twitter lo registra literalmente como
`autobuttonclick / "COMPRAR ENTRADAS"`) y ninguna llamada a la API de la cadena.

## La evidencia que más dice

Un parámetro del tag de Google Ads que dispara el clic:

```
trigger;navigation-source, not-event-source
```

**La propia instrumentación de la cadena declara que esa conversión se cuenta
por navegación, no por evento.** Es decir: ese clic *debería* navegar. No lo hace
bajo automatización.

Sumado a que el analytics registra `content_name: "seleccionar cine"` cuando
cliqueo un horario, la lectura más probable es que el flujo de compra está
deliberadamente cerrado a clientes automatizados, no que no exista.

## La corrección: había un login todo el tiempo

Todo lo de arriba concluía que el clic no producía nada. **Es falso.** Hunter lo
cliqueó a mano y le apareció un panel de login. Reproducido:

1. Clic en el chip de horario.
2. Clic en "Comprar entradas".
3. Aparece un panel: *"¡HOLA! QUÉ BUENO VERTE POR ACÁ"*, con correo,
   contraseña, "INICIAR SESIÓN" y "CREAR CUENTA".

Verificado el flujo de auth con credenciales deliberadamente inválidas, para
mapear el endpoint sin tocar ninguna cuenta:

```
GET  200 /api/auth/providers            -> {"credentials":{...}}
GET  200 /api/auth/csrf                 -> {"csrfToken":"7569fbc2..."}
POST 401 /api/auth/callback/credentials -> error=CredentialsSignin
```

Es NextAuth con provider de credenciales. El recon original **ya había
detectado** `/api/auth/providers` y lo dejó anotado como "no ejercitado". Estaba
ahí, listado, y aun así busqué el mapa de asientos por ocho caminos que no
pasaban por él.

### Por qué se me pasó

Tres errores encadenados, todos míos:

1. **Confundí "mi automatización no lo logra" con "no existe".** Los ocho
   intentos son técnicamente correctos y la conclusión que saqué de ellos no.
2. **Busqué el resultado, no el obstáculo.** Buscaba un endpoint de asientos.
   Cuando el clic "no hacía nada", nunca pregunté *qué apareció en pantalla*:
   miraba el tráfico de red y el DOM por selectores de asientos, no leía la
   página. Un panel de login no genera tráfico y no tiene la palabra "seat".
3. **Tenía la pieza y no la conecté.** El propio reporte de recon dice que el
   flujo de compra podía requerir cuenta (`BuyAsGuest: false` en los feature
   flags) y lista `/api/auth/providers` entre los endpoints observados. Escribí
   las dos cosas y después busqué durante ocho intentos algo que esos dos datos
   ya explicaban.

## Veredicto corregido

**El mapa de asientos existe y está detrás de una cuenta, no detrás de un muro
técnico.**

Esto cambia la clasificación del target: no es "Terrain B con el checkout
cerrado" sino **Terrain C, un portal con login**, para la mitad de compra. La
mitad de lectura sigue siendo B y abierta.

Qué implica para el CLI:

- Con una cuenta real, la ruta al mapa de asientos vuelve a estar disponible
  para reconocimiento: login por NextAuth, y desde ahí capturar el flujo de
  butacas, que es lo que hace el CLI hermano para la otra cadena.
- Sin cuenta, el corte actual del CLI (leer ocupación agregada, no reservar) es
  el correcto, pero por una razón distinta a la que decía el reporte: no es que
  el endpoint no exista, es que requiere autenticación que no tenemos.
- **La decisión de si conseguir esa cuenta es de Hunter**, no mía. Automatizar
  un login sobre una cuenta real cruza a un terreno donde el gate de
  credenciales de `surface-recon` pide autorización explícita.

## Método reusable

La escalera, de más barato a más caro, con su criterio de descarte:

| # | Intento | Costo | Se descarta cuando |
|---|---|---|---|
| 1 | Copiar el path de un cliente conocido del mismo software | minutos | 404 en todas las variantes de prefijo |
| 2 | Perseguir códigos de error inusuales | minutos | un valor absurdo produce el mismo código |
| 3 | Adivinar subdominios del proveedor | minutos | sin DNS, o mismo edge que el sitio |
| 4 | Grep de endpoints en el bundle de la ruta | ~10 min | solo aparecen rutas de UI |
| 5 | Aislar el chunk exclusivo por diferencia de sets | ~10 min | el chunk es un loader dinámico |
| 6 | Cargar la ruta directa en browser | minutos | renderiza 404 sin contexto |
| 7 | Leer el estado interno del framework | ~20 min | (siempre informativo, no descarta) |
| 8 | Llamar al handler interno con todo hookeado | ~20 min | cero requests: el corte es del proveedor |

**El escalón 8 es el que cierra la pregunta.** Mientras solo cliqueás la UI,
siempre queda la duda de si estás cliqueando mal. Cuando llamás al handler
interno con el argumento correcto y hookeás las cinco salidas posibles, la
ausencia de tráfico deja de ser ambigua.

**El escalón 2 es el que más tiempo salva.** Un código de error raro genera una
hipótesis atractiva y falsa. El control cuesta un comando.
