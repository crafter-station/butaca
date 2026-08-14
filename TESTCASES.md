# Casos de prueba manuales

Comandos encadenados para correr a mano. **Todos verificados contra la API en
vivo** antes de escribir este archivo, salvo los marcados como "no verificable
en seco", que dependen de una condición que no se puede forzar.

Requiere `butaca` linkeado (`bun link` en el repo) y `jq`.

## 1. Descubrimiento: de cero a una función concreta

El recorrido que hace alguien que nunca usó el CLI.

```bash
butaca                                    # bare invoke: banner + ayuda, exit 1
butaca cines                              # 24 complejos por región
butaca palermo                            # atajo: funciones de hoy
butaca cartelera --cine palermo           # qué se está dando
butaca funciones --cine palermo --peli la-odisea
```

**Qué mirar:** que cada pantalla te deje el comando siguiente listo para copiar.
En `cines` es la última columna (`butaca palermo`), en `cartelera` la columna
`--peli`, en `funciones` el comando bajo cada título.

## 2. Encadenado con jq: la mejor función de hoy

```bash
butaca palermo --json | jq -r 'first(.data[] | select(.seats.pct < 80))
  | "\(.dateTime) \(.movie.name) libres=\(.seats.available)"'
```

Verificado, devuelve una línea del tipo:
`27/07/2026 14:00 TOY STORY 5 libres=107`

**Qué mirar:** que salga JSON sin pasar `--json`... **no**. Acá `--json` es
necesario porque `butaca palermo | jq` ya sale JSON al no haber TTY, pero
escribirlo explícito es lo correcto en un script.

Probá también sin el flag para confirmar el default:

```bash
butaca palermo | jq '.data | length'      # debe dar un número, no fallar
```

## 3. Comparar el mismo título entre cines

```bash
for c in palermo abasto caballito; do
  butaca funciones --cine "$c" --peli la-odisea --json 2>/dev/null \
    | jq -r --arg c "$c" '[.data[] | select(.displayDate=="'"$(date +%F)"'")] | "\($c): \(length) funciones"'
done
```

Verificado: `palermo: 12`, `abasto: 16`, `caballito: 8`.

**Qué mirar:** que un cine sin esa película no rompa el loop (devuelve `0` o un
error con `code`, no una excepción de `jq`).

## 4. Estrenos: de la lista al detalle

```bash
butaca estrenos --cine palermo                          # tarjetas + próximos
butaca estrenos spider --cine palermo                   # match parcial
butaca estrenos --peli spider-man-un-nuevo-dia --cine palermo   # slug exacto
```

Los tres últimos deben llevar a la **misma** vista de detalle.

**Por qué hay dos formas para lo mismo:** la tarjeta de cada estreno imprime
`--peli <slug>`, y lo que el CLI te muestra tiene que funcionar pegado tal cual.
Pero escribir `estrenos spider` es más corto y también sirve. Las dos hacen
match parcial contra slug y título, así que estas cuatro son equivalentes:

```bash
butaca estrenos spider --cine palermo
butaca estrenos spider-man-un-nuevo-dia --cine palermo
butaca estrenos --peli spider --cine palermo
butaca estrenos --peli spider-man-un-nuevo-dia --cine palermo
```

Si venís de `funciones` o `cartelera`, `--peli` mantiene la convención.

```bash
butaca estrenos --json | jq -r '.data.presale[] | "\(.slug) en \(.diasParaEstreno) días"'
```

Verificado: `spider-man-un-nuevo-dia en 2 días`, etc.

## 5. Los errores, que es lo que más importa

Cada uno debe dar **exit code** correcto y un envelope con `code` y `hint`.

```bash
butaca funciones --cine noexiste --json | jq -r '.error.code, .error.hint'
# NOT_FOUND / "Corré `butaca cines` para ver los slugs disponibles."   exit 1

butaca estrenos zzzznoexiste --json | jq -r '.error.code'
# NOT_FOUND                                                            exit 1

butaca palermo --fields hora --json | jq -r '.error.hint'
# lista los campos válidos del shape JSON                              exit 1

butaca funciones --json | jq -r '.error.message'
# "funciones necesita --cine <slug>"                                   exit 1

butaca comandoinvalido
# error a stderr, exit 1
```

**Qué mirar, y es el caso que encontró un bug preparando este archivo:** en
`--json` el envelope de error tiene que salir por **stdout**, no por stderr. Si
`| jq` no ve nada, el agente perdió el `code` y el `hint`.

Comprobalo así:

```bash
butaca funciones --cine noexiste --json 2>/dev/null | jq -r '.error.code'
# tiene que imprimir NOT_FOUND, no quedar vacío
```

Y el exit code, por separado:

```bash
butaca funciones --cine noexiste --json >/dev/null 2>&1; echo "exit=$?"   # 1
butaca cines --json >/dev/null 2>&1; echo "exit=$?"                      # 0
```

