# Cineplanet Perú

Soporte de consulta pública de Cineplanet Perú.

Admite cines, cartelera, funciones, butacas y recomendar con `--cadena cineplanet-pe`. Los mapas y las recomendaciones son consultas públicas sin cuenta, orden, bloqueo de asientos ni pago. No admite auth, reservar, elegir, estrenos ni precios/preflight. `--dry-run` en recomendar omite el mapa; en butacas sigue siendo una consulta sin escritura.

```sh
butaca --cadena cineplanet-pe funciones --cine cp-brasil --peli clayface --fecha mañana
butaca --cadena cineplanet-pe funciones --cine cp-centro-civico --peli clayface --todas
butaca --cadena cineplanet-pe recomendar clayface --cine cp-brasil --fecha mañana --personas 1
butaca --cadena cineplanet-pe butacas SESSION_ID --cine cp-centro-civico
```

El catálogo trae los complejos peruanos; los mapas se verificaron con CP Brasil (0000000004) y CP Centro Cívico (0000000007).

Fechas en America/Lima. Se aceptan hoy, mañana y YYYY-MM-DD. Funciones muestra hoy por defecto; --todas muestra todos los días publicados futuros. No se infieren horarios de una semana a otra. dateTime es ISO 8601 con offset -05:00. La recomendación automática prioriza cantidad de asientos libres, luego la función más temprana. Para una franja horaria específica, filtrar primero funciones y consultar butacas de la función elegida.

El mapa normalizado ordena filas desde la pantalla, conserva huecos entre asientos y excluye accesibilidad, ocupados y estados desconocidos de las sugerencias. Estado nativo 0 disponible, 1 ocupado, 3 accesibilidad y otros bloqueados. transIdTemp=0 significa que no existe orden. sideEffect=none. Los enlaces abren la ficha de la película; no trasladan selección, sesión ni carrito.

Las consultas usan una sesión anónima, sin credenciales de usuario. --no-cache solicita revalidación al servidor; no garantiza ausencia de caché interna. Ante un contador de disponibilidad incoherente, se consulta el mapa y se cuentan las butacas regulares libres. El total de posiciones puede incluir espacios accesibles que el contador general no incluye. No se sustituye disponibilidad desconocida por cero.

La clasificación y duración proceden de la cartelera; una recomendación de asiento no predice cuánto miedo dará una película. Para reseñas o advertencias de contenido se requieren fuentes adicionales y respetar la preferencia de no spoilers.


Para el alcance propuesto de precios, promociones y recordatorios, ver [PLANIFICACION.md](PLANIFICACION.md). Estas funciones todavía no están implementadas.
