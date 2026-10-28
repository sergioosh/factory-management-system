"use client";

import { downloadCsv } from "@/lib/csv";

export type ExportColumn = { header: string; numeric?: boolean };
export type ExportFormat = "xlsx" | "pdf" | "csv";

export type ExportData = {
  filename: string; // without extension
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: (string | number | null | undefined)[][];
};

const ACCENT = "D97706";
const ACCENT_SOFT = "FBF1E6";
const INK = "1C1917";

function stamp() {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function exportData(format: ExportFormat, d: ExportData) {
  if (format === "csv") {
    downloadCsv(
      `${d.filename}.csv`,
      d.columns.map((c) => c.header),
      d.rows,
    );
    return;
  }
  if (format === "xlsx") return exportExcel(d);
  return exportPdf(d);
}

async function exportExcel(d: ExportData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Factory MIS";
  wb.created = new Date();
  const ws = wb.addWorksheet(d.title.slice(0, 28), {
    views: [{ state: "frozen", ySplit: d.subtitle ? 3 : 2 }],
  });
  const nCols = d.columns.length;

  // title
  ws.mergeCells(1, 1, 1, nCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = d.title;
  titleCell.font = { bold: true, size: 14, color: { argb: `FF${INK}` } };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 22;

  let headerRowIdx = 2;
  if (d.subtitle) {
    ws.mergeCells(2, 1, 2, nCols);
    const sub = ws.getCell(2, 1);
    sub.value = d.subtitle;
    sub.font = { size: 10, color: { argb: "FF8A8A8A" } };
    headerRowIdx = 3;
  }

  // header
  const header = ws.getRow(headerRowIdx);
  d.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ACCENT}` } };
    cell.alignment = { horizontal: c.numeric ? "right" : "left", vertical: "middle" };
  });
  header.height = 18;

  // body
  d.rows.forEach((r, ri) => {
    const row = ws.getRow(headerRowIdx + 1 + ri);
    d.columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = r[ci];
      cell.value = v ?? "";
      cell.font = { size: 10 };
      cell.alignment = { horizontal: c.numeric ? "right" : "left" };
      if (c.numeric && typeof v === "number") cell.numFmt = "#,##0";
      if (ri % 2 === 1)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ACCENT_SOFT}` } };
    });
  });

  // widths
  d.columns.forEach((c, i) => {
    let w = c.header.length;
    for (const r of d.rows) w = Math.max(w, String(r[i] ?? "").length);
    ws.getColumn(i + 1).width = Math.min(Math.max(w + 3, 10), 48);
  });

  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: nCols },
  };

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${d.filename}.xlsx`,
  );
}

async function exportPdf(d: ExportData) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const landscape = d.columns.length > 6;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(28, 25, 23);
  doc.text(d.title, 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  if (d.subtitle) doc.text(d.subtitle, 14, 22);
  doc.text(`Generated ${stamp()}`, w - 14, 16, { align: "right" });

  const numericCols = new Set(d.columns.map((c, i) => (c.numeric ? i : -1)).filter((i) => i >= 0));

  autoTable(doc, {
    startY: d.subtitle ? 26 : 22,
    head: [d.columns.map((c) => c.header)],
    body: d.rows.map((r) =>
      r.map((v) =>
        typeof v === "number" ? v.toLocaleString("en-US") : String(v ?? ""),
      ),
    ),
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [28, 25, 23], lineColor: [231, 229, 228], lineWidth: 0.1 },
    headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: Object.fromEntries(
      [...numericCols].map((i) => [i, { halign: "right" }]),
    ),
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === "head" && numericCols.has(data.column.index)) {
        data.cell.styles.halign = "right";
      }
    },
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Factory MIS · page ${p} of ${pages}`,
      w / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );
  }

  doc.save(`${d.filename}.pdf`);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
