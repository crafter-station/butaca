# Human output: lo que aprendimos mirando salida real

Reglas agnósticas de dominio y de lenguaje, extraídas mientras Hunter miraba la
salida de un CLI en su terminal y decía qué le costaba leer. Candidatas a una
referencia de `cli-build`, que hoy no cubre nada de esto.

## Por qué existe este archivo

`cli-build 0.4.0` menciona el color exactamente dos veces, las dos para
**suprimirlo** (`NO_COLOR`, ausencia de TTY). Todo el resto del documento trata
al humano como supervisor del agente y nunca como lector. El resultado
observable en la primera versión de este CLI fue una salida que pasaba todos los
criterios de la skill (contrato estable, flags cableados, salida verificada) y
era ilegible: 275 filas para alguien que preguntó qué daban esa tarde, una
métrica que se leía al revés, y el mismo título repetido catorce veces.

Ningún gate falló. Ese es el hueco.

## 1. Dirección de la métrica

**El número tiene que significar lo que el ojo asume que significa.**

El upstream exponía butacas *disponibles*. Mostrarlo tal cual daba `98.8%` para
una sala **casi vacía** y `25.9%` para una casi llena. Es correcto y se lee al
revés, porque un porcentaje alto junto a un nombre de recurso se interpreta como
"lleno".

La corrección no fue invertir el número sino cambiar de representación: una
barra que crece con lo vendido más una etiqueta en palabras. La barra no tiene
dirección ambigua y la palabra no necesita interpretación.

**Regla:** antes de mostrar una métrica, preguntá qué asume el lector cuando ve
el valor alto. Si asume lo contrario de lo que significa, la métrica está mal
presentada aunque el número esté bien calculado.

**Y una regla escrita no alcanza.** El mismo error volvió a aparecer más tarde,
en código nuevo, escrito **después** de que esta sección existiera: dos columnas
tituladas "las más vacías" y "las que vuelan" ordenaban por el mismo campo
ascendente, y cada una listaba exactamente lo contrario de su título. Se veía
perfecto hasta mirar los números.

Cuando un campo tiene dirección contraintuitiva, la defensa que funciona no es
el documento sino **un helper con nombre y un test**. Un `sort` escrito a mano
en el sitio de uso invita a equivocar el signo cada vez; una función llamada
`extremosDeOcupacion` con tres tests de regresión lo hace una sola vez.

## 2. Umbrales medidos, no elegidos

Los cortes de la escala se pusieron en 20/50/80 por instinto. Contra los datos
reales el balde superior **nunca se usaba** (el máximo observado fue 71 por
ciento vendido) y el 84 por ciento de las filas caía en un solo balde.

Una columna donde casi todo dice lo mismo no informa, y peor: aparenta estar
funcionando.

Recalibrado a 8/25/50 mirando los percentiles de la distribución real, los
cuatro estados aparecen y la columna vuelve a discriminar.

**Regla:** una escala visual se calibra contra la distribución que va a
atravesar, no contra los números redondos que suenan razonables. Es el mismo
error que un fixture que nunca cruza un límite: el código parece andar porque
nada lo prueba.

## 3. Dos audiencias, dos defaults

El comando devolvía las 275 filas que trae el endpoint. Correcto como contrato
de máquina, malo como respuesta a una persona que preguntó por esta tarde.

La separación que funciona:

- **modo máquina**: el conjunto completo, siempre, sin recortes silenciosos.
- **modo humano**: la respuesta a la pregunta, y una línea que dice qué quedó
  afuera y con qué flag verlo.

Lo segundo no es esconder datos: es no obligar a alguien a scrollear un mes de
programación para ver si llega a la función de las nueve.

**Regla:** el default de la vista humana es una decisión de diseño y no una
consecuencia de lo que devolvió la API.

## 4. Repetición vertical es un encabezado

Si una columna repite el mismo valor en filas contiguas, **es un encabezado de
grupo disfrazado de columna**. El caso extremo lo deja claro: después de filtrar
por una película, la tabla mostraba catorce filas con el título que el usuario
acababa de escribir para filtrar.

Agrupado: el título va una vez, y la tabla pasa de nueve columnas a cinco.

**Corolario:** dentro de un grupo, una columna con valor uniforme se sube al
encabezado y desaparece de las filas. La decisión es por grupo y no global: si
una película va toda en 2D subtitulada, esas columnas sobran; si varía entre
funciones, vuelven.

