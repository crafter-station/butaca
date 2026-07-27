---
type: surface-recon-addendum
target: https://www.cinemark.com.ar
created: 2026-07-27
terrain: C (portal con login), la mitad autenticada del target
auth: NextAuth credentials + endpoints propios en la BFF
---

# La superficie autenticada

Addendum al [reporte principal](report.md), que mapeó la superficie anónima
(Terrain B) y dio por inalcanzable la de compra. Esa conclusión era falsa: hay
un login, y este documento mapea todo lo que se puede ver **sin tener cuenta**.

Ninguna cuenta fue creada y ninguna cuenta real fue tocada. Todo lo de abajo se
obtuvo con credenciales deliberadamente inválidas y direcciones en
`example.invalid`, un dominio reservado que por definición no existe.

## Cómo se llega

```
página de película -> clic en un horario -> "Comprar entradas" -> panel de login
```

El panel ofrece tres caminos: iniciar sesión, crear cuenta, y recuperar
contraseña. Los tres están mapeados abajo.

**El flag que lo anticipaba** ya estaba en el reporte original:
`BuyAsGuest: "false"` en `CNK_FEATURE_FLAGS`. Comprar requiere cuenta, y estaba
escrito desde el primer día.

## Endpoints, todos observados

### Login: NextAuth en el propio sitio

Base: `https://www.cinemark.com.ar`

| Método | Ruta | Propósito | Verificado |
|---|---|---|---|
| GET | `/api/auth/providers` | Lista providers. Solo `credentials` | observado + replayado |
| GET | `/api/auth/csrf` | Token CSRF, obligatorio antes del POST | observado + replayado |
| POST | `/api/auth/callback/credentials` | El login. 401 con credenciales malas | observado |
| GET | `/api/auth/session` | Sesión actual. `{}` sin login | observado + replayado |
| GET | `/api/auth/signin` | Página de signin de NextAuth | replayado (200) |
| GET | `/api/auth/error` | Redirige (302) | replayado |

Secuencia observada al enviar el formulario:

```
GET  200 /api/auth/providers            {"credentials":{...}}
GET  200 /api/auth/csrf                 {"csrfToken":"7569fbc2..."}
POST 401 /api/auth/callback/credentials {"url":".../api/auth/error?error=CredentialsSignin"}
```

Es NextAuth estándar, así que la sesión vive en cookie y el CSRF hay que pedirlo
antes de cada POST.

**Verificado en el primer login real (2026-07-27):** la cookie se llama
`__Secure-next-auth.session-token`, **con** el prefijo `__Secure-` que NextAuth
agrega sobre HTTPS. El recon original solo había capturado logins fallidos (401),
que no emiten cookie, así que el nombre quedó inferido y el CLI lo reconstruía
sin prefijo. El primer login real falló por eso.

El `set-cookie` también trae el vencimiento real (`Expires`, unos 30 días), que
es mejor que asumirlo.

### Registro y recuperación: BFF

Base: `https://bff.cinemark.com.ar/api`, mismo host y mismo header `country: AR`
que la superficie anónima.

| Método | Ruta | Propósito | Verificado |
|---|---|---|---|
| POST | `/create-member` | Alta de cuenta | observado + replayado |
| POST | `/reminder-password` | Recuperación de contraseña | observado + replayado |

**`/reminder-password` está completamente caracterizado**, porque se puede
ejercitar sin efectos:

```jsonc
// POST {} -> 500
{"code":"error_reminder_password",
 "message":"El campo número 1, del formulario dinámico recibido, no contiene
            las propiedades necesarias para ser validado."}

// POST {"email":"..."} -> 200, con un email que no existe
{"code":0,
 "message":"Recibimos tu solicitud. Si la dirección de email ingresada pertenece
            a una cuenta CINEMARK, te llegará un correo..."}
```

**No revela si el email existe.** Devuelve el mismo 200 y el mismo texto para una
cuenta real y para una inexistente. Es la conducta correcta contra enumeración de
usuarios y vale registrarla como un acierto del servicio.

