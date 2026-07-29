# butaca

Cartelera y disponibilidad de butacas de Cinemark Hoyts Argentina, desde la
terminal. Pensado para que lo use un agente y lo supervise una persona.

```bash
npx butaca palermo
```

```
hoy 29 jul · 5 funciones

LA ODISEA  · 2D · SUB  · 5 funciones
  butaca funciones --cine palermo --peli la-odisea
  00:40  161366   sala 2  143/143  ░░░░░░░░░░  vacía
  21:00  161314   sala 2  1/143    ██████████  casi llena
  22:00  161310   sala 8  8/102    █████████░  casi llena
  22:30  161312   sala 1  48/142   ███████░░░  casi llena
  23:00  161309   sala 6  106/141  ██░░░░░░░░  media

ocupación por hora  ▁█▆▂  00h a 23h

Ver butacas: butaca butacas 161314 --cine palermo
```

## Qué resuelve

Elegir función sin abrir el sitio: qué dan cerca tuyo, en qué formato, y cuántas
butacas quedan libres **de verdad**.

La barra es ocupación calculada sobre butacas vendidas, no el campo de estado de
la API, que dice "HIGH" hasta en salas al 98 por ciento.

## Instalación

```bash
npm i -g butaca      # o bun add -g butaca
```

Node 20 o superior. Nada de esto necesita cuenta, salvo el mapa de la sala.

## Comandos

```bash
butaca cines                       # los 24 complejos
butaca cartelera --cine palermo    # qué se está dando
butaca funciones --cine palermo    # horarios con butacas libres
butaca estrenos --cine palermo     # preventa y próximos
butaca palermo                     # atajo de "funciones --cine"
butaca schema                      # shapes JSON de cada comando, para agentes
```

Filtros de `funciones`: `--peli`, `--fecha`, `--formato`, `--idioma`, `--libres`,
`--todas`.

### El mapa de la sala

Con cuenta de Cinemark (`butaca auth login`), `butaca butacas <id> --cine <slug>`
dibuja la sala:

```
                    P A N T A L L A
   ────────────────────────────────────────────────

   171 libres de 250

1  ◼◼          ◼◼       ◼◼       ◼◼       ◼◼
2  ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼       ◼◼
3  ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼       ◼◼ ◼◼
7  ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼ ◼◼       ◼◼ ◼◼

◼ libre   ◼ ocupada   ◼ accesible   ◼ preasignada
```

Se dibuja por coordenada de grilla, así que los pasillos son huecos reales y no
columnas colapsadas. `--numeros` pone el número de butaca dentro de cada cuadro.

## Para agentes

Todo comando acepta `--json`, **y devuelve JSON automáticamente cuando stdout no
es una terminal**, sin pasar el flag.

```bash
butaca funciones --cine palermo --json | jq '.data[0]'
butaca schema butacas            # el shape exacto, sin parsear --help
```

El payload de `butacas` trae `sugeridas`: las mejores butacas libres ya
rankeadas, con el `label` listo para pasar a otro comando.

```json
{"label": "6-10", "distanciaPantalla": 0.67, "desviacionCentro": 0.05, "score": 0.96}
```

Así se recomienda sin re-derivar la geometría de la sala. Las butacas de
accesibilidad quedan fuera del ranking a propósito: son de alguien que las
necesita.

Códigos de salida: `0` bien, `1` error del usuario, `2` falla del sistema. Datos
a stdout, diagnósticos a stderr, siempre.

## Qué NO hace

**No paga.** Cinemark guarda el carrito en el navegador y no en la cuenta, así
que ninguna URL puede continuar una orden abierta desde acá. La compra se termina
en el sitio.

Existe `butaca reservar`, que toma inventario real y funciona, pero por lo
anterior su resultado no se puede pagar. Está fuera del camino principal a
propósito.

Tampoco resuelve captchas ni automatiza medios de pago.

## Cómo funciona

Habla con la misma API que usa el sitio, sin scraping de HTML.

Dos detalles que el CLI corrige y están en `CONTRACT.md`:

- Los horarios vienen marcados como UTC y en realidad son hora de Buenos Aires.
- La ocupación se calcula acá, por lo dicho arriba sobre el campo de estado.

## Desarrollo

```bash
bun install
bun test          # 194 tests, sin red
bun run src/cli.ts cines
```

`AGENTS.md` tiene las reglas del repo, cada una con el defecto real que la
originó.

## Licencia

MIT. Proyecto independiente, no afiliado a Cinemark.