**Corolario del corolario:** agrupá por la **entidad**, no por el string que
mostrás. Agrupar por `nombre` descartó el identificador que hacía falta para
armar el comando siguiente, y el costo apareció recién al querer enriquecer el
encabezado.

## 5. Emitir el comando, no el argumento

Esta regla se equivocó dos veces antes de quedar bien, y las dos correcciones
las trajo el usuario mirando la salida.

**Primer intento (mal):** "los identificadores son de máquina, van al JSON".
Falso. El slug es exactamente lo que la persona tipea en el próximo comando, así
que esconderlo la obliga a adivinarlo o a irse al modo JSON, que es justo el
modo que no está usando.

**Segundo intento (incompleto):** "mostrá el slug solo si no es derivable del
nombre". Mejor, pero deja al lector aplicando una transformación mental
(`Parque Brown` a `parquebrown`) en vez de leer un valor.

**Versión final:** cuando el próximo paso es un comando concreto y determinado
por la fila, **emitir el comando entero**, en tenue, al final de la fila o en el
encabezado del grupo. Cuesta los mismos caracteres que el identificador pelado,
se copia sin armarlo, y documenta la sintaxis del CLI en cada fila.

```
Palermo    Beruti 3399, Palermo CABA    butaca palermo
```

Y cuando una columna sí lleva el identificador solo, **nombrá la columna como el
flag que lo consume** (`--peli`, no `slug`). El encabezado pasa a ser su propia
documentación.

**La pregunta que decide:** ¿puede el lector llegar al próximo comando sin salir
de la pantalla que está mirando? Si la respuesta es no, falta el identificador.

**Y hay que hacerse esa pregunta sobre la segunda fila, no sobre la que
emitiste.** Agregamos un comando ejecutable al pie de una tabla de 23 funciones
y el usuario respondió: "no tenemos forma de saber este número". El ejemplo
andaba pegado tal cual, y para cualquiera de las otras 22 filas no había de dónde
sacar el argumento. Un comando emitido resuelve el caso que muestra; una columna
resuelve todos. Si la fila de al lado no puede armar su propio comando, lo que
falta es el identificador en la tabla, no un ejemplo mejor.

## 6. Partir por accionabilidad, no por categoría del dominio

El dominio daba tres estados. La persona distingue dos cosas: lo que puede hacer
ahora y lo que solo puede anotar.

De 42 títulos futuros, 5 tenían funciones a la venta y 37 solo una fecha.
Renderizarlos con el mismo peso los aplana a todos.

- **lo accionable**: tarjeta con su métrica y el comando listo para copiar.
- **lo informativo**: una línea por grupo, con el único campo que importa.

**Regla:** la taxonomía del backend no es la jerarquía visual.

## 7. Urgencia medida sobre estado crudo

"Estrena el 29" es un dato. "El día del estreno va 33 por ciento vendido y el
siguiente promedia 10" es una decisión. El segundo sale de agregar datos que ya
estaban en la respuesta.

