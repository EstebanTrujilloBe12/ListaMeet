function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requiredText(value, field, maxLength = 255) {
  if (typeof value !== "string" || !value.trim()) {
    throw httpError(400, `${field} es obligatorio`);
  }
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > maxLength) throw httpError(400, `${field} supera ${maxLength} caracteres`);
  return text;
}

function eventDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, "occurredAt no es una fecha válida");
  // Evita que un reloj de cliente erróneo altere la asistencia por horas o días.
  if (Math.abs(Date.now() - date.getTime()) > 10 * 60 * 1000) {
    throw httpError(400, "occurredAt debe estar a menos de 10 minutos de la hora del servidor");
  }
  return date;
}

function mysqlDate(date) {
  return date.toISOString().slice(0, 23).replace("T", " ");
}

// Solo elimina diferencias de presentación, no intenta adivinar personas.
// "Juan PC" y "Juan Castañeda Pérez" siguen siendo nombres distintos.
function normalizeName(value) {
  return requiredText(value, "nombre", 255)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CO")
    .replace(/\s+/g, " ")
    .trim();
}

function csvCell(value) {
  const text = String(value ?? "");
  // Excel interpreta =, +, - y @ como fórmulas; se neutralizan para evitar CSV injection.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  const headers = ["Código", "Estudiante", "Resultado", "Asistió", "Primera entrada", "Última salida", "Tiempo conectado (segundos)", "Tiempo conectado (HH:MM:SS)", "Conectado ahora", "Conexiones", "Reingresos", "Detalle de conexiones"];
  const body = rows.map((row) => [
    row.studentCode || "",
    row.studentName,
    row.matchStatus || "Encontrado",
    row.attended ? "Sí" : "No",
    row.firstJoinedAt || "",
    row.lastLeftAt || "",
    row.connectedSeconds,
    row.connectedTime,
    row.isConnected ? "Sí" : "No",
    row.intervals,
    Math.max(0, Number(row.intervals || 0) - 1),
    (row.connectionHistory || []).map((connection) => `${connection.joinedAt} -> ${connection.leftAt || "Conectado"} (${connection.totalSeconds}s)`).join(" | ")
  ].map(csvCell).join(","));
  return `\ufeff${headers.map(csvCell).join(",")}\n${body.join("\n")}\n`;
}

module.exports = { httpError, requiredText, eventDate, mysqlDate, normalizeName, toCsv };
