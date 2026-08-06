# Asistencia para Google Meet

Proyecto de referencia con una extensión Chrome Manifest V3, una API Express/MySQL y un panel web en tiempo real.

> Usa esta herramienta únicamente con autorización de la institución, el profesor y las personas participantes. Google Meet no ofrece una API estable del DOM de participantes: el archivo `extension/src/meet-observer.js` concentra los selectores que podrían necesitar ajustes después de cambios en Meet o para otros idiomas.

## Despliegue en Render y GitHub

El repositorio incluye `render.yaml`: al conectarlo como **Blueprint** en Render, el servidor se instala con `npm ci`, crea las tablas que falten al iniciar, verifica `GET /health` y se inicia con `npm start`. Cada push a la rama conectada vuelve a desplegarlo automaticamente.

1. Crea una base de datos **MySQL** administrada y guarda `host`, `puerto`, `base`, `usuario` y `contrasena`. Render ofrece PostgreSQL administrado, pero esta aplicacion usa MySQL, por lo que la base debe ser de un proveedor MySQL externo o una que ya tengas. La base debe existir; las tablas las crea la aplicacion.
2. Sube esta carpeta a un repositorio de GitHub. No publiques `.env`: ya esta excluido por `.gitignore`.
3. En Render, selecciona **New > Blueprint**, conecta el repositorio y acepta `render.yaml`.
4. Render pedira `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER` y `MYSQL_PASSWORD`. Completa los valores de tu base. Para Aiven deja `MYSQL_SSL=true` y usa `MYSQL_SSL_REJECT_UNAUTHORIZED=false`, porque Aiven entrega su propio certificado.
5. En las variables privadas agrega `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. En el primer inicio se crea esa cuenta como **Administrador**. El administrador puede ver las cuentas registradas, sus correos, clases y sesiones, y restablecer contrasenas. Las contrasenas existentes no se pueden ver: se almacenan como hashes seguros.
6. Al finalizar, abre `https://TU-SERVICIO.onrender.com/health`. Debe responder `{ "ok": true }`. Esa misma URL abre el panel.
7. Recarga la extension en `chrome://extensions`. Se conecta automaticamente al servidor de Render y solo pide iniciar sesion.

El plan gratuito de Render arranca el servidor automaticamente en cada despliegue y al recibir la primera solicitud, pero lo suspende tras 15 minutos sin trafico. La primera visita posterior puede tardar alrededor de un minuto; para disponibilidad continua se necesita un plan de pago. La base de datos no se guarda en el disco temporal del servidor.

## Estructura

```
asistencia-google-meet/
├── extension/       # Extensión cargable en Chrome
├── server/          # API, base de datos y lógica de asistencia
├── web/             # Panel del profesor, servido por Express
├── .env.example     # Variables requeridas por el servidor
└── package.json
```

## Preparación

1. Crea una base de datos MySQL llamada `asistencia_meet`.
2. El servidor crea las tablas necesarias automaticamente al arrancar; no hace falta ejecutar el esquema en una instalacion nueva.
3. Copia `.env.example` a `.env`, completa la conexión MySQL y define un `JWT_SECRET` largo y aleatorio.
4. Si ya ejecutaste una version anterior, aplica una vez y en orden las migraciones `001_add_users_auth.sql` a `004_scope_students_to_courses.sql`. Las instalaciones nuevas se inicializan al arrancar.
5. Ejecuta `npm install` y después `npm run dev`.
6. Abre `http://localhost:3000` y crea una cuenta de profesor con nombre, correo y contraseña.
7. En Chrome, abre `chrome://extensions`, activa el modo desarrollador y usa **Cargar descomprimida** seleccionando la carpeta `extension`.
8. Desde el icono de la extension, crea o inicia sesion con la misma cuenta. La extension se conecta automaticamente al servidor configurado.

## Uso

