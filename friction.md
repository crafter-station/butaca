# Friction log: butaca build

Skill under test: cli-build 0.2.0 (candidate). First end-to-end run.
Opened before Phase 1, per the skill.

## Entries

### Ronda 21 (2026-07-28, auditoría de docs: los ejemplos no compilaban)

- [cli-build] **Tres docs de usuario daban un ejemplo que falla al pegarlo.**
  `README.md`, `SKILL.md` y `TESTCASES.md` documentaban `--asientos F12,F13`,
  formato que esta cadena **no acepta**: sus filas son numéricas. Es la misma
  herencia del contrato inicial que arreglé en el `--help` la ronda pasada, y
  arreglé solo el `--help`. **Un formato equivocado no vive en un lugar: vive en
  todos los que lo copiaron del contrato original.** El grep que lo encuentra
  (`grep -rn "F12" --include="*.md"`) cuesta un comando y no lo corrí hasta que
  Hunter preguntó si la doc estaba al día.
- [cli-build] **`--asignada` no estaba en ningún doc de usuario.** Estaba en
  `CONTRACT-AUTH.md` y en `AGENTS.md`, o sea en los docs que escribo para mí, y
  faltaba en los tres que lee alguien más. Agregado, con la explicación de por
  qué no se puede pedir por `--asientos`, que es el punto no obvio.
- [cli-build] **La copia del vault estaba stale, como estaba anunciado.** El case
  ya decía "`TESTCASES.md` en el vault es copia, no symlink, y va a driftear", y
  drifteó. Escribir la predicción no la evita. Convertido en symlink relativo
  (per la convención de symlinks: intra-repo relativo, cross-repo absoluto; acá
  cruza repos pero apunta desde el vault a un path bajo `~/Programming`, así que
  el relativo sobrevive un rename del vault y no un rename de `Programming`).
- [cli-build] **Los casos nuevos de TESTCASES se verificaron antes de
  escribirlos.** Los tres que agregué para `--asignada` (la ámbar cambia por
  corrida, pedirla a mano falla, `--asignada` funciona) se corrieron primero
  contra el upstream: `12-16`, `13-1`, `13-4` en tres lecturas, y `ok: true` con
  butacas distintas en dos dry-runs. Un archivo de casos manuales que nadie corrió
  es una lista de deseos.

### Ronda 20 (2026-07-28, la asignada sí era reservable)

- [cli-build] **Casi respondo "no se puede" sin probarlo.** Hunter preguntó cómo
  quedarse con la butaca ámbar. Mi modelo era claro: pertenece a una orden que
  muere, y pedirla por número devuelve `NO_DISPONIBLE`, lo cual **verifiqué**.
  Pero eso prueba que no se puede pedir **desde afuera**, no que no se pueda.
  `order-set-seats` recibe el `transIdTemp` en el payload, así que la pregunta
  real era si dentro de **su propia** orden la acepta. Probado con curl: `Code 0`,
  la reserva. **Sí se podía.**
  **Regla:** "lo verifiqué y falla" solo cubre el camino que probaste. Antes de
  cerrar una capacidad como imposible, enumerar los caminos que la API permite,
  no solo el que el CLI usa hoy. Un endpoint que recibe el id de la transacción
  está diciendo que se puede operar dentro de una transacción existente.
- [cli-build] **Mi primer curl falló y casi lo leo como respuesta.** El primer
  intento devolvió `error_order_seat_seats` sobre la asignada, y estuve a un
  paso de anotarlo como confirmación de que no se podía. Lo salvó probar también
  con una butaca **libre**: falló idéntico, o sea el error era mío (faltaban
  `areaCatCode` y `areaNumber`). **Un experimento que falla necesita un control
  que debería pasar**, si no se confunde "el sistema no lo permite" con "mi
  request está mal".
- [cli-build] **`--asignada` no puede ser un valor de `--asientos`.** El número
  cambia por orden, así que ninguna etiqueta escrita por el usuario puede
  nombrarla: para cuando la tipea, ya es de otra orden. Se resuelve **adentro**,
  contra el mapa que `reservar` ya lee de su propia orden. Es un caso donde el
  flag no es azúcar sintáctico de otro flag: es el único camino posible.
  El validador sigue rechazando el estado 5 pedido a mano (verificado), y lo
  acepta solo por este camino.
- [cli-build] **El `--help` documentaba un formato que esta cadena no usa.**
  Decía `--asientos F12,F13`, herencia del contrato inicial escrito antes de
  saber que Cinemark numera las filas. Un usuario que copiaba el ejemplo del help
  recibía "no tiene el formato fila+número". Corregido a `7-12,7-13` en el help y
  en el hint del error.

### Ronda 19 (2026-07-28, la leyenda prometía algo falso)

- [cli-build] **Arreglé el comando y dejé la pantalla contradiciéndose.** En la
  ronda 18 saqué la butaca preasignada de la sugerencia, así que el comando pasó
  a decir `2-30` mientras el mapa seguía pintando de ámbar la `12-16` con la
  etiqueta **"la que te asignaron"**. Hunter preguntó lo obvio: cuál está
  seleccionada, y si la tabla estaba desactualizada. Ninguna de las dos: la
  tabla estaba bien y el comando también, **la leyenda mentía**.
  "La que te asignaron" implica que es tuya y reservable, y es lo contrario: la
  preasigna la orden que se abre para leer el mapa, y esa orden muere en cuanto
  corrés `reservar`. Corregido a **"tomada por otra orden"**, que es lo que
  efectivamente es desde el punto de vista de la reserva siguiente.
  **Regla:** al arreglar la fuente de un dato hay que revisar todo lo que lo
  describe. Cambié la lógica y dejé intacta la etiqueta que la explicaba, así
  que la pantalla quedó peor que antes: antes era un ejemplo que fallaba, después
  fueron dos afirmaciones incompatibles en la misma vista. **Un fix parcial en
  una superficie visual produce contradicción, no solo información faltante.**
- [cli-build] **El comando sugerido salía pelado y se leía como una selección.**
  Sin ninguna palabra alrededor, `butaca reservar ... --asientos 2-30` parece
  "esto es lo que elegiste", que es justo lo que chocaba con el ámbar. El CLI no
  tiene selección: se pide lo que se quiere. Ahora lo dice: *"Ninguna está
  elegida todavía. Ejemplo con una libre:"*.
  **Regla:** un ejemplo sin etiqueta se lee como estado. Si la interfaz no tiene
  el concepto de "seleccionado", hay que decirlo, porque el usuario llega con ese
  modelo mental desde cualquier app de cine.

### Ronda 18 (2026-07-28, la sugerencia se autodestruía, y AGENTS.md)

- [cli-build] **El comando sugerido fallaba justo por ser el "mejor" ejemplo.**
  En la ronda 15 cambié la sugerencia de "primera butaca libre" a "la que
  Cinemark preasigna", razonando que era la honesta porque es la que el sitio te
  deja marcada. Hunter pegó el comando emitido y recibió
  `"12-16" no está disponible (estado: NO_DISPONIBLE)`, y preguntó si era caché.
  No era caché. **La preasignada pertenece a la orden que la creó y muere con
  ella:** `reservar` abre una orden nueva, recibe otra preasignada, y la anterior
  vuelve al mapa como no disponible. Medido con tres llamadas seguidas a la misma
  función: `13-4`, `13-6`, `13-8`, cada una con su `transIdTemp`.
  O sea el comando emitido era irreproducible **por construcción**: el acto de
  ejecutarlo invalidaba su propio argumento. Vuelve a sugerir una butaca libre,
  que sigue libre en la orden siguiente salvo que alguien la compre en el medio,
  que es un fallo honesto y no uno que fabricamos nosotros.
  **Regla:** un ejemplo emitido tiene que sobrevivir al comando que lo consume.
  Si el argumento sale de un estado ligado a la transacción actual, la próxima
  transacción lo invalida. La prueba no es "¿existe este valor?" sino "¿sigue
  existiendo después de que corran lo que le sugiero?".
  Y la ironía: la ronda 15 anotó "un estado que varía entre respuestas no es un
  atributo del recurso", entendí que era volátil, y **igual lo usé como
  argumento estable**. Reconocer que un dato es efímero y después usarlo como si
  no lo fuera son dos pasos distintos.
- [cli-build] **`--dry-run` exigía `--yes`.** El gate de confirmación corría
  antes de la rama de dry-run, así que previsualizar sin terminal interactiva
  pedía la bandera que saltea confirmaciones. Un dry-run no toma inventario ni
  deja nada reservado, así que el gate no aplica; peor, obligaba a acostumbrarse
  a tipear `--yes`, que es exactamente lo que el gate quiere evitar. Verificado
  que la reserva real sigue bloqueada sin confirmación.
