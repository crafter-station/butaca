# AGENTS.md

Reglas para cualquier agente que toque este repo. Salieron de 23 rondas de
fricción sobre este CLI, no de un template: cada una nombra el defecto que la
originó, porque una regla sin su defecto se lee como preferencia y se descarta.

`friction.md` es el registro crudo y crece; este archivo es lo que quedó.

## Antes de tocar nada

```bash
bun test          # 188 tests, sin red
npx tsc --noEmit  # src
npx tsc --noEmit -p tsconfig.test.json
npx biome check --write .
```

Los cuatro tienen que pasar antes y después. Ninguno prueba que la salida sea
correcta: para eso hay que correr el comando y leerla.

## Las reglas

### 1. Verificar es correr el comando y leer la salida

"El código se ve bien", "el typecheck pasa" y "los tests están verdes" no son
verificación. Cinco defectos de este CLI sobrevivieron a los tres.

Para lo que toca a Cinemark, correr contra el upstream real. Para lo que dibuja,
mirar el dibujo.

### 2. Ante "el elemento no existe", capturá la pantalla

Pasó tres veces en este repo: el panel de login del recon original, los horarios
de la cartelera, el botón de comprar. Las tres veces un instrumento indirecto
(network tab, selector de DOM, snapshot de accesibilidad) dijo "no existe" y el
screenshot mostró el elemento en pantalla.

Un modal abierto invalida el árbol de accesibilidad entero, así que cerrarlo es
precondición de cualquier lectura estructural.

Corolario general: **un grep vacío prueba que el patrón no matchea, no que la
cosa no exista.** Casi reporto que `--help` no listaba los comandos porque mi
patrón asumía otra indentación.

### 3. El JSON es contrato publicado; la vista humana es decisión de diseño

El modo máquina devuelve el conjunto completo, siempre, sin recortes
silenciosos. El modo humano responde la pregunta y dice qué quedó afuera y con
qué flag verlo.

Cambiar un nombre de campo del JSON rompe agentes en silencio. Cambiar la vista
humana no.

`--json` es modo de salida. Si alguna vez hace falta JSON de entrada, va con
otro nombre de flag.

### 3b. La detección de TTY es por stream, y el dist puede mentirte

`shouldColor()` miraba `stdout.isTTY` para texto que va a stderr, así que
`butaca ... | jq` dejaba los errores en gris. Datos a stdout, diagnósticos a
stderr, y **cada stream decide su propio color**. Una advertencia es un
diagnóstico: también va a stderr.

Y al diagnosticar: si el comportamiento contradice el fuente en un detalle que el
fuente no puede producir, sospechá del artefacto. El `dist/` versionado se
desincroniza en silencio.

### 4. Un comando que enumera capacidades se testea contra la lista real

`schema` cubría 3 de 8 comandos. Es el contrato que existe para que un agente no
parsee `--help`, así que un agente que pide el shape de `reservar` y recibe "no
hay esquema" concluye que el comando no existe. **Un contrato parcial es peor
que uno ausente.**

Hay un test que compara las claves de `SCHEMAS` contra los archivos de
`src/commands/`. Comando nuevo sin schema, el test falla.

### 5. Un flag documentado tiene que tener call site

Dos flags (`--open`, `--no-cache`) se parsearon y nunca se leyeron, mientras
`--help` los anunciaba. Peor que no tenerlos: el usuario cree que hay caché
salteado y no lo hay.

El chequeo es grepear el call site. Un solo hit, en la definición, significa que
está muerto.

### 6. Si la salida imprime un comando, ese comando tiene que funcionar pegado

Tres versiones del mismo error acá: butacas inventadas con formato equivocado,
butacas reales pero arbitrarias, y al final la que el proveedor preasigna.

**Y la prueba es la segunda fila, no la que emitiste.** Emitimos un comando al
pie de una tabla de 23 funciones y el usuario respondió "no tenemos forma de
saber este número": el ejemplo andaba y para las otras 22 filas no había de
dónde sacar el argumento. Un comando emitido resuelve el caso que muestra; una
columna los resuelve todos.

Cuando una columna lleva un identificador, se llama como el flag o comando que
lo consume (`butacas`, `--peli`), no por su nombre interno.

**Un formato equivocado vive en todos los docs que lo copiaron.** Arreglé
`--asientos F12,F13` en el `--help` y lo dejé intacto en README, SKILL y
TESTCASES. `grep -rn --include="*.md"` sobre el valor viejo cuesta un comando.

**Y al cambiar de dónde sale el ejemplo, revisá todo lo que lo describe.** Saqué
la butaca preasignada de la sugerencia y dejé la leyenda llamandola "la que te
asignaron": el mapa marcaba una butaca como tuya y el comando nombraba otra. Un
fix parcial en una superficie visual produce contradicción, no solo información
faltante.

### 6b. Una aclaración de por qué el comando no hace lo esperado es el bug

Construí un flag que reservaba *una* butaca preasignada, no **la que el usuario
veía en el mapa**, y mi primer reflejo fue agregar una nota explicando que sería
otra. Eso documenta la limitación en vez de resolverla. Resultó que sí se podía:
el endpoint acepta el id de la transacción que abrió el comando anterior.