## 6. Contrato de agentes

```bash
butaca schema --json | jq -r '.data | keys[]'      # cines, cartelera, funciones
butaca schema funciones --json | jq '.data.funciones.notes'
```

Las `notes` deben mencionar las dos trampas del upstream: que `seats.pct` lo
calcula butaca, y que `dateTime` es hora local de Buenos Aires.

```bash
butaca cines --fields slug,name --json | jq -r '.data[0] | keys | length'   # 2
```

## 7. Los flags que casi quedan muertos

Ambos fueron encontrados sin cablear por el gate de Phase 5, así que son los que
más vale reprobar.

```bash
# --no-cache: saltea el caché de 60s del CDN
butaca cines --json | jq -r '.meta.cached'
butaca cines --no-cache --json | jq -r '.meta.cached'

# --open: abre el link de compra
butaca palermo --libres 200 --open
# debe imprimir "Abriendo cinemark.com.ar/pelicula/...?cine=palermo" y abrir el navegador
```

Sin `--open`, la última línea muestra el link y dice `--open lo abre`.

**El link tiene que llevar `?cine=`**, que está verificado que preselecciona el
complejo, y **nunca** `?fecha=`, que el sitio ignora.

## 8. Presentación humana

Con TTY (corrélos directo en la terminal, sin pipe):

```bash
butaca palermo                    # agrupado por película, barras, sparkline
butaca palermo --todas            # todos los días, no sólo el primero
butaca palermo --fecha 2026-07-29 # un día puntual
NO_COLOR=1 butaca palermo         # sin color, columnas siguen alineadas
butaca --help                     # banner con gradiente + ayuda a color
NO_COLOR=1 butaca --help          # banner en texto plano
```

**Qué mirar:**
- El título de cada película aparece **una vez**, no una por fila.
- Si toda la película va en un solo formato e idioma, esas columnas desaparecen
  (comparalo con una que varíe, como Spider-Man el 29/07).
- Las barras crecen con lo **vendido**: verde vacía, ámbar llenándose, roja casi
  llena.
- Con `NO_COLOR=1` las columnas siguen alineadas (el ancho se mide ignorando los
  escapes ANSI).

## 9. Superficie autenticada

Estos comandos necesitan cuenta de Cinemark. **Sin sesión todos deben fallar
limpio y rápido, nunca colgarse pidiendo input.**

> **Nota de shell:** si armás un `for` con `$(butaca ... | jq ...)` anidado, la
> sustitución puede comerse la salida y hacer parecer que el CLI no devuelve
> nada. Redirigí a un archivo y corré `jq` sobre él, o probá los comandos de a
> uno. Me pasó preparando estos casos y perdí varios minutos creyendo que había
> un bug en el CLI.

### 9.1 Sin sesión

```bash
butaca auth status --json | jq -r '.error.code'
# AUTH_REQUIRED                                                        exit 1

butaca butacas 159037 --cine palermo --json | jq -r '.error.code'
# AUTH_REQUIRED                                                        exit 1

butaca reservar 159037 --cine palermo --asientos 7-12 --json | jq -r '.error.code'
# AUTH_REQUIRED                                                        exit 1
```

**Qué mirar:** que ninguno tarde más de unos segundos. Un CLI que se queda
esperando una contraseña en un pipe es el peor modo de falla posible.

### 9.2 El dry-run no debe tocar nada

```bash
rm -rf ~/.butaca
butaca butacas 159037 --cine palermo --dry-run --json | jq -c '.data.steps'
ls ~/.butaca 2>/dev/null || echo "correcto: no escribió nada"
```

`butacas --dry-run` explica los tres pasos que haría y **no abre orden**. Es la
diferencia con `reservar --dry-run`, que sí necesita sesión porque ejercita el
camino real contra el mapa.

### 9.3 Login

```bash
butaca auth login                      # pide email y contraseña por TTY
butaca auth status --json | jq -r '.data.email'
security find-generic-password -s butaca -a TU_EMAIL -w   # la contraseña está en el keychain
cat ~/.butaca/config.json | jq 'has("password")'          # false: nunca en disco
ls -l ~/.butaca/config.json                               # permisos 600
```

**Qué mirar:** que `config.json` tenga **solo** email, cookie y expiración. La
contraseña vive en el keychain de macOS, nunca en el archivo.

### 9.4 El mapa de butacas

```bash
butaca butacas 159037 --cine palermo
```

**Qué mirar:**
- Bloques de color: blanco libre, rojo ocupada, azul accesible, gris fuera de
  servicio.
- **Los pasillos son huecos reales.** Si la sala tiene pasillo central, tiene que
  verse el espacio. Se dibuja por coordenada de grilla justamente para eso.
- Encabezado `P A N T A L L A` arriba y el conteo `N libres de M`.

```bash
NO_COLOR=1 butaca butacas 159037 --cine palermo
```