- [cli-build] **Escrito `AGENTS.md`.** Idea de Hunter: un CLI nuevo debería
  arrancar con AGENTS.md para que los lineamientos sobrevivan a la iteración en
  la que se aprendieron. Las 80 entradas de este friction se destilaron en 11
  reglas, cada una nombrando el defecto que la originó, más límites que no se
  cruzan (pago, captchas, secretos, escrituras) y el cierre de ronda.
  El criterio para incluir una regla fue que hubiera evitado un defecto real de
  este repo. El criterio para no incluirla: que ya esté cubierta por un test, que
  es una guarda más fuerte que un párrafo.

### Ronda 17 (2026-07-27, auditoría de documentación: el schema mentía)

- [cli-build] **`schema` cubría 3 de 8 comandos.** Pedirle el shape de
  `estrenos`, `butacas`, `reservar`, `auth` o del propio `schema` devolvía
  `BAD_INPUT: No hay esquema para el comando "X"`. Los tres cubiertos eran los
  del día 1; los cinco que faltaban se agregaron en rondas posteriores y nadie
  volvió al archivo.
  Esto es peor que las otras deudas de doc porque **`schema` es el contrato que
  la skill pide justamente para que un agente no tenga que parsear `--help`**.
  Un agente que consulta el shape de `reservar` y recibe "no hay esquema" no
  concluye "la doc está incompleta", concluye **"el comando no existe"**, que es
  exactamente el fallo que el comando existe para prevenir. Un contrato
  incompleto es peor que uno ausente: sin `schema` el agente lee `--help`, con
  un `schema` parcial confía y se equivoca.
  **Regla:** un comando que enumera capacidades tiene que derivarse o testearse
  contra la lista real. Cubierto con un test que compara las claves de `SCHEMAS`
  contra los archivos de `src/commands/`, verificado quitando una entrada a
  propósito para confirmar que falla.
- [cli-build] **`--help` estaba completo y mi primer grep dijo que no.** Busqué
  comandos con `grep -E "^  [a-z]+"` y no matcheó nada, así que casi anoto
  "`--help` no lista los comandos" como hallazgo. La indentación real era
  distinta. **Un grep que devuelve vacío prueba que el patrón no matchea, no que
  la cosa no exista**, y es el mismo error de forma que el "mantenimiento" del
  FAQ: leer la salida del instrumento como si fuera el hecho.
- [cli-build] **`estrenos` faltaba en el README** aunque estaba en `--help`, en
  `SKILL.md` y en el código. Se agregó en una ronda cuyo foco era otro. Es la
  deuda de doc menos grave de las tres, porque el README es para humanos y el
  humano tiene `--help` al lado.

### Ronda 16 (2026-07-27, la barra saturada y el comando que faltaba)

- [cli-build] **Una escala recortada satura y deja de informar justo donde
  importa.** `barraOcupacion` escalaba hasta el 50 por ciento vendido, no hasta
  el 100, para "coincidir con los cortes de `ocupacionDe`". Consecuencia medida
  en salida real: la función de las 17:50 (54 por ciento vendido) y la de las
  18:50 (78 por ciento) dibujaban **la misma barra llena**. Toda función arriba
  del corte se veía idéntica, o sea la barra distinguía bien entre salas vacías
  y dejaba de distinguir entre las que se están llenando, que es exactamente
  donde el dato sirve para elegir.
  **Regla:** una barra y una etiqueta categórica no tienen que compartir escala.
  La etiqueta traduce a palabras y ahí vive el corte; la barra muestra magnitud y
  quiere el rango completo. Atarlas convierte a la barra en una versión peor de
  la etiqueta. Es el reverso exacto de la regla 2 (umbrales medidos): allá el
  problema era una escala mal calibrada, acá una escala truncada, y las dos veces
  el síntoma es el mismo, una columna donde casi todo se ve igual.
- [cli-build] **El test protegía el bug.** Existía
  `"la barra llena coincide con la etiqueta casi llena"`, que afirmaba que 50 por
  ciento vendido llena la barra entera: o sea codificaba la saturación como
  comportamiento deseado. Un test escrito desde la implementación en vez de desde
  la pregunta del usuario ("¿cuál está más llena?") no falla cuando la
  implementación está mal, la defiende. Reescrito como discriminación entre dos
  funciones reales.
- [cli-build] **`funciones` no decía cómo seguir.** Terminaba con el link de
  compra al sitio, herencia de cuando el CLI era read-only, y nunca mencionaba
  `butacas`. El `sessionId` que ese comando necesita no aparece en ninguna
  columna de la tabla, así que el usuario veía 23 horarios sin ninguna forma de
  pasar al siguiente paso desde la pantalla que estaba mirando. Es la regla 5
  (emitir el comando, no el argumento) sin aplicar en el comando más usado.
  Ahora emite `butaca butacas <id> --cine <slug>` con una función real de la
  lista, la más próxima que todavía no empezó y tiene butacas.
- [cli-build] **Emitir el comando no alcanza si el argumento no está en la
  tabla.** Hunter lo vio de inmediato: "no tenemos forma de saber este num
  161364". El pie daba un comando ejecutable para **una** función, y para
  cualquier otro horario de las 23 el usuario no tenía de dónde sacar el
  número. O sea el ejemplo funcionaba y la tabla seguía siendo un callejón.
  Corregido con una columna `butacas` con el id de cada función, nombrada como
  el comando que la consume y no como `sessionId`, y con el pie diciendo dónde
  buscar el resto.
  **Regla (extiende la 5):** un comando emitido resuelve el caso que muestra;
  una columna resuelve todos. Si la fila de al lado no puede llegar a su propio
  comando, falta el identificador en la tabla, no un ejemplo mejor. La prueba es
  preguntar por la segunda fila, no por la que emitiste.
- [cli-build] **Un fixture derivado del nombre rompió una aserción que contaba
  nombres.** El helper de tests armaba `sessionId: \`${nombre}-${hora}\``, así
  que al agregar el id a la tabla el título pasó a aparecer también dentro del
  identificador y el test "el título aparece una sola vez" contó tres. El fallo
  era del fixture, no del código. **Un fixture que deriva un campo de otro crea
  un acoplamiento que no existe en los datos reales**, y las aserciones que
  cuentan ocurrencias de texto lo cobran en cuanto el campo derivado se muestra.

### Ronda 15 (2026-07-27, la butaca ámbar era la respuesta)