Sobre el tono: la comparación se redactó en condicional (*"si pudieras esperar
al 30, promediaría 9.8 por ciento vendido"*) y no como consejo. La herramienta
observa lo que midió; no le dice a nadie qué hacer con su plata ni afirma
causalidad sobre por qué un día vende más.

## 8. Dos columnas contrapuestas contra una tabla ordenada

Cuando la persona busca un extremo y no el conjunto, veintiún filas ordenadas la
obligan a leer las veintiuna. "Las más vacías" contra "las que vuelan", tres y
tres, resuelven la misma pregunta en seis filas.

## 9. El help es la primera pantalla

La skill pide un banner con gradiente y no dice nada del texto que va
inmediatamente debajo. Quedó un ASCII art a color seguido de treinta líneas
monocromáticas.

Con jerarquía mínima (secciones en negrita subrayada, comandos en negrita, flags
en color, placeholders en cursiva tenue) se escanea sin leerlo entero. Si vale
la pena pedir un banner, vale la pena el párrafo siguiente.

## 10. Dibujar una grilla: elegí el glifo por dónde queda en la celda

Tres intentos hasta dar con el correcto, y el criterio no era la forma sino la
posición dentro de la celda.

| Glifo | Qué pasa |
|---|---|
| `█` | Llena la celda de arriba a abajo: las filas contiguas se tocan y la grilla se lee como barras verticales continuas |
| `▀` | Deja aire abajo pero se pega al techo |
| `◼` | Centrado vertical y horizontal |

**Los bloques de dibujo (`█ ▀ ▄`) existen para tocarse** y formar áreas
continuas. **Los símbolos geométricos (`◼ ● ▲`) existen para ser entidades
separadas.** Una grilla de objetos discretos quiere lo segundo.

Corolario de alineación: **chequeá `east_asian_width` antes de elegir un
carácter no ASCII.** `■` es `Ambiguous` y renderiza a uno o dos anchos según el
emulador, lo que desalinea toda la grilla; `◼` es `Narrow` y es predecible.

Y una que es puro oficio: **la celda de terminal es el doble de alta que de
ancha**, así que un caracter por objeto sale rectangular. Dos caracteres por
objeto lo hacen cuadrado.

## 11. Revisá el otro eje

El mapa se dibujaba espejado en horizontal, lo arreglamos, y el vertical seguía
invertido: la fila más cercana a la pantalla se dibujaba abajo. Los dos ejes
salían del mismo sistema de coordenadas del proveedor y tenían la misma
probabilidad de estar al revés.

Peor: 163 tests verdes no lo detectaron, porque todos cubrían el eje horizontal.
**Cuando descubrís que una dimensión viene invertida, la otra es sospechosa por
defecto.**

## 12. Una cabecera de ejes solo sirve si el eje es homogéneo

Intenté poner los números de asiento como cabecera de columnas y era imposible:
**cada fila tenía su propia numeración** (la fila 2 iba impares a un lado del
pasillo y pares al otro; la 14 iba correlativa). La cabecera habría mentido en
casi todas las filas, y el primer intento imprimió una secuencia que no era la
numeración de ninguna.

La solución fue poner el número **dentro** de cada celda, bajo un flag. **Antes
de agregar una cabecera de ejes, verificá que el eje sea homogéneo. Si no lo es,
la cabecera es una mentira bien formateada.**

## 13. Una leyenda derivada no se desactualiza

La leyenda tenía cuatro estados hardcodeados de ocho posibles. Resultado: la
sala mostraba una butaca de un color que la leyenda no explicaba, y a la vez
listaba un estado que no existía en esa sala.

Armada desde **los estados presentes en los datos**, las dos fallas desaparecen.
Una leyenda escrita a mano se desincroniza en cuanto el upstream usa un valor
que no previste.

## 14. Un estado que varía entre respuestas no es un atributo

El mapa tenía una butaca en ámbar que yo había clasificado como un estado más de
la sala. El usuario preguntó qué era, lo verifiqué pidiendo el mismo recurso
tres veces, y **cambiaba en cada una**: era la butaca que el proveedor preasigna
a esa transacción.

Pasó de ser un color raro a ser la sugerencia por defecto del comando siguiente.
**Chequear cuesta pedir el mismo recurso dos veces**, y si el recon clasifica un
valor volátil junto a los estables, el cliente lo trata como fijo y pierde su
significado.

## 15. Un preview que muestra el input no es un preview

El comando de reserva preguntaba "vas a reservar 2-4, ¿confirmás?" repitiendo lo
que el usuario acababa de tipear, **antes** de resolver esa etiqueta contra los
datos reales. O sea confirmabas tu propio typo.

Movido a después de la resolución, muestra lo que el sistema entendió: fila,
asiento y estado de cada butaca. **Un preview tiene que mostrar la
interpretación, que es lo único que el usuario no puede verificar solo.**

Y una decisión asociada: **no pre-armes el comando con el flag que saltea la
confirmación.** Sería cómodo de copiar y por eso mismo es peligroso: el usuario
lo pega sin haber decidido saltearla. Se ofrece después de cancelar, cuando ya
vio el preview.

## 16. Un ejemplo emitido es una promesa ejecutable

Tres versiones del mismo error:

1. `--asientos <F12,F13>`: butacas inventadas **y** formato equivocado (esa sala
   usa filas numéricas, no letras).
2. Las dos primeras butacas libres: existen y son arbitrarias.
3. La butaca que el proveedor preasignó: existe y es la que el usuario vería
   marcada en el sitio.

**Si tu salida imprime un fragmento de comando, ese fragmento tiene que funcionar
pegado tal cual.** Un ejemplo que falla al pegarlo es peor que no dar ejemplo.

**Y tiene que sobrevivir al comando que lo consume.** La tercera versión, la
"mejor", resultó ser la peor: la butaca preasignada pertenece a la transacción
que la creó, así que ejecutar el comando sugerido abría una transacción nueva
que invalidaba su propio argumento. El ejemplo era irreproducible por
construcción. La pregunta no es "¿este valor existe?" sino "¿sigue existiendo
después de que corran lo que le estoy sugiriendo?".

Lo notable es que la regla 14 de este mismo archivo ya decía que ese estado era
volátil. Reconocer que un dato es efímero y no usarlo como argumento estable son
dos pasos distintos, y el segundo no se sigue del primero.

Lo mismo con los flags que la salida sugiere: si imprimís `--peli <slug>` en cada
tarjeta, ese flag tiene que existir. Un `--help` que no lo lista es una promesa
a medias.

## 17. El upstream comunica estados operativos por texto libre

El proveedor cortó su venta online sin ningún indicador estructurado: sin flag en
su config, con un código de error genérico, y el aviso solo en el texto del
mensaje.

Detectarlo explícitamente cambia el hint de "puede ser un problema temporal de la
API" (que manda al usuario a debuggear su instalación) a "el proveedor cortó la
venta, consultar sigue andando, probá más tarde".

**Cuando un upstream comunica un estado operativo solo por prosa, vale
reconocerlo.** El costo es una expresión regular; el beneficio es que el usuario
no busca el problema donde no está.

## 17b. Al cambiar un dato, revisá todo lo que lo describe

Corolario de la regla 16, aprendido inmediatamente después de aplicarla. Saqué
la butaca preasignada del comando sugerido y dejé intacta la leyenda que la
llamaba **"la que te asignaron"**.

Resultado: el mapa pintaba de ámbar una butaca diciendo que era del usuario, y
el comando de abajo nombraba otra. Dos afirmaciones incompatibles en la misma
pantalla, sin nada que las conciliara. Antes del fix había un ejemplo que
fallaba; después, una contradicción.

**Un fix parcial en una superficie visual produce contradicción, no solo
información faltante.** El texto que describe un dato es parte del dato.

**Y un ejemplo sin etiqueta se lee como estado.** El comando salía pelado, y
pelado significa "esto es lo que elegiste". Si la interfaz no tiene el concepto
de "seleccionado", hay que decirlo, porque el usuario llega con ese modelo
mental desde cualquier app equivalente.

## 18. Una barra y una etiqueta no comparten escala

`barraOcupacion` escalaba hasta el 50 por ciento para que su tope coincidiera con
el corte de la etiqueta. Resultado en salida real: una función al 54 por ciento
vendido y otra al 78 dibujaban **la misma barra llena**.

La barra distinguía bien entre salas vacías y dejaba de distinguir entre las que
se están llenando, que es donde el dato sirve para decidir.

**La etiqueta traduce a palabras y ahí vive el umbral; la barra muestra magnitud
y quiere el rango completo.** Atarlas convierte a la barra en una versión peor de
la etiqueta, que ya está al lado.

Es el reverso de la regla 2: allá la escala estaba mal calibrada, acá estaba
truncada, y el síntoma es idéntico, una columna donde casi todo se ve igual.

**Y el test defendía el bug.** Se llamaba "la barra llena coincide con la
etiqueta casi llena" y afirmaba que 50 por ciento vendido llena la barra entera:
codificaba la saturación como comportamiento deseado. Un test escrito desde la
implementación en vez de desde la pregunta del lector ("¿cuál está más llena?")
no falla cuando la implementación está mal.

## Rastrillos técnicos

Tres cosas que rompen apenas agregás estilo a algo que antes era plano:

1. **Medir anchos con `.length` y alinear con `.padEnd`** cuenta los bytes de
   escape ANSI como columnas y desalinea todo. Hace falta una medida de ancho
   visible que ignore los escapes.
2. **El texto de ayuda como constante de módulo** se evalúa al importar y
   congela el estado del color, así que `NO_COLOR` deja de funcionar. Tiene que
   ser una función.
3. **Los tests corren sin TTY**, donde el color está apagado y todas las
   funciones de estilo devuelven texto crudo. Una suite entera puede pasar en
   verde sin ejercer nunca el camino con color: para probar el alineado hay que
   inyectar los escapes a mano en el fixture.

## Qué NO cambia

Todo lo anterior es **exclusivamente** modo humano. En las tres rondas de
cambios el contrato de máquina quedó intacto: mismos campos, mismo conjunto
completo, mismo envelope. Verificado después de cada ronda.

Esa es la condición que hace segura toda esta sección: si mejorar la lectura
humana obliga a tocar el JSON, la que está mal es la propuesta.