Cuando el usuario pide "quiero X" y la implementación entrega "algo de la clase
de X", no está hecho.

Corolario de verificación: probá el **ciclo**, no el comando suelto. La pregunta
no era "¿reserva algo?" sino "¿la butaca que el mapa pinta es la que termina
reservada?".

### 7. Un fixture que no cruza el límite no prueba nada

Todos los fixtures compartían un día, así que un bug de ordenamiento por fecha
(`01/08` antes que `27/07`) pasó 54 tests. Los fixtures tienen que cruzar los
límites por los que el código ordena, filtra y agrupa.

Dos trampas específicas ya vividas:

- **Un fixture copiado de otro sistema del mismo tipo trae sus convenciones.**
  El nuestro usaba filas con letra porque otra cadena las usa; Cinemark las usa
  numéricas, así que el fixture coincidía con el bug del parser.
- **Un fixture que deriva un campo de otro crea un acoplamiento inexistente.**
  `sessionId: \`${nombre}-${hora}\`` hizo que un test que contaba apariciones
  del título contara también las del id.

### 8. Un test escrito desde la implementación defiende el bug

Existía `"la barra llena coincide con la etiqueta casi llena"`, que afirmaba que
50 por ciento vendido llena la barra entera: codificaba la saturación como
comportamiento deseado. Dos funciones al 54 y al 78 por ciento se dibujaban
iguales, y el test no podía fallar.

Escribir el test desde la pregunta del usuario ("¿cuál está más llena?"), no
desde lo que el código hace hoy.

### 9. Un estado que varía entre respuestas no es un atributo

`AUTO_ASIGNADA` parecía uno de los ocho estados de la sala. Pedir el mismo
recurso tres veces dio tres butacas distintas: es la que el proveedor preasigna
a esa transacción.

Chequear cuesta pedir el mismo recurso dos veces. Si el recon clasifica un valor
volátil junto a los estables, el cliente lo trata como fijo.

### 9b. "Lo probé y falla" solo cubre el camino que probaste

Casi cierro como imposible reservar la butaca preasignada: pedirla por número
devuelve NO_DISPONIBLE, y lo verifiqué. Pero eso probaba que no se puede desde
afuera. `order-set-seats` recibe el `transIdTemp`, así que dentro de su propia
orden sí la acepta (Code 0). Antes de declarar algo imposible, enumerá los
caminos que la API permite, no solo el que el CLI usa hoy.

Corolario: **un experimento que falla necesita un control que debería pasar.** Mi
primer curl falló sobre la asignada y casi lo leo como confirmación; probarlo
con una butaca libre mostró que fallaba igual, o sea el error era del payload.

### 10. Antes de afirmar un número, correr el comando que lo prueba

Vale para conteos en docs (tests, comandos, reglas) y para conclusiones sobre el
upstream. Un caso de este repo: busqué "mantenimiento" en el sitio para
confirmar una suspensión y lo encontré, en el FAQ de un programa de socios. Un
match sin su contexto no es evidencia.

### 11. Sin credenciales para separar "me bloquearon" de "está caído"

Cuando el upstream falla, reproducir sin sesión. Una falla que persiste sin
identidad no es sobre tu identidad. Acá: lectura pública en 200, `order-tickets`
anónimo en 401 antes del mensaje de suspensión, y el flujo en navegador limpio
terminando en el login normal.

## Límites que no se cruzan

- **El pago no se automatiza.** `reservar` termina devolviendo la URL de
  checkout. Los callbacks de MODO y la entrada de tarjeta cruzan a 3-D Secure
  del banco y son territorio de fraude.
- **Nada de captchas.**
- **Un prompt que lee un secreto lo enmascara desde la primera versión.** La
  primera versión de `auth login` lo mostraba en claro y una credencial real
  terminó pegada en un chat. El modo de falla no es el prompt, es lo que el
  usuario hace alrededor.
- **La contraseña no toca el disco.** Keychain, o `BUTACA_PASSWORD` del entorno.
  En config solo van identificadores.
- **`butacas` escribe.** Ver el mapa exige `POST /order-tickets`, o sea que
  correrlo diez veces deja diez transacciones abiertas en el sistema de
  Cinemark. No meterlo en un loop.
- **Los HAR se borran después de usarlos.** Llevan cookies de sesión vivas.

## Convenciones

- Español en comentarios, mensajes de usuario y commits. Inglés en `cases/`.
- **Sin em dashes** en ningún texto, código o commit.
- Comentarios solo donde el "por qué" no es obvio del código. La mayoría de los
  que hay nombran un defecto real y su verificación; sin eso, no van.
- Escribir contra la API de Node (`fs`, `path`, `process`), no contra APIs
  específicas de un runtime, para que el target de distribución siga siendo una
  decisión de build.
- Conventional commits, y sin `Co-Authored-By`.

## Al terminar una ronda

1. Anotar la fricción en `friction.md` en el momento, no al final.
2. Si el hallazgo generaliza más allá de este CLI, va a
   `cases/human-output.md` (salida para humanos) o `cases/butaca.md` (el resto).
3. Si es chequeable por código, escribir el test **y verificar que falla** al
   romper la cosa a propósito. Un test de regresión que nunca se vio fallar no
   prueba que detecte nada.
