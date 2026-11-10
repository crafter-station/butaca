# Propuesta: elegir el día y planificar la salida

Estado: propuesta, no implementada en este cambio. La primera entrega habilita consultas de Cineplanet Perú. Esta propuesta describe cómo convertir esas consultas en una comparación de planes con costos y recordatorios.

## Comparar el costo del plan

Una persona quiere ver una película durante la semana, con flexibilidad de día y cine. Comparar funciones compatibles con su horario, idioma, cantidad de personas y preferencias de traslado. Consultar las tarifas reales de cada función y las promociones vigentes, en lugar de asumir que martes o miércoles siempre son más baratos.

Mostrar en una ficha:

- Película y resumen sin spoilers, duración y clasificación.
- Fecha, cine, formato, idioma, sala y hora de salida estimada.
- Butacas sugeridas, disponibles al momento de la consulta y sin reserva.
- Entrada, cargos obligatorios, descuento aplicado y total en PEN.
- Canchita u otros combos opcionales, separados de la entrada.
- Traslado estimado por separado, si se dispone de una fuente actual.
- Fuente, momento de consulta y condiciones pendientes de verificar.

Ejemplos de beneficios por investigar: operador móvil, tarjetas bancarias, campañas por día y combos. No afirmar que Entel, un banco o un día tienen descuento sin verificar vigencia, cine, función, canal de compra y requisitos.

La comparación debe usar el precio regular como base y presentar una promoción solo si el usuario cumple sus condiciones. Para verificar elegibilidad basta inicialmente con el nombre del beneficio o producto; no solicitar número completo de tarjeta, contraseña ni códigos. No mezclar un 2x1 para dos personas con el costo de una entrada individual. No contar canchita que el usuario no quiere como ahorro de su plan.

Si no hay tarifas confiables, mostrar precio pendiente y abstenerse de declarar un ganador por costo. Una recomendación puede priorizar comodidad o menor gasto de traslado; el más barato no siempre es el mejor plan.

## Recordatorio con margen de tiempo

Distinguir un plan tentativo de uno confirmado. Crear un recordatorio únicamente cuando se haya elegido o autorizado una fecha, una función y un canal de aviso. Un cambio de precio, horario o disponibilidad puede requerir revisar la recomendación, no comprar automáticamente.

Dos avisos configurables:

1. Comprar o decidir: por ejemplo, una o dos horas antes de la función.
2. Salir: hora de la función menos duración estimada del trayecto, acceso al cine y margen elegido.

Si la compra puede demorar, el aviso para comprar debe anteceder al de salida con margen suficiente. La dirección o ubicación exacta no debe almacenarse en el repositorio ni incluirse en logs públicos. El tiempo de traslado necesita una fuente y una fecha de consulta; no inferir seguridad de una ruta ni garantizar llegada.

Butaca puede devolver un plan y las horas calculadas; la entrega del aviso exige un programador externo o una integración separada. No prometer notificaciones solo por tener instalado el CLI. Zona horaria America/Lima, con instantes explícitos para evitar desfases.

## Entregas propuestas

1. Tarifas: comprobar el flujo de invitado hasta antes de pagar y determinar si consultar precios crea una orden o retiene inventario. Si tiene efectos, declararlos y no consultar masivamente funciones para comparar.
2. Promociones: fuentes oficiales, vigencia y elegibilidad verificable; pruebas con promoción vencida, cine excluido y 2x1 no aplicable.
3. Comparador: total desglosado, traslados opcionales y preferencias de comodidad. Probar que no recomienda por precio cuando faltan cargos.
4. Recordatorios: plan confirmado, elección del canal, edición/cancelación e idempotencia para evitar avisos duplicados. Pruebas de cambio de día, función modificada y entrada ya comprada.

No automatizar pago ni reservar asientos por el solo hecho de comparar opciones o enviar un aviso.