- [surface-recon] **Hunter preguntó qué era el color ámbar y resultó ser el dato
  más útil del mapa.** Yo lo había mapeado como `AUTO_ASIGNADA`, un estado más
  de los ocho, y lo dibujaba sin pensarlo. Su pregunta ("¿no es la que estás
  seleccionando?") me hizo verificarlo: **cambia en cada orden.** Tres órdenes
  seguidas sobre la misma función dieron `12-5`, `12-4` y `10-8`.
  No es un atributo de la sala sino **la butaca que Cinemark preasigna a esa
  transacción**, o sea la que el sitio te deja marcada al entrar. Pasó de ser un
  color raro a ser la sugerencia por defecto del comando de reserva.
  **Regla:** un estado que varía entre respuestas del mismo recurso no es un
  atributo del recurso. Si el recon lo clasifica junto a los demás sin verificar
  su estabilidad, el cliente lo trata como fijo y pierde su significado. Chequear
  es pedir el mismo recurso dos veces.
- [cli-build] **La sugerencia era correcta pero no la mejor.** Tomaba las dos
  primeras butacas libres del mapa, que es honesto (existen, están libres) y
  arbitrario. Ahora sugiere la auto-asignada, que es la que el usuario vería
  marcada en el sitio, con fallback a la primera libre si no hay ninguna.
- [upstream] **Cinemark cortó la venta online, y no fuimos nosotros.** Primero
  sospeché que era reacción a las órdenes seguidas que abrí probando. Verificado
  con curl directo: el mismo POST falla igual, y `get-prices` y la lectura
  pública siguen en 200. **El corte es del backend y afecta solo
  `order-tickets`.** Lunes 16:54, o sea ni siquiera es horario nocturno.
  No hay flag en su config ni código de error propio: `CNK_FEATURE_FLAGS` no
  trae nada de mantenimiento, y el código es el genérico `error_order_new`. **El
  texto del mensaje es el único indicador**, así que el CLI ahora lo detecta y
  cambia el hint: dice que no es problema del CLI, que consultar sigue andando y
  que pruebe más tarde, en vez del genérico "puede ser un problema temporal".
  **Regla:** cuando un upstream comunica un estado operativo solo por texto libre
  y no por código, vale reconocerlo explícitamente. Un hint genérico manda al
  usuario a debuggear su propia instalación por algo que está del otro lado.
  **Confirmado del lado del sitio:** Hunter llegó al checkout en su navegador y
  Cinemark le mostró **el mismo texto exacto** en un banner rojo. La sospecha de
  que nos hubieran baneado por la cadencia de órdenes de prueba queda descartada
  con evidencia de los dos lados: el CLI y el sitio propio dicen lo mismo.
- [surface-recon] **Descartar un ban se hace con una prueba anónima, no
  razonando.** La pregunta era si el corte era nuestro o de todos. Tres medidas
  desde la misma IP la contestan: la lectura pública sigue en 200 (no hay bloqueo
  por IP), `order-tickets` sin credenciales responde **401 antes** de llegar al
  mensaje de suspensión (el filtro de sesión corre primero, así que el mensaje
  no depende de nuestra cuenta), y el flujo de compra en un navegador limpio, sin
  cookies ni sesión, termina en el panel de login normal en vez de un bloqueo.
  **Regla:** para separar "me bloquearon a mí" de "está caído para todos",
  reproducí sin credenciales. Un fallo que persiste sin identidad no es sobre tu
  identidad.
- [cli-build] **Tercera vez que el DOM me miente y el screenshot me corrige.**
  Buscando los horarios en la cartelera, mi selector no encontró ninguno: el
  texto es `19:20hs` y yo comparaba contra `19:20`. Y el `snapshot` de
  accesibilidad devolvía **solo el banner de cookies**, porque es modal y tapa el
  árbol entero, lo que leí como "la página no tiene horarios". Las tres veces
  (login del recon original, este caso, y el botón de comprar) el instrumento
  indirecto dijo "no existe" y la captura mostró el elemento en pantalla.
  **Regla:** ante un "no encuentro el elemento" en una página que el usuario ve
  funcionando, la captura va primero, no después de agotar los selectores. Y un
  modal abierto invalida el árbol de accesibilidad completo, así que cerrarlo es
  precondición de cualquier lectura estructural.
- [cli-build] **Falsa alarma que casi documento como hallazgo.** Busqué la
  palabra "mantenimiento" en el home del sitio para confirmar el corte y la
  encontré: era del FAQ de Cinemark Club ("no tiene costo de mantenimiento
  mensual"). Estuve a un paso de concluir que el sitio anunciaba la suspensión.
  Un grep de una palabra sobre una página entera no es evidencia; mirar el
  contexto alrededor del match costó un comando y desarmó la conclusión.

### Ronda 14 (2026-07-27, la leyenda incompleta y el preview que no previsualizaba)

- [cli-build] **Una leyenda fija miente en las dos direcciones.** Tenía cuatro
  entradas hardcodeadas de los ocho estados posibles, así que la sala mostraba
  una butaca ámbar (`AUTO_ASIGNADA`, había exactamente una) sin entrada que la
  explicara, y a la vez listaba "fuera de servicio" cuando no había ninguna.
  Ahora se arma desde los estados **presentes en esa sala**. **Regla:** una
  leyenda derivada de los datos no puede quedar desactualizada; una escrita a
  mano se desincroniza en cuanto el upstream usa un estado que no previste.
- [cli-build] **El "preview" de `reservar` confirmaba el input, no el
  resultado.** Preguntaba "vas a reservar 2-4, ¿confirmás?" repitiendo lo que el
  usuario acababa de tipear, **antes** de resolver esas etiquetas contra el mapa.
  O sea confirmabas tu propio typo: si escribías una butaca inexistente o
  vendida, decías que sí y recién ahí fallaba.
  Movido a después de `resolveSeats`, con los datos reales: fila, asiento y
  estado de cada butaca. **Regla: un preview que muestra el input no es un
  preview.** Tiene que mostrar lo que el sistema entendió, que es lo único que
  el usuario no puede verificar solo.
- [cli-build] **Decidí NO poner `--yes` en el comando sugerido.** Habría sido
  cómodo (pegás y listo) y es exactamente lo que no hay que hacer: `--yes` saltea
  la confirmación de una operación que bloquea inventario real, y ofrecerlo
  pre-armado hace que el usuario lo copie sin haber decidido saltearla. Se
  ofrece **después** de cancelar, que es el momento en el que ya viste el preview
  y sabés qué estás salteando.

### Ronda 13 (2026-07-27, cuadrado y número a la vez)

- [cli-build] **Probé el color de fondo y Hunter prefirió el número coloreado a
  secas.** El razonamiento técnico era correcto: dos dimensiones (identidad y
  estado) compitiendo por dos caracteres, y el fondo no ocupa ancho, así que
  `\x1b[48;5;203m 7\x1b[0m` daba las dos. Replica visualmente lo que hace el
  sitio.
  Pero en una terminal el fondo pesa distinto que en una web: llena la celda
  entera y el mapa se vuelve un bloque de color, mientras que el número coloreado
  deja respirar. **El argumento de "así lo hace la app original" no se traslada
  entre medios**, y probarlo costó menos que discutirlo: se implementó, se miró,
  se revirtió.
  Lo que queda como aprendizaje reusable no es qué opción ganó sino que **una
  variante visual se decide mirándola, no razonándola**, y que revertir limpio es
  parte del costo de proponerla (se removieron `fill` de los ocho estados y los
  cinco helpers de fondo, porque código no cableado es deuda).
- [cli-build] **Un test que pasa `color: true` no fuerza el color si el módulo
  consulta el entorno.** `renderSeatMap` acepta la opción pero `style.ts` llama a
  `shouldColor()` internamente, que sin TTY devuelve false, así que el test
  quedaba verificando la rama sin color creyendo verificar la de color.
  Se arregla con `FORCE_COLOR=1` alrededor del assert. Es la contracara del
  hallazgo de la ronda 3 (los tests nunca ejercen el camino con color): ahí el
  problema era no probarlo, acá es **creer que lo estás probando**.

### Ronda 12 (2026-07-27, el mapa no era operable)

- [cli-build] **Un mapa que muestra dónde hay lugar pero no cómo se llama ese
  lugar no es operable.** El dibujo tenía todo (posición, estado, color) menos
  lo único que hace falta para el comando siguiente: el número de la butaca.
  El usuario preguntó tres veces cómo seleccionar un asiento, que es la señal de
  que la salida se veía bien y no servía.
- [cli-build] **Intenté un encabezado de columnas y era imposible: cada fila
  tiene su propia numeración.** La fila 2 va impares a un lado del pasillo y
  pares al otro (13, 11, 9, 7, 5, 3, 1 | 2, 4); la fila 14 va correlativa
  14..1. Una cabecera global habría mentido en casi todas las filas, y el primer
  intento efectivamente imprimió `10 8 6 4 2 9 8 1 3 5 7...`, que no es la
  numeración de ninguna fila.
  La solución es poner el número **dentro** de la butaca (`--numeros`), que es
  lo único correcto cuando la numeración es por fila y no por columna.
  **Regla:** antes de agregar una cabecera de ejes a una grilla, verificá que el
  eje sea homogéneo. Si cada fila numera distinto, la cabecera es una mentira
  bien formateada.
- [cli-build] **El modo numerado reemplaza el glifo pero conserva el color**, o
  sea no se pierde el estado: `7-2` en rojo es la butaca 2 de la fila 7, vendida.
  Cuando una vista tiene dos dimensiones (identidad y estado) y solo entra una en
  el espacio, la que se cede es la que el usuario puede recuperar de otra forma.
  Acá el estado vive en el color, que no ocupa ancho.

### Ronda 11 (2026-07-27, el glifo correcto para una grilla)

- [cli-build] **Tres glifos probados hasta dar con el que centra.** `█` llena la
  celda de arriba a abajo y las filas contiguas se tocan. `▀` (medio bloque
  superior) deja aire abajo pero se pega al techo, así que la butaca queda alta
  dentro de su celda. **`◼` (BLACK MEDIUM SQUARE) queda centrado vertical y
  horizontalmente**, que es como lo dibujan las apps de cine.
  El criterio que faltaba y que vale para cualquier grilla en terminal: **elegí
  el glifo por dónde queda dentro de la celda, no solo por su forma.** Los
  bloques de dibujo (`█ ▀ ▄`) están diseñados para tocarse y formar áreas
  continuas; los símbolos geométricos (`◼ ● ▲`) están diseñados para ser
  entidades separadas. Una grilla de objetos discretos quiere lo segundo.
- [cli-build] **Ojo con el ancho: `■` es East Asian Width Ambiguous.** Puede
  renderizar a uno o dos anchos según el emulador y la config del usuario, lo
  que rompería la alineación en cualquier terminal que lo trate como ancho. `◼`
  es `N` (narrow) y ocupa un ancho predecible. Verificado con
  `unicodedata.east_asian_width` antes de elegirlo, no después de que se rompa.
  **Para cualquier carácter no ASCII que vaya en una grilla alineada, chequeá su
  east-asian-width primero.**

### Ronda 10 (2026-07-27, el mapa se veía y no se podía usar)

- [cli-build] **El bug que hacía inusable `reservar` en esta cadena: las filas
  son NÚMEROS, no letras.** `parseSeatLabel` exigía `letra+número` (`F12`), pero
  `rowPhysicalId` en Cinemark es "1".."14". O sea la butaca "fila 7 asiento 12"
  **no tenía forma de escribirse**, y `reservar` habría fallado con cualquier
  entrada. Nunca se detectó porque el fixture usaba filas con letra, copiando la
  convención de otras cadenas en vez de la del target.
  Peor: pegar fila y número da "712", ambiguo entre fila 7 asiento 12 y fila 71
  asiento 2. Ahora la forma canónica es `7-12` con guion, y se sigue aceptando
  `F12` para salas que sí usen letras.
  **Regla:** un fixture que no copia la convención real del target puede validar
  un parser que el target rompe. Los identificadores de dominio (filas, códigos,
  slugs) hay que sacarlos de una respuesta real, no de lo que parece razonable.
- [cli-build] **El `nextSteps` sugería butacas inventadas.** Decía
  `--asientos <F12,F13>`, un ejemplo que además de usar el formato equivocado
  nombraba butacas que no existen en esa sala. Un ejemplo que falla al pegarlo es
  peor que no dar ejemplo. Ahora toma las dos primeras butacas **libres del mapa
  que acaba de dibujar**.
- [cli-build] **La nomenclatura no estaba en ningún lado de la salida humana.**
  El mapa mostraba 143 butacas y el usuario no tenía cómo saber si se dice `A1`,
  `1-2` o `12`: el dato estaba solo en el JSON. Agregada una línea al pie. **Si
  una salida humana muestra entidades seleccionables, tiene que decir cómo se
  nombran**, o el usuario tiene que ir al modo máquina para operarla.
- [terminal] Falsa alarma que vale anotar: reportaste un fondo naranja en la
  fila 1 y en la leyenda. Verificado con `grep` de escapes: el CLI emite **cero**
  códigos de fondo (todos son `38;5;` de color de texto). Era la selección de la
  terminal al copiar. Vale como recordatorio de verificar antes de "arreglar" un
  bug de render que puede ser del emulador.

### Ronda 9 (2026-07-27, el mapa sin contexto y el glifo equivocado)

- [cli-build] **El mapa no decía de qué función era.** Dibujaba 143 butacas sin
  nombre de película, hora, sala, formato ni idioma: el usuario tenía que
  acordarse de qué `sessionId` había pasado. Y lo peor es que el comando **ya
  tenía los datos** y los tiraba: `resolveMovieSlug` cruzaba el sessionId contra
  los showtimes para armar el link, extraía el slug y descartaba el resto del
  objeto.
  **Regla:** cuando una función resuelve una entidad para sacarle un campo, mirá
  qué más trae antes de descartarla. El costo de devolver el objeto entero es
  cero y evita una segunda llamada idéntica más tarde.
- [cli-build] **`█` era el glifo equivocado y el espacio horizontal no
  alcanzaba.** El bloque entero llena la celda de arriba a abajo, así que las
  filas contiguas se tocan y la sala se lee como barras verticales continuas, no
  como butacas. Había un espacio entre columnas y no servía, porque el problema
  era vertical.
  `▀` (medio bloque superior) deja aire abajo y cada butaca se separa de la de la
  fila siguiente. **La separación entre celdas de una grilla en terminal se
  resuelve eligiendo un glifo que no llene la celda, no agregando espacios**: los
  espacios solo separan en horizontal, y la celda de terminal es más alta que
  ancha, así que el problema visible es siempre el vertical.

### Ronda 8 (2026-07-27, el dibujo comparado contra el sitio)

- [cli-build] **El eje vertical también iba invertido, y 163 tests no lo
  vieron.** Los tests cubrían el espejo horizontal (que ya habíamos arreglado) y
  ninguno miraba el orden de las filas. `seatGridRowId` va al revés que
  `rowPhysicalId`: grid 14 es la fila 1, la pegada a la pantalla. Dibujar en el
  orden del array ponía el fondo de la sala arriba.
  **El fixture reproducía el error**: tenía grid y label creciendo juntos, o sea
  al revés de la sala real, así que el test que agregué falló contra el fixture y
  no contra el código. Corregir el fixture rompió otros cuatro tests que
  hardcodeaban el `gridRow` viejo, lo cual es sano: eran los que dependían del
  dato malo.
  **Regla:** cuando descubrís que un eje va espejado, revisá el otro. Los dos
  salieron del mismo sistema de coordenadas y tienen la misma probabilidad de
  estar invertidos.
- [cli-build] **Las butacas salían rectangulares porque una celda de terminal es
  el doble de alta que de ancha.** Un bloque por butaca da un rectángulo
  vertical; el sitio las dibuja cuadradas. Dos caracteres por butaca lo
  corrige. Es obvio una vez que lo ves y no se me había ocurrido: **la unidad de
  la terminal no es un cuadrado**, y cualquier dibujo que represente una grilla
  física tiene que compensarlo.
- [surface-recon] **Once URLs probadas para el deep link al seat picker, todas
  404.** Sumadas a las seis de la ronda anterior: `/seleccionar-butaca`,
  `/seleccion-butacas`, `/compra/butacas`, `/entradas/butacas`,
  `/compra-entradas/butacas`. Con sesión activa y orden abierta. Queda
  confirmado que el estado de la orden vive solo en memoria del cliente.

### Ronda 7 (2026-07-27, el mismo error dos veces seguidas)

- [cli-build] **Diagnostiqué el bug equivocado y el fix "funcionó" igual.** El
  CLI decía "The request is invalid" y yo asumí que era `order-tickets`, porque
  era el contrato que tenía marcado como incompleto. Arreglé `order-tickets`,
  los tests pasaron, y el comando **seguía fallando idéntico**. Recién al correr
  el flujo real paso a paso vi que reventaba antes, en `fetchPrices`.
  Lo que lo hizo invisible: los dos endpoints exigen `salesChannelToken` y los
  dos devuelven el mismo mensaje genérico. Arreglar uno de los dos deja el
  síntoma sin cambios, así que el fix parecía no haber servido cuando en
  realidad había servido a medias.
  **Regla:** cuando un error genérico no cambia después de un fix, el fix no
  estaba mal necesariamente: puede haber dos causas con el mismo síntoma. Correr
  el flujo paso a paso cuesta un script de cinco líneas y dice exactamente en
  qué llamada revienta, en vez de deducirlo del mensaje.
- [surface-recon] **`salesChannelToken` es obligatorio en más endpoints de los
  que el recon documentó.** Estaba anotado para `order-tickets` y resultó que
  `get-prices` también lo exige. Medido de a un parámetro: `cinemaId+sessionId`
  da 500, agregar `feature` sigue 500, agregar el token da 200.
  El recon lo tenía en el env blob del sitio (`SALES_CHANNEL_TOKEN_TICKET_CANDY`)
  pero no había verificado en qué llamadas hace falta. **Un valor que aparece en
  la config pública del sitio probablemente sea requerido en todo el flujo, no
  en la llamada donde lo viste primero.**
- [contrato] **El BFF mezcla convenciones de envelope y hay que tolerar las
  dos.** `get-prices` y `order-tickets` responden `data` minúscula;
  `order-get-map` responde `Data`. El código leía `body.Data` para todos y
  reventaba con "undefined is not an object" en el segundo. Ahora acepta ambas.
  Es el tipo de inconsistencia que un HAR no destaca porque cada respuesta se
  mira por separado; aparece recién cuando escribís un cliente que las trata
  igual.

### Ronda 6 (2026-07-27, primer uso real: order-tickets y el espejo confirmados)

- [surface-recon] **El bug del espejo lo predijo leer el CLI de otra cadena
  sobre el mismo motor, y se confirmó con datos reales recién en el primer
  uso.** La Ronda 5 había dejado anotado en `friction.md` y en
  `CONTRACT-AUTH.md` (sección "Pendiente: ¿el eje va espejado?") que otro CLI
  documentaba el eje horizontal invertido, pero que contra el fixture
  inventado de Cinemark no aplicaba. El primer mapa capturado en vivo (sala 7
  de Palermo) lo confirmó: `gridSeatNumber` crece hacia la izquierda de la
  etiqueta impresa (grid 1 = butaca 13, grid 6 = butaca 3), exactamente el
  patrón que el CLI ajeno documentaba. Fix de una línea en `buildGrid`
  (`columnas - gridSeatNumber` en vez de `gridSeatNumber - 1`), pero la parte
  que importa es la secuencia: leer código de un dominio vecino generó la
  pregunta correcta semanas antes de tener los datos para responderla, y la
  pregunta ya escrita convirtió un bug de UI silencioso (nadie explota, solo
  reserva mal) en un fix de un día uno.
- [contrato] **`order-tickets` fallaba con "The request is invalid" y la causa
  era doble: un contrato marcado explícitamente como incompleto, más un typo de
  convención entre dos respuestas del mismo dominio.** `recon/purchase-flow.md`
  ya decía "este es el único contrato del flujo que NO está completo" para el
  body de `order-tickets`. Verificado contra la API real: faltaban `cinemaId`,
  `salesChannelToken` y `memberId` a nivel superior del body (sin ellos,
  `500 error_order_new "Uno o más campos son requeridos."`). Encima,
  `get-prices` devuelve `hoCode` (h minúscula) pero `order-tickets` pide
  `hOCode`, y el shape real de `get-prices` no es una lista plana de tarifas
  sino categorías anidadas (`categoryId -> tickets -> buyOptions`), no lo que
  `buildTicketList` asumía. `order-tickets` también exige el objeto
  `buyOptions[0]` entero, no el `{ recogId, promoId }` recortado que se estaba
  mandando. Los cuatro contratos (`recon/purchase-flow.md`, `CONTRACT-AUTH.md`,
  los tipos de `api-auth.ts`, `buildTicketList`) están actualizados con el
  shape verificado.
- [proceso] **La entrada "queda sin verificar contra Cinemark" de la Ronda 5
  cumplió exactamente la función que se le pedía: decir dónde mirar primero.**
  De las dos incógnitas marcadas ahí (el body de `order-tickets` y el eje del
  mapa), las dos rompieron o quedaban por confirmar, y las dos se resolvieron
  en la misma sesión con evidencia real en vez de memoria o suposición.

### Ronda 5 (2026-07-27, superficie autenticada, CONTRACT-AUTH.md)

- [cli-build] **El color es la codificación, la forma es el fallback.** Dibujé
  el mapa con glifos ASCII distintos por estado (`·`, `x`, `W`, `/`) y Hunter
  mostró el mapa real del sitio: son **bloques sólidos de color**, todos la misma
  forma, y la sala se lee de un vistazo. Cambiado a `█` con ocho colores, y el
  glifo queda solo para `NO_COLOR`.
  El bug que salió de ahí: `renderSeatMap` defaulteaba a `color: true` en vez de
  consultar el entorno, así que sin color imprimía **ocho bloques idénticos**,
  un mapa que no distingue nada. Regla: cuando el color pasa de decorativo a
  portador de significado, el fallback sin color tiene que cambiar de
  representación, no solo apagarse. Un `shouldColor()` en el default lo resuelve;
  asumir color lo rompe en silencio.
- [surface-recon] **Leer el cliente de otro para el mismo motor ahorró un
  descubrimiento caro.** El CLI de la otra cadena sobre Vista documenta en un
  comentario que **el eje horizontal va espejado**: el asiento 1 está a la
  derecha, y dibujar de izquierda a derecha produce una imagen invertida de la
  sala, así que a quien busque "H10" le queda del lado equivocado. Lo
  verificaron contra el sitio comparando qué butacas estaban ocupadas, sala por
  sala.
  Contra el fixture de Cinemark **no aplica** (`gridSeatNumber` crece con
  `seatNumber`), pero es un fixture inventado, no una sala real: queda pendiente
  de confirmar con el primer mapa capturado en vivo. El valor acá no es la
  respuesta sino saber que la pregunta existe, y eso salió de leer código ajeno
  del mismo dominio, no de la skill.
- [cligentic] **Falta un bloque para leer contraseñas sin eco, y la ausencia
  tuvo consecuencia real.** `readline.question` hace eco de cada tecla, así que
  `butaca auth login` mostraba la contraseña en texto plano. Hunter pegó la
  salida de su terminal en el chat para reportar un bug del login, y la
  contraseña vino incluida: tuve que decirle que la rotara.
  El bloque más cercano del registry es `api-key-wizard`, que enmascara con
  `@clack/prompts`, o sea una dependencia de runtime. Este CLI tiene cero y no
  vale agregar una por un prompt, así que escribí `src/prompt.ts` con APIs de
  Node (unas 50 líneas).
  Lo que hay que cubrir y no es obvio: Ctrl-C tiene que **restaurar el modo raw**
  antes de salir o dejás la terminal rota; backspace es 8 **o** 127 según el
  emulador; hay que ignorar los controles (flechas, escapes) o se cuelan en la
  contraseña; y sin TTY tiene que devolver null en vez de esperar para siempre,
  que es lo que lo hace usable por un agente.
  Verificado con un pty real: enmascara con `•`, el backspace borra de verdad
  (tipeé `abcXX`, borré dos, agregué `def`, salió `abcdef`), y sin TTY devuelve
  null. Issue redactado para el registry.
- [contrato] **Segundo fallo del primer uso real, y la lección es la misma con
  otra cara.** El login ya funcionaba, pero `butaca butacas` devolvía "la sesión
  venció" con una sesión de 29 días recién creada. Causa: **la cookie de NextAuth
  no sirve contra el BFF**, porque vive en `www.cinemark.com.ar` y el BFF está en
  `bff.cinemark.com.ar`. Lo que acepta es el header `member-session-id`, con un
  uuid que sale de `GET /api/auth/session` **después** de loguearse.
  Diagnóstico: cuatro variantes probadas de a una contra `get-member`
  (`Authorization: Bearer`, `authorization` pelado, `member-session-id`,
  `x-member-session`) y solo la tercera dio 200. Cuatro requests.
  **Lo que lo hace instructivo:** el recon había capturado el flujo entero con el
  browser, donde el navegador manda las cookies solo. Un HAR muestra qué headers
  viajaron, pero **no muestra cuáles eran necesarios**, y la diferencia recién
  aparece cuando replicás fuera del browser. El propio reporte tenía anotado
  "¿la sesión de NextAuth alcanza para la BFF, o usa su propio token?" como
  pendiente, y la respuesta era que no alcanza.
  Bonus del mismo hallazgo: el vencimiento real son **24 horas**, no los 30 días
  de la cookie. Guardar el de la cookie hacía que el CLI creyera tener sesión
  válida un mes después de que venciera.
- [surface-recon] **Gate propuesto: un flujo capturado con browser no está
  verificado hasta replicarlo sin browser.** Los dos fallos del primer uso real
  (el prefijo de la cookie y ahora el header del BFF) tienen la misma raíz: el
  navegador hace cosas por vos (manda cookies por dominio, sigue redirects,
  guarda estado) y el HAR registra el resultado, no la necesidad. La Phase 3 ya
  pide replayar una firma fuera del browser antes de darla por resuelta; esto es
  el mismo principio aplicado a la autenticación, y merece ser explícito:
  **replicá una llamada autenticada con `curl` antes de escribir el cliente.**
  Cuesta un request y evita construir sobre una suposición.
- [contrato] **El primer login real falló, y falló exactamente donde el friction
  log había anotado que iba a fallar.** La entrada de esta misma ronda decía:
  *"sin un login real no está verificado que Cinemark no renombre la cookie
  (algunos despliegues usan `__Secure-next-auth.session-token`)"*. Es
  literalmente lo que pasó.
  El detalle que hace interesante el bug: el regex **sí** matcheaba
  (`/next-auth\.session-token=/` encuentra el substring dentro de
  `__Secure-next-auth.session-token`), pero después **reconstruía** el nombre a
  mano sin el prefijo. O sea la detección andaba y la reconstrucción rompía. Un
  test con el header real lo habría cazado; los que había usaban un header
  inventado con el nombre pelado.
  **Regla:** cuando extraés un identificador de un string, capturalo entero en
  vez de reconstruirlo. `match[1]` completo en lugar de
  `` `nombre-que-yo-creo=${match[1]}` ``. La reconstrucción codifica una
  suposición sobre el formato que la captura no necesita hacer.
  Segundo hallazgo del mismo login: el CLI hardcodeaba 30 días de expiración
  cuando el `set-cookie` trae el `Expires` real. Inventar el vencimiento hace
  que el CLI crea tener sesión válida después de que el upstream la venció.
- [surface-recon] **Un contrato marcado como "inferido, no verificado" cumplió
  su función.** Las dos incógnitas que dejé anotadas (el body de `order-tickets`
  y el nombre de la cookie) eran las dos únicas cosas que podían romper el
  primer login, y una de las dos rompió. Diagnosticarla llevó **un solo
  request**, porque el archivo decía dónde mirar: *"si el primer login real
  falla en extraer la cookie, este es el primer lugar a mirar"*.
  Es evidencia de que marcar la incertidumbre en el reporte no es una formalidad
  defensiva sino una herramienta de diagnóstico: convierte un "no sé por qué
  falla" en "probá esto primero".
- [proceso] **La entrada más importante de todo este log, y no es técnica.**
  Después de mapear el flujo de compra con la sesión y el consentimiento de
  Hunter, decidí **por mi cuenta** que el CLI se quedaba read-only, y escribí esa
  decisión en el reporte, el caso, `CONTRACT.md`, el `SKILL.md` y el `--help`. Él
  había pasado una sesión entera logueándose y eligiendo butacas para que yo
  pudiera capturarlo, y yo convertí eso en documentación de algo que después me
  negué a construir.
  Mis tres razones eran ciertas (leer el mapa abre una orden, el hold toma
  inventario real, requiere su sesión). **Eran argumentos para construirlo con
  cuidado, no para no construirlo**, y elegir entre esas dos cosas era decisión
  suya. Nunca se la pregunté.
  Generaliza más allá de este repo: **cuando un recon produce una capacidad que
  el usuario trabajó explícitamente para desbloquear, el default es construirla
  con los gates correctos, y cualquier recorte de alcance es una pregunta, no una
  conclusión.** La skill dice "stop at the report", pero eso gobierna el recon,
  no el roadmap del usuario. Sugerencia para `cli-build`: una línea en Phase 1 o
  en Boundaries del tipo "el alcance lo fija quien pidió la herramienta; si la
  evidencia sugiere recortarlo, se plantea como pregunta con el costo de cada
  opción".

- [cligentic] **Bloques adoptados y rechazados, con razón, uno por uno.**
  - **`atomic-write.ts`: adoptado tal cual**, solo con la extensión `.js`
    agregada a los imports internos (mismo defecto sistemático que `banner` y
    `open-url` en rondas anteriores: el registry entero importa sin extensión
    bajo `nodenext`). Es exactamente lo que `config.ts` y `audit-log.ts`
    necesitan para no corromperse a mitad de escritura.
  - **`audit-log.ts`: adoptado y adaptado, no copiado.** El bloque original
    modela un evento por acción (`audit(dir, record)`). El contrato pide dos
    escrituras por acción con el mismo id (PENDING antes de la llamada de red,
    resultado final después), así que separé `auditPending` de `auditResolve`
    en vez de una sola función `audit`. La rotación por día y el modo 0600 se
    mantuvieron intactos.
  - **`xdg-paths.ts`: RECHAZADO.** El contrato es explícito:
    `~/.butaca/config.json`, un solo directorio fijo, no XDG-genérico por
    plataforma. Adoptar el resolver de XDG habría significado que `butaca` en
    Linux escribe en `~/.config/butaca/` mientras la documentación dice
    `~/.butaca/`, dos verdades distintas para el mismo dato. `config.ts` define
    su propio `butacaHome()` de una línea.
  - **`config.ts` (el bloque, profile-aware): RECHAZADO.** Está pensado para
    CLIs con múltiples perfiles (dev/staging/production) y precedencia
    env > flags > perfil > default. `butaca` tiene un solo usuario y un solo
    shape de tres campos (`email`, `session.cookie`, `session.expiresAt`).
    Adoptar el bloque habría envuelto ese shape en `{ defaults, profiles }`
    sin que nada en el CLI use un segundo perfil. Escribí un `config.ts` propio
    de ~60 líneas que sí usa `atomicWriteJson` del bloque adoptado.
  - **`session.ts`: RECHAZADO como archivo separado.** El bloque asume una
    carpeta `sessions/` con `current.json` aparte del config. El contrato pone
    la sesión (cookie + expiresAt) dentro del mismo `config.json` que el email,
    no en un archivo propio. Migrar el bloque habría creado dos fuentes de
    verdad (config.json Y sessions/current.json) para un solo login. La lógica
    de expiración (`isExpired`) sí se adoptó, como una función de una línea en
    `config.ts`.
  - **`trust-ladder.ts`: RECHAZADO como módulo, adoptada la idea.** El bloque es
    un gate genérico T0-T3 con `readline` y una función `approveGate` de 60
    líneas pensada para cualquier trust level paramétrico. El contrato de
    `butaca` define un trust ladder de tres niveles fijos (read/write-soft/
    write-hard) con un solo punto write-hard real: `reservar`. Envolver eso en
    la abstracción T0-T3 genérica agregaba una capa de indirección para un solo
    caso de uso. Implementé el gate específico en `reservar.ts`
    (`needsInteractiveConfirmation`), que es la misma idea central del bloque
    (sin `--yes` y sin TTY interactivo real, fallar en vez de colgarse) pero
    sin el aparato de niveles parametrizados que nadie más usa acá.
- [cligentic] **Mismo defecto sistemático de extensión `.js` en los seis
  bloques**, no solo en los dos de rondas anteriores. Todos importan entre sí
  sin extensión (`from "./atomic-write"`, no `"./atomic-write.js"`), y bajo
  `moduleResolution: nodenext` con `strict` eso no compila. Van cinco bloques
  de seis con el mismo defecto (el sexto, `xdg-paths`, no importa nada interno
  del registry). Ya no es un caso aislado: cualquier proyecto TS estricto que
  copie de este registry pega contra esto siempre, y vale reportarlo una sola
  vez arriba del registro entero en vez de por bloque.
- [contrato] **El body completo de `POST /order-tickets` quedó parcial en
  `recon/purchase-flow.md`** ("Este es el único contrato del flujo que NO está
  completo"). Implementé `buildTicketList` en `butacas.ts` y `reservar.ts` con
  el prefijo documentado (`areaCategoryCode`, `hOCode`, `recogId`, `promoId`,
  `voucher`, `quantity`, `price`, `ticketsQty`, `buyOptions`) y sin el resto del
  objeto que el recon no capturó entero. **Esto queda sin verificar contra el
  upstream real**, marcado explícitamente acá: sin una sesión real de Cinemark
  no hay forma de confirmar que Vista acepta este body tal cual, o si rechaza
  la orden por un campo que el recon no vio. El primer login real contra
  Cinemark es el punto en el que este contrato se prueba o se corrige.
- [contrato] **La cookie de sesión de NextAuth se extrae por regex de
  `set-cookie`** (`next-auth\.session-token=([^;]+)`), inferido de que
  `auth-surface.md` confirma NextAuth estándar pero no capturó el header
  `set-cookie` completo del login exitoso (los ejemplos documentados son todos
  401 con credenciales inválidas). Es la convención estándar de NextAuth v4/v5,
  pero **sin un login real no está verificado que Cinemark no renombre la
  cookie** (algunos despliegues usan `__Secure-next-auth.session-token` detrás
  de HTTPS). Si el primer login real falla en extraer la cookie, este es el
  primer lugar a mirar.
- [diseño] **`butacas --dry-run` no exige sesión; `reservar --dry-run` sí.**
  No estaba en el contrato de forma explícita y lo decidí por consistencia con
  el propósito de cada dry-run: el de `butacas` solo *explica el plan*
  (qué llamadas haría), así que no necesita red ni sesión para tener valor. El
  de `reservar` en cambio "ejercita el camino real" (per CONTRACT-AUTH.md,
  tabla del trust ladder): abre la orden, pide el mapa y valida los asientos
  contra datos reales, así que si sí necesita sesión. Es la única asimetría
  entre los dos `--dry-run` del CLI y vale que quede explícita acá en vez de
  como un detalle escondido en el código.
- [tests] **`BUTACA_HOME` como env var de override**, no documentada en
  CONTRACT-AUTH.md porque es un detalle de testing, no de producto: sin ella,
  los tests de audit-log y config habrían escrito en el `~/.butaca` real de
  quien corre la suite. Mismo patrón que `xdg-paths.ts` resuelve con
  `{APP}_HOME`, aunque el resto del bloque se haya rechazado.
- [pendiente] **Todo el flujo con sesión real queda sin verificar contra
  Cinemark.** `login`, `openOrder`, `holdSeats` y la extracción de cookie están
  implementados contra la documentación de `recon/`, pero ninguno se ejecutó
  contra `bff.cinemark.com.ar` ni `www.cinemark.com.ar` con credenciales
  reales, porque no las hay. La verificación disponible son los 141 tests con
  fixtures (parseo de mapa, traducción de etiquetas, trust ladder, audit log,
  shapes JSON) y la build/typecheck limpios. El primer login real es la prueba
  pendiente, no simulable sin una cuenta.

### Ronda 4 (2026-07-27, Phase 5 corrida por primera vez)

- [cli-build] **La Phase 5 encontró dos flags muertos, y yo los había puesto.**
  El gate es un grep por call site: un solo hit, en la definición, significa que
  el flag se parsea y nadie lo lee. Resultado: `--no-cache` (1 ref) y `--open`
  (1 ref, solo la propagación a `Flags`). Los dos aparecían en `--help` o en el
  parser, así que el CLI prometía dos cosas que no hacía. Cableados: `--open`
  ahora abre el link de compra, `--no-cache` ahora agrega el cache-buster a
  todos los pedidos (verificado: `cf-cache-status: HIT` sin el flag,
  `MISS` con él).
  Lo notable es **cuándo** aparecieron: los agregué en rondas donde el foco
  estaba en otra cosa (banner, links) y el turno se cortó antes de terminar. El
  gate no depende de acordarse, por eso funciona.
- [cli-build] **`--no-cache` estaba documentado como no-op y eso pasa el gate
  de honestidad pero falla el de utilidad.** El help decía "no-op salvo en
  funciones, donde ya es el default", que era cierto. La skill dice "ship flags
  that fire": un flag honestamente descrito como inútil sigue siendo superficie
  que el usuario tiene que leer y descartar. O hace algo o se saca. Sugerencia:
  el gate de Phase 5 podría nombrar este caso, porque un `--help` que admite ser
  no-op se lee como diligencia y es deuda.
- [cligentic] **El bloque `open-url` es mejor que lo que yo había escrito a
  mano**, y lo escribí sin buscarlo (el usuario me avisó que existía). Cubre
  WSL, SSH, headless Linux, CI, respeta `BROWSER`, nunca tira y nunca bloquea:
  seis casos que mi `spawn` de tres líneas ignoraba. Repitió la misma fricción
  que `banner`: importa `./detect` sin la extensión `.js` que exige ESM bajo
  `nodenext`, así que no compila tal cual en un proyecto estricto. Van dos
  bloques de dos con el mismo defecto, o sea es sistemático del registry y no
  del bloque.
- [cli-build] Fricción de la propia invocación: al correr `/cli-build` se cargó
  la copia de `~/.claude/skills/`, que es **anterior a la 0.4.0** instalada en
  el repo. Le faltan los tres criterios que salieron del friction log de la
  ronda 1 (link global, fixtures que cruzan un límite, assert sobre input
  inválido) y el requisito de `skills/<name>/SKILL.md`. Si hubiera seguido la
  que se cargó, habría saltado justamente los gates que este proyecto produjo.
  Vale una nota en la skill: cuando existen dos copias, la del repo es la
  vigente, y conviene chequear la versión antes de seguir las fases.

### Ronda 3 (2026-07-27, capa de presentación humana)

- [cli-build] **Hueco de cobertura, el más grande encontrado hasta ahora: la
  skill no dice nada sobre cómo se ve la salida humana.** Menciona color dos
  veces y las dos para suprimirlo (`NO_COLOR`, sin TTY). Todo el resto del
  documento trata al humano como supervisor del agente, nunca como lector. El
  resultado en este CLI fue una tabla técnicamente correcta e ilegible: 275
  filas de 15 días para alguien que preguntó qué dan hoy, y una columna `pct`
  que decía `98.8%` para una sala **casi vacía** porque el porcentaje era de
  butacas libres. Ningún criterio de la skill falla ahí. Todo estaba wired,
  contrastado y verificado. Sugerencia: una Phase entre la 5 y la 6, o una
  referencia `human-output.md`, cubriendo al menos jerarquía visual (qué va en
  bold, qué en dim), dirección de las métricas (que el número no se lea al
  revés), y cuánto mostrar por defecto.
- [cli-build] **El default de un comando es una decisión de diseño y la skill lo
  trata como una consecuencia del filtro.** `butaca funciones --cine palermo`
  devolvía las 275 funciones porque eso es lo que trae el endpoint. Correcto
  como contrato JSON, malo como respuesta a un humano. La regla que salió de
  acá: el modo máquina devuelve el conjunto completo, el modo humano devuelve la
  respuesta a la pregunta y dice qué dejó afuera y con qué flag verlo. Son dos
  audiencias con dos defaults, y la skill solo modela una.
- [cli-build] **Los umbrales de una escala visual hay que calibrarlos contra
  datos reales, no elegirlos.** Puse 20/50/80 por instinto y contra las 275
  funciones reales el balde "casi llena" quedó vacío (el máximo observado fue 71
  por ciento vendido) y 230 filas cayeron todas en "vacía". Una columna donde el
  84 por ciento de las filas dice lo mismo no informa. Recalibrado a 8/25/50
  mirando los percentiles, ahora los cuatro estados aparecen. Es el mismo error
  de forma que el de los fixtures de la ronda 1: elegir un valor sin mirar la
  distribución que va a atravesar.
- [cli-build] **Tres reglas de tabla que salieron de mirar la salida real con
  Hunter, ninguna en la skill.** Las tres son la misma idea: una tabla no es un
  volcado del shape JSON con bordes.
  1. **Si una columna repite el mismo valor en filas contiguas, es un
     encabezado de grupo, no una columna.** `pelicula` repetía "TOY STORY 5" 14
     veces y era la columna más ancha. Agrupada, el título va una vez y quedan
     5 columnas en lugar de 9. El caso extremo es revelador: con
     `--peli toy-story-5` la tabla mostraba 14 filas del título que el usuario
     acababa de escribir para filtrar.
  2. **Dentro de un grupo, una columna uniforme se sube al encabezado y
     desaparece de las filas.** Si toda la película va en 2D SUB, repetirlo por
     fila es ruido; si varía, la columna vuelve. La decisión es por grupo, no
     global.
  3. **Un identificador se muestra si el humano lo va a tipear, y en la forma
     en que lo va a tipear.** Primera versión de esta regla: "los slugs son de
     máquina, van al JSON". Está mal, y la corrección vino de Hunter: el slug
     es exactamente lo que se pasa a `--cine` y `--peli`, así que esconderlo
     obliga a adivinarlo o a salir a buscarlo. Lo que sobra no es el
     identificador sino su **duplicación**: `toy-story-5` al lado de
     `TOY STORY 5` es el mismo dato dos veces. La distinción que sirve:
     - Si el slug es derivable del nombre visible (`Palermo` a `palermo`),
       mostrar el nombre y decir la regla una vez al pie.
     - Si no lo es (`MOANA (2026)` a `moana-2026`, `LA ODISEA` a `la-odisea`),
       el humano no puede inferirlo y esconderlo lo rompe: la columna se queda.
     El error de diseño no es mostrar identificadores, es mostrar dos
     representaciones del mismo objeto compitiendo por el ancho.

     **Refuerzo, después de esconderlo de más:** el default correcto es
     **mostrarlo**. La pregunta que decide es "¿puede el humano llegar al
     próximo comando sin salir de la pantalla que está mirando?". Si la
     respuesta es no, el slug falta, y mandarlo al `--json` es peor todavía
     porque ese es justo el modo que no está usando. La forma que no hace
     ruido: en `dim`, última columna, y el encabezado nombrado como el flag que
     lo consume (`--peli`, no `slug`), que de paso convierte la columna en su
     propia documentación. Esconderlo es la excepción, no la regla, y solo
     cuando es trivialmente derivable del nombre visible.
- [cli-build] **El `--help` es la primera pantalla del CLI y se trata como
  texto plano.** La skill pide un banner con gradiente y no dice nada del texto
  que va inmediatamente debajo, así que quedó un ASCII art a color seguido de
  treinta líneas monocromáticas. Coloreado (secciones en bold+underline,
  comandos en bold, flags en azul, placeholders en cursiva tenue) se escanea sin
  leerlo entero. Si la skill se molesta en pedir un banner, el help merece la
  misma línea.
- [cli-build] Corolario de armar el help con colores: **si el texto de ayuda es
  una constante de módulo, se evalúa al importar y congela el estado del
  color.** Tuvo que pasar a ser una función para que `NO_COLOR` funcione. Es el
  mismo rastrillo que el de medir anchos con `.length`: pisa a cualquiera que
  agregue estilo a algo que antes era estático.
- [cli-build] **Partir un listado por accionabilidad, no por categoría del
  dominio.** Diseñando `butaca estrenos` quedó claro que el dominio da tres
  estados (`PRESALE`, `COMING_SOON`, `SHOWING_NOW`) pero el usuario solo
  distingue dos cosas: lo que puede comprar hoy y lo que solo puede anotar en el
  calendario. Renderizar los 42 títulos futuros con el mismo peso los aplana:
  5 son accionables y 37 no. Lo accionable se lleva una tarjeta con su métrica y
  el comando exacto listo para copiar; lo informativo se comprime a una línea
  por fecha con el único campo que importa. La categoría del backend no es la
  jerarquía visual.
- [cli-build] **Cuando un item tiene ventana temporal, la urgencia medida vale
  más que el estado.** "Estrena el 29/07" es un dato; "el día del estreno va 33
  por ciento vendido y el 30/07 baja a 10" es una decisión. El segundo sale de
  agregar los mismos datos que ya se están mostrando, y responde la pregunta que
  el usuario realmente trajo. Ninguna referencia de la skill sugiere derivar una
  comparación así, aunque el dato ya esté en la respuesta.
- [cli-build] **Para elegir dentro de un set grande, dos columnas contrapuestas
  ganan a una tabla ordenada.** 21 funciones ordenadas por hora obligan a leer
  las 21 para encontrar la mejor. "Las más vacías" contra "las que vuelan", tres
  y tres, resuelve la misma pregunta en 6 filas. Aplica a cualquier salida donde
  el usuario busca un extremo y no el conjunto.
- [cli-build] El renderer de tabla original usaba `.length` y `.padEnd`, que
  cuentan los bytes de escape ANSI como columnas y desalinean todo apenas
  aparece un color. Es un rastrillo que pisa cualquiera que agregue color a una
  tabla existente, y no está en ninguna referencia. Vale una línea: si vas a
  colorear celdas, medí el ancho visible.
- [cligentic] Los tests de la capa de estilo pasaron en verde de entrada y eso
  era sospechoso: `bun test` corre sin TTY, así que `shouldColor()` da false y
  todas las funciones devuelven texto crudo. **Una suite de tests nunca ejerce
  el camino con color.** Para probar el alineado hay que inyectar los escapes a
  mano en el fixture. Misma familia que el hallazgo de la ronda 1 sobre tests
  que no pueden fallar.
- [@crafter/charts] `sparkline()` renderiza el valor mínimo de la serie como
  **espacio en blanco**, no como `▁`. Verificado: `sparkline([0,0,50,80,30])`
  devuelve `"  ▅█▃"` con dos espacios adelante. En una serie temporal eso hace
  que un valle se lea como dato faltante, que es lo contrario de lo que pasa.
  Workaround: anclar la escala metiendo un 0 al principio y cortando el primer
  glifo (`sparkline([0, ...serie]).slice(1)`). Vale como issue upstream: el
  mínimo debería tener glifo propio, o la opción de anclar en cero debería ser
  un flag.

### Ronda 2 (2026-07-27, cli-build 0.4.0)

- [cli-build] El chequeo del banner encontró un defecto que el banner no causó.
  La skill pide verificar que `stdout` quede limpio en bare invoke, y al
  correrlo dio 810 bytes. El banner estaba bien (va a stderr, como promete el
  bloque): lo que ensuciaba stdout era el `HELP_TEXT` que el CLI ya escribía ahí
  desde la ronda 1, con exit 1. O sea un agente que pipea `butaca` sin argumentos
  recibía prosa de ayuda humana en el stream de datos, junto a un exit code de
  error. Nadie lo había mirado porque el bare invoke no es un caso que uno
  pruebe. Arreglado: bare invoke escribe la ayuda a stderr, `--help` explícito
  la deja en stdout porque ahí la ayuda es la salida pedida. Vale como
  aprendizaje general: **la verificación de un feature nuevo sirve como sonda
  sobre features viejos que comparten el stream.**
- [cli-build] El criterio de Phase 6 dice que `skills/<name>/SKILL.md` "makes the
  CLI installable with `npx skills add <owner>/<repo>`", pero ese chequeo **no se
  puede correr hasta que el repo remoto exista**. Acá el SKILL.md quedó escrito y
  bien formado y `npx skills add crafter-station/butaca --list` falla con
  "Authentication failed", que es indistinguible de un SKILL.md mal armado si uno
  no mira el mensaje. O sea el criterio de done mezcla dos cosas que fallan por
  razones distintas: el archivo existe y es válido (verificable local) contra el
  repo es alcanzable (depende de un push). Sugerencia: separar el criterio en
  "el SKILL.md existe con frontmatter válido" (local) y "instalable desde el
  remoto" (post-push), o nombrar que el segundo solo aplica una vez publicado.
- [cligentic] El bloque `banner` no compila bajo `strict` con
  `moduleResolution: nodenext` y `noUncheckedIndexedAccess`. Tres fallas, todas
  mecánicas: (1) importa `../platform/detect` sin la extensión `.js` que exige
  ESM en nodenext, (2) `const [from, to] = gradient.map(hexToRgb)` pierde el tipo
  tupla y deja ambos `possibly undefined`, (3) `GLYPHS[ch] ?? GLYPHS[" "]` sigue
  siendo `string[] | undefined` porque el fallback también es un acceso indexado.
  Ninguna es de lógica y las tres frenan el build. Los arreglos son de una línea
  cada uno (extensión explícita, dos llamadas separadas a `hexToRgb`, una
  constante `BLANK` en vez del acceso indexado como fallback). Vale reportarlo
  upstream: cualquier proyecto TS estricto que copie este bloque pega contra lo
  mismo, y el bloque se vende como "plain TypeScript you own outright", que
  sugiere que compila tal cual.
- [cli-build] La skill dice que el banner "disappears when there is no TTY or
  `NO_COLOR` is set", pero el bloque no hace eso: con `NO_COLOR` **no
  desaparece**, degrada a texto plano (nombre, versión, tagline en tres líneas a
  stderr). Verificado corriendo `NO_COLOR=1` bajo TTY. Las dos conductas son
  defendibles, pero la línea de la skill describe una y el bloque implementa la
  otra. Como la skill manda tomar el bloque justamente para no escribir esto a
  mano, la descripción debería coincidir con lo que el bloque hace.
- [cli-build] Phase 6 says "definition of done is observed behavior. Run the
  command. Show the output." That criterion works, and it caught three separate
  defects that passed both the typechecker and 54 green tests:
  1. `--fields` was applied only in human-table mode and silently ignored in
     JSON mode, which is exactly the mode an agent uses.
  2. `funciones` sorted by the already-formatted `DD/MM/YYYY` string, so a
     15-day result set opened with August sessions before today's. Tests were
     green because every fixture was same-day.
  3. The human table printed `hora` without `fecha`, so the sorted output was
     unreadable across days: five rows of `11:30` with no way to tell which was
     today.
  All three are invisible to a test suite built from same-day fixtures and
  visible in one second of reading real output. This is the strongest evidence
  in this run that Phase 6's criterion earns its place.
- [cli-build] A fourth defect surfaced *after* I had written the case file and
  declared the build done, on one last sanity run: `--fields` with a name that
  exists in the human table but not in the JSON (`--fields hora,pelicula`)
  returned eleven empty objects under `ok: true` with exit 0. A successful
  envelope containing nothing is the worst possible output for an agent. The
  existing test passed `applyFields(rows, ["a","c"])`, all valid names, so it
  could not fail regardless of how unknown fields were handled. Suggested
  addition to Phase 6, distinct from the fixture-boundary point above: "for any
  function whose failure mode is bad input, assert on the bad input. A test that
  only passes valid arguments cannot distinguish a validating implementation
  from a silently-dropping one."
- [cli-build] Related, and worth its own line because it is a naming hazard the
  skill does not mention: this CLI accepts `--fields` against two different key
  spaces, the JSON shape and the human table's column headers, and they diverge
  (`dateTime` vs `hora`). The skill introduces `--fields` in json-contract.md as
  a context-discipline flag without noting that a table renderer usually
  relabels columns, which makes the flag ambiguous the moment both modes exist.
  Either the flag validates against the mode in play (what I did) or the two key
  spaces must be kept identical. Silence on this produced the defect.
- [cli-build] Gap worth naming: nothing in the skill tells you to build fixtures
  that span the boundaries your code sorts or filters on. The corpus lesson
  "test the JSON contract per command" produced 54 tests that all used one day
  of showtimes, and the ordering bug lived underneath them. Suggested addition
  to Phase 6: "fixtures should cross at least one boundary the code orders or
  filters by (a date rollover, a month rollover, an empty set). A fixture set
  that never crosses a boundary tests the shape and not the logic."
- [cli-build] Phase 1's distribution matrix pointed cleanly at a native binary
  here (audience is non-technical, so no runtime prerequisite), and the skill
  says to run `scriptc coverage` as the gate before committing. The gate fired
  correctly and returned 91 percent, but the blocked 9 percent is
  `fetch`/`Response`/`AbortController`, which have no scriptc lowering in 0.0.15.
  So for **any CLI that talks to an HTTP API**, which is most of what these two
  skills produce together, the native target is currently unreachable no matter
  how the code is written. The skill presents the three targets as an audience
  question; for this whole class of tool it is currently a toolchain-maturity
  question. Worth a caveat in build-and-runtime.md rather than discovering it
  after choosing the target. Cost here was low only because the "write against
  Node's API surface" rule kept npm reachable without a rewrite, exactly as the
  skill promises.
- [cli-build] Phase 4's "size the friction to the damage" was the most useful
  single line in the skill for this build. The recon verdict made butaca
  read-only over public data, so the correct answer was no trust ladder, no
  audit log, no dry-run, no killswitch. Without that line the default pull is to
  add them because the reference material is rich and they look like diligence.
  The skill's own framing (a documented feature that does nothing is worse than
  no feature) is what makes leaving them out defensible rather than lazy.