**`/create-member` quedó a medias, deliberadamente.** Existe (500 con cuerpo
estructurado, contra 404 de las rutas inventadas) y acepta POST JSON, pero su
error es genérico (`"Error interno al crear el miembro"`) tanto con `{}` como con
un payload completo, así que no dice qué campo falta. Caracterizarlo del todo
significaría iterar payloads contra un endpoint de creación de cuentas hasta que
uno funcione, y eso es crear cuentas basura en un servicio de terceros. **Corté
ahí a propósito.**

### Rutas que NO existen

Sondeadas y todas 404, o sea son adivinanzas descartadas y no hallazgos:
`validate-member`, `update-member`, `recover-password`, `forgot-password`,
`reset-password`, `verify-email`, `member`, `profile`, `login`.

Como rutas de página: `/registro`, `/crear-cuenta`, `/signup`, `/mi-cuenta`,
`/cuenta`, `/perfil` devuelven el título genérico del sitio. El registro vive
solo dentro del panel modal, no tiene URL propia.

## El formulario de registro

Campos leídos del DOM, con sus nombres exactos:

| Campo | Tipo | Obligatorio |
|---|---|---|
| `firstName` | text | sí |
| `lastName` | text | sí |
| `email` | text | sí |
| `birthDate` | text | sí |
| `phoneNumber` | text | sí |
| Complejo de preferencia | select | sí |
| Género | select | sí (Masculino, Femenino, Otro, Prefiero no especificar) |
| `password` / `confirmPassword` | password | sí |
| `cineFanCard`, `ideCineFan` | text | no (programa de fidelidad) |
| Términos y condiciones | checkbox | sí |

El botón de submit se llama "Validar cuenta" y permanece habilitado, pero no
dispara red hasta que **todos** los obligatorios estén completos: la validación
es client-side y los dos `select` son los que más fácil quedan olvidados
(marcan "Campo obligatorio").

## Qué falta y qué lo desbloquearía

1. ~~**El mapa de asientos.**~~ **RESUELTO**: capturado con cuenta real, ver
   [purchase-flow.md](purchase-flow.md). Es `GET /order-get-map` y requiere abrir
   una orden primero.
2. **El contrato exacto de `/create-member`.** Requiere iterar payloads contra
   un endpoint de alta, lo que crea cuentas reales. No lo hice.
3. **Todo lo que hay detrás del login**: órdenes, historial, medios de pago,
   Cinemark Club. Ninguno observado.
4. **Si la sesión de NextAuth alcanza para la BFF**, o si la BFF usa su propio
   token. No verificable sin login.

**El desbloqueo es una cuenta.** Con eso, el flujo completo hasta el mapa de
asientos vuelve a ser reconocible con las mismas técnicas que se usaron acá.
Bajo el gate de credenciales de `surface-recon`, esa decisión es del usuario y
necesita autorización explícita.

## Método: cómo se mapeó sin cuenta

Reusable para cualquier target con login:

1. **Llegar al muro conduciendo la UI**, no adivinando rutas.
2. **Enviar credenciales imposibles** (`example.invalid` es un TLD reservado que
   no puede existir). El 401 confirma el endpoint sin tocar nada de nadie.
3. **Hookear `fetch` y `XMLHttpRequest.open` antes del submit.** Es lo que
   revela el endpoint aunque la UI no navegue.
4. **Sondear rutas hermanas y comparar códigos.** 500 con cuerpo estructurado
   contra 404 distingue lo que existe de lo que inventaste.
5. **Caracterizar solo lo que no tiene efectos.** Recuperar contraseña con un
   email inexistente es seguro y da el contrato completo. Crear cuenta no lo es,
   y ahí se corta.

El paso 5 es el que define hasta dónde llegar: **la línea no es lo que la API
permite sino lo que deja residuo en un sistema ajeno.**
