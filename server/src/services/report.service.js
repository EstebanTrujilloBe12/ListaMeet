const PDFDocument = require("pdfkit");

const WINE = "#8F141B";
const OCHRE = "#DFD4A6";
const GRAY = "#4D626C";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(seconds) {
  const hours = Math.floor(Number(seconds || 0) / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((Number(seconds || 0) % 3600) / 60).toString().padStart(2, "0");
  const rest = Math.floor(Number(seconds || 0) % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${rest}`;
}

function writeHeader(doc, session, title) {
  doc.rect(0, 0, doc.page.width, 68).fill(WINE);
  doc.fillColor(OCHRE).font("Helvetica-Bold").fontSize(18).text("Asistencia Meet", 36, 20);
  doc.fillColor("#FFFFFF").font("Helvetica").fontSize(10).text("Reporte de asistencia · Google Meet", 36, 43);
  doc.fillColor(WINE).font("Helvetica-Bold").fontSize(14).text(title, 36, 88);
  doc.fillColor(GRAY).font("Helvetica").fontSize(9).text(
    `${session.courseName} · Meet: ${session.meetCode} · Clase: ${formatDate(session.startedAt)}`,
    36,
    108
  );
  return 135;
}

function drawTable(doc, startY, rows) {
  const columns = [
    ["Código", "studentCode", 70], ["Estudiante", "studentName", 210], ["Asistió", "attended", 52],
    ["Entrada", "firstJoinedAt", 106], ["Salida", "lastLeftAt", 106], ["Duración", "connectedSeconds", 72], ["Conex.", "intervals", 58]
  ];
  const x = 36;
  const width = columns.reduce((sum, [, , value]) => sum + value, 0);
  let y = startY;
  const header = () => {
    doc.rect(x, y, width, 22).fill(WINE);
    let left = x;
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    for (const [label, , columnWidth] of columns) { doc.text(label, left + 5, y + 7, { width: columnWidth - 10, lineBreak: false }); left += columnWidth; }
    y += 22;
  };
  header();
  for (const row of rows) {
    const values = {
      studentCode: row.studentCode || "—",
      studentName: row.studentName,
      attended: row.attended ? "Sí" : "No",
      firstJoinedAt: formatDate(row.firstJoinedAt),
      lastLeftAt: formatDate(row.lastLeftAt),
      connectedSeconds: formatDuration(row.connectedSeconds),
      intervals: String(row.intervals || 0)
    };
    const height = Math.max(24, doc.heightOfString(values.studentName, { width: 238 }) + 10);
    if (y + height > doc.page.height - 40) {
      doc.addPage();
      y = 42;
      header();
    }
    doc.rect(x, y, width, height).fill(row.attended ? "#FFFFFF" : "#F9F6ED");
    let left = x;
    doc.fillColor("#1E262B").font("Helvetica").fontSize(8);
    for (const [, key, columnWidth] of columns) {
      doc.text(String(values[key]), left + 5, y + 7, { width: columnWidth - 10, height: height - 10, ellipsis: true });
      left += columnWidth;
    }
    doc.strokeColor("#DBE0E2").lineWidth(.4).rect(x, y, width, height).stroke();
    y += height;
  }
  return y;
}

function streamAttendancePdf(response, session) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  response.set({
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="asistencia-${session.id}.pdf"`
  });
  doc.pipe(response);
  let y = writeHeader(doc, session, "Asistencia oficial");
  y = drawTable(doc, y, session.attendance);
  doc.fillColor(GRAY).font("Helvetica").fontSize(9).text(
    `Padrón: ${session.statistics.registered} · Asistieron: ${session.statistics.attended} · Ausentes: ${session.statistics.absent}`,
    36,
    Math.min(y + 14, doc.page.height - 30)
  );
  if (session.unmatched.length) {
    doc.addPage();
    y = writeHeader(doc, session, "Participantes no encontrados en el padrón");
    drawTable(doc, y, session.unmatched.map((row) => ({ ...row, studentCode: "—", attended: true })));
  }
  doc.end();
}

module.exports = { formatDuration, streamAttendancePdf };