Sin color **cambia de representación**, no se apaga: los bloques pasan a ser
`· x O W a / #`. Ocho bloques grises idénticos no distinguirían nada.

```bash
butaca butacas 159037 --cine palermo --json | jq '.data.summary'
butaca butacas 159037 --cine palermo --json | jq '.data.areas[0].seats[0]'
```

El shape JSON expone **las dos representaciones** de cada asiento: `row`/`number`
(la etiqueta que lee el humano) y `gridRow`/`gridNumber` (la coordenada que exige
la API de reserva). Esconder las coordenadas obligaría al agente a re-derivarlas.

**Ojo, esto abre una orden en el sistema de Cinemark.** Correrlo diez veces deja
diez transacciones abiertas. El comando lo avisa.

### 9.5 La reserva

```bash
butaca reservar 159037 --cine palermo --asientos 7-12,7-13 --dry-run
```

Valida los asientos contra el mapa real **sin reservar**. Probá con un asiento
inexistente y con uno ya vendido: los dos tienen que fallar con un mensaje que
diga cuál y por qué.

```bash
butaca reservar 159037 --cine palermo --asientos 7-12,7-13
```

Pide confirmación explícita. **Esto bloquea butacas de verdad**, que otra persona
no va a poder comprar.

```bash
echo "" | butaca reservar 159037 --cine palermo --asientos 7-12 --json
```

Sin TTY y sin `--yes` debe **fallar**, no colgarse ni reservar por default.

### 9.6 La butaca preasignada

```bash
butaca butacas 159037 --cine palermo --json | jq '[.data.areas[].seats[] | select(.statusId==5) | "\(.row)-\(.number)"]'
```

Corré eso tres veces: **la butaca tiene que cambiar en cada corrida**. Es la que
Cinemark preasigna a cada orden, no un atributo de la sala.

```bash
butaca reservar 159037 --cine palermo --asientos <la-de-arriba> --dry-run
```

Tiene que fallar con `SEATS_UNAVAILABLE` y estado `AUTO_ASIGNADA`: ese número
pertenece a la orden que abrió `butacas`, no a la que abre `reservar`.

```bash
butaca reservar 159037 --cine palermo --asignada --dry-run
```

Tiene que dar `ok: true` con `wouldHold`. Resuelve la preasignada **dentro** de
la orden que este comando abre, que es el único camino que la reserva. Corriéndolo
dos veces, la butaca del resultado cambia sola.

```bash
butaca reservar 159037 --cine palermo --json
```

Sin `--asientos` ni `--asignada` debe fallar con `BAD_INPUT` nombrando los dos.

```bash
cat ~/.butaca/audit/*.jsonl | jq -c 'select(.status=="pending")' | tail -2
```

El audit log escribe `pending` **antes** de la llamada de red y lo resuelve
después con el mismo id. Si el proceso muere a mitad, queda el pending como
evidencia en vez de silencio.

## 10. Lo que sigue sin existir

```bash
butaca comprar     # comando desconocido, exit 1
butaca pagar       # comando desconocido, exit 1
butaca checkout    # comando desconocido, exit 1
```

`reservar` devuelve `browserCheckoutAvailable: false` y un `siteUrl` que no
preserva la orden. El pago no se automatiza: cruza a 3-D Secure del banco y es
territorio de fraude.

```bash
butaca --help | tail -3
```

El cierre del help tiene que decir qué cubre el CLI y qué no.

## 11. Higiene de streams

```bash
butaca 2>/dev/null | wc -c            # 0: bare invoke no ensucia stdout
butaca --help 2>/dev/null | wc -c     # > 0: --help explícito sí es salida
butaca cines 2>/dev/null | jq . >/dev/null && echo "stdout limpio"
```

El banner va siempre a **stderr**, así que ningún pipe lo ve.

## 12. El artefacto publicado

```bash
cd /path/al/repo
bun run build
node dist/cli.js cines --json | jq '.data | length'   # 24, bajo node plano
npm pack --dry-run                                     # 4 archivos
head -1 dist/cli.js                                    # #!/usr/bin/env node
```

**Qué mirar:** que corra bajo `node` y no sólo bajo `bun`. Es el chequeo que se
saltea y el que rompe la primera instalación de un usuario.

## No verificable en seco

Dependen de una condición que no se puede forzar:

- **`QUEUED`**: sólo aparece si Cloudflare Waiting Room está activo, que pasa en
  preventas grandes. El código lo detecta por la cookie `__cfwaitingroom`.
- **`RATE_LIMITED`**: 25 requests seguidos no lo dispararon. Puede que no exista.
- **`NETWORK_ERROR`**: forzable cortando la red a mitad de un comando.
- **Ocupación alta real**: los estados "casi llena" aparecen en estrenos de
  noche. Probá `butaca palermo --fecha <día de estreno>` para verlos.
