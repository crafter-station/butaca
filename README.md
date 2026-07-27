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
butaca estrenos --cine palermo     # preventa y próximos estrenos
butaca palermo                     # atajo de "funciones --cine"
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

## Con tu cuenta: butacas y reserva

Estos necesitan cuenta de Cinemark. La contraseña va al keychain de macOS, nunca
al disco.

```bash
butaca auth login                     # guarda credenciales, abre sesión
butaca butacas 159037 --cine palermo  # dibuja el mapa de la sala
butaca reservar 159037 --cine palermo --asientos F12,F13
```

El mapa se dibuja por coordenada de grilla, así que los pasillos aparecen como
huecos reales:

```
   P A N T A L L A
   ────────────────

   187 libres de 250

 A  █ █ █   █ █ █ █ █   █ █ █
 B  █ █ █   █ █ █ █ █   █ █ █

█ libre   █ ocupada   █ accesible   █ fuera de servicio
```

Los dos comandos tienen `--dry-run`, y `reservar` pide confirmación explícita.

**Ojo con `butacas`:** ver el mapa exige abrir una orden en el sistema de
Cinemark, o sea consultar ya escribe. Correrlo diez veces deja diez
transacciones abiertas. El comando lo avisa.

**Y `reservar` toma inventario real**, bloqueando butacas que otra persona no va
a poder comprar.

## Qué no hace

**No automatiza el pago.** `reservar` termina devolviendo la URL de checkout con
la orden armada, y el pago lo hacés en el sitio.

Ese corte es deliberado: Cinemark mete 3-D Secure del banco, y automatizarlo
cruza a territorio de fraude.

## Cómo funciona

Habla con la misma API que usa el sitio de Cinemark, sin scraping de HTML.

**Dos superficies.** La de lectura (cartelera, horarios, butacas libres) es
pública: un header y nada más, sin cuenta. La de compra (mapa de asientos,
reserva) necesita tu sesión. El mapeo completo de ambas, con la evidencia, está
en `recon/`.

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