1. En **Mis clases**, pulsa **Agregar clase**, escribe su nombre e ID y sube el Excel `.xlsx` de sus estudiantes. Se guardará el padrón dentro de esa clase.
2. Cada tarjeta de clase tiene **Editar** y **Eliminar**. En **Estudiantes** puedes seleccionar una clase y agregar, editar o eliminar integrantes de su padrón. Eliminar una clase borra también sus sesiones y asistencia, por lo que requiere confirmación.
3. Entra a una reunión de Meet y abre el panel de participantes si Meet no lo abre automáticamente.
4. Pulsa **Iniciar asistencia** y escribe el ID o código de la clase que se mostrará en el selector.
5. La extensión envía entradas, salidas y una sincronización periódica al servidor.
6. El panel muestra el padrón completo, asistentes, ausentes y una tabla separada de nombres no encontrados. Pulsa **Finalizar clase** para cerrar intervalos abiertos, o descarga el informe en PDF o CSV para Excel.

## Padrón y coincidencias

No hay estudiantes ni clases precargados: cada docente crea sus propios grupos. Las nuevas clases aceptan Exceles con una columna **Nombre**; Código, Programa y Correo son opcionales. La comparación de nombres es estricta: solo normaliza mayúsculas, tildes y espacios; no trata de adivinar apodos o nombres parciales. Los nombres que no coincidan se conservan en la sección **Participantes no encontrados**.

## Endpoints

Las rutas de asistencia requieren `Authorization: Bearer <sesión>`; la sesión se obtiene automáticamente al crear cuenta o iniciar sesión.

| Método | Ruta | Uso |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Crea una cuenta de profesor. |
| `POST` | `/api/auth/login` | Inicia sesión. |
| `GET` | `/api/auth/me` | Devuelve el profesor autenticado. |
| `GET` | `/api/admin/users` | Solo administrador: lista cuentas y resumen de actividad. |
| `GET` | `/api/admin/users/:id/activity` | Solo administrador: consulta clases y sesiones de una cuenta. |
| `PATCH` | `/api/admin/users/:id/password` | Solo administrador: restablece una contrasena. |
| `POST` | `/api/classes/start` | Crea una sesión de clase. |
| `GET` | `/api/courses` | Lista las clases y su número de estudiantes. |
| `POST` | `/api/courses` | Crea una clase con los encabezados `x-course-name`, `x-course-code` y un Excel `.xlsx` como cuerpo. |
| `PATCH` | `/api/courses/:id` | Edita nombre e ID de una clase. |
| `DELETE` | `/api/courses/:id` | Elimina la clase, su padrón y sus sesiones. |
| `GET` | `/api/classes?status=active` | Lista clases. |
| `GET` | `/api/classes/:id` | Obtiene la sesión y el resumen. |
| `POST` | `/api/classes/:id/finish` | Finaliza la clase. |
| `POST` | `/api/attendance/events` | Registra una entrada o salida. |
| `POST` | `/api/attendance/sync` | Reconcilia la lista actual de Meet. |
| `GET` | `/api/attendance/classes/:id/export` | Devuelve CSV compatible con Excel. |
| `GET` | `/api/attendance/classes/:id/export.pdf` | Devuelve el reporte PDF con asistencia, entrada, salida y duración. |
| `GET` | `/api/students?courseId=:id` | Devuelve el padrón de una clase. |
| `POST` | `/api/students` | Agrega un estudiante a una clase. |
| `PATCH` | `/api/students/:id` | Edita un estudiante de la clase seleccionada. |
| `DELETE` | `/api/students/:id` | Elimina un estudiante sin asistencia histórica. |

## Límites y endurecimiento recomendado

- La identificación de Meet se basa en `participantId` cuando está disponible y en el nombre como respaldo. Para registros académicos definitivos, integra un identificador institucional verificado.
- Las contraseñas se guardan con hash bcrypt; las sesiones JWT expiran tras 12 horas. Para producción usa HTTPS, recuperación de contraseña, verificación de correo y un secreto JWT administrado fuera del repositorio.
- Ajusta `MEET_SELECTORS` en `extension/src/meet-observer.js` si la interfaz de Meet cambia o se usa otro idioma.
- El PDF y CSV incluyen asistencia, horas de entrada y salida, duración y la sección de participantes no encontrados.
