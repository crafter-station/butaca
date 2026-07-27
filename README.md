# butaca

Cartelera y disponibilidad de butacas de Cinemark Hoyts Argentina, desde la
terminal.

```bash
butaca palermo
```

```
fecha  hora   pelicula                  sala  formato  idioma  libres  capacidad  pct
-----  -----  ------------------------  ----  -------  ------  ------  ---------  -----
27/07  11:30  LA ODISEA                 4     2D       SUB     247     250        98.8%
27/07  13:10  SPIDER-MAN: UN NUEVO DÍA  9     2D       SUB     246     250        98.4%
```

## Qué resuelve

Encontrar la función que te sirve sin abrir el sitio: qué dan cerca tuyo, en qué
formato, y cuántas butacas quedan libres de verdad.

## Instalación

```bash
npm install -g butaca
```

Necesitás Node 20 o superior.

## Comandos

```bash
butaca cines                       # los 24 complejos
butaca cartelera                   # qué se está dando
butaca cartelera --cine palermo    # qué se está dando en un complejo
butaca funciones --cine palermo    # horarios con butacas libres
butaca palermo                     # atajo de lo anterior
butaca schema                      # shapes de cada comando, para agentes
```

### Filtros

```bash
butaca funciones --cine palermo --peli la-odisea
butaca funciones --cine palermo --fecha 2026-07-28
butaca funciones --cine palermo --formato 3D
butaca funciones --cine palermo --idioma SUB
butaca funciones --cine palermo --libres 100   # solo funciones con 100+ butacas
```

### Para agentes y scripts

Sale JSON automáticamente cuando la salida no es una terminal, sin necesidad de
pasar `--json`:

```bash
butaca funciones --cine palermo | jq '.data[] | select(.seats.pct < 50)'
butaca cines --fields slug,name --json
```

Envelope estable en todos los comandos:

```json
{ "ok": true, "data": [], "meta": { "source": "...", "fetchedAt": "...", "nextSteps": [] } }
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "hint": "..." } }
```

Códigos de salida: `0` todo bien, `1` error tuyo, `2` falla del sistema o de la
API.

## Qué no hace

**No compra entradas.** No reserva butacas y no automatiza el pago.

No es una decisión de alcance sino un hallazgo: el flujo de compra de Cinemark
no expone ningún endpoint de asientos ni de reserva observable. El detalle, con
la evidencia, está en `recon/report.md`.

Para comprar, `butaca` te dice qué función te conviene y el resto lo hacés en el
sitio.

## Cómo funciona

Lee la API pública que usa el propio sitio de Cinemark. Sin credenciales, sin
cuenta, sin scraping de HTML. Solo lecturas de datos que ya son públicos.

Dos detalles que importan y están documentados en `CONTRACT.md`:

- Los horarios vienen marcados como UTC y en realidad son hora de Buenos Aires.
  `butaca` los muestra bien.
- El porcentaje de ocupación lo calcula `butaca`, porque el campo de estado que
  devuelve la API dice "HIGH" incluso en salas al 98 por ciento.

## Desarrollo

```bash
bun install
bun test
bun run src/cli.ts cines
```

## Licencia

MIT
