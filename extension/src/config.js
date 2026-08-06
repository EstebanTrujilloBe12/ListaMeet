// Cambia la URL solo si tu servidor no está en este mismo computador.
// El acceso se realiza desde el icono de la extensión, no con un token manual.
const ATTENDANCE_CONFIG = {
  apiBaseUrl: "http://localhost:3000/api",
  apiBaseUrlStorageKey: "attendance-api-base-url",
  syncEveryMs: 30_000
};
