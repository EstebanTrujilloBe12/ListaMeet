const { strFromU8, unzipSync } = require("fflate");
const { httpError, requiredText } = require("../utils");

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlText(fragment) {
  return decodeXml([...String(fragment || "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join(""));
}

function columnIndex(cellRef) {
  const letters = String(cellRef || "").match(/[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return 0;
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1]));
}

function parseRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const index = columnIndex(attributes.match(/\br="([^"]+)"/)?.[1]);
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
      values[index] = type === "s" ? sharedStrings[Number(raw)] || "" : type === "inlineStr" ? xmlText(body) : decodeXml(raw);
    }
    rows.push(values);
  }
  return rows;
}

function cell(row, index) { return String(row[index] ?? "").trim(); }
function label(value) { return cell([value], 0).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CO"); }

function parseRoster(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw httpError(400, "Debes subir un archivo Excel válido");
  let files;
  try { files = unzipSync(new Uint8Array(buffer)); }
  catch { throw httpError(400, "No fue posible abrir el archivo Excel"); }
  const sheetPath = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetPath) throw httpError(400, "El Excel no contiene una hoja de cálculo legible");
  const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "");
  const rows = parseRows(strFromU8(files[sheetPath]), sharedStrings);
  const header = rows.findIndex((row) => row.some((value) => label(value) === "nombre"));
  if (header < 0) throw httpError(400, "El Excel debe incluir una columna llamada Nombre");
  const headers = rows[header].map(label);
  const nameColumn = headers.indexOf("nombre");
  const codeColumn = headers.findIndex((value) => value === "codigo" || value === "id" || value === "identificacion");
  const programColumn = headers.findIndex((value) => value === "programa");
  const emailColumn = headers.findIndex((value) => value === "email institucional" || value === "correo institucional" || value === "email" || value === "correo");
  const students = rows.slice(header + 1).map((row, index) => ({
    studentCode: codeColumn >= 0 ? cell(row, codeColumn) : `SIN-CODIGO-${index + 1}`,
    fullName: cell(row, nameColumn), program: programColumn >= 0 ? cell(row, programColumn) : "No especificado", institutionalEmail: emailColumn >= 0 ? cell(row, emailColumn) : "No especificado"
  })).filter((student) => student.fullName).map((student) => ({
    studentCode: requiredText(student.studentCode, "Código", 32),
    fullName: requiredText(student.fullName, "Nombre", 255),
    program: student.program || "No especificado",
    institutionalEmail: student.institutionalEmail || "No especificado"
  }));
  if (!students.length) throw httpError(400, "El Excel no contiene estudiantes válidos");
  if (students.length > 500) throw httpError(400, "El archivo supera el límite de 500 estudiantes");
  return students;
}

module.exports = { parseRoster };
