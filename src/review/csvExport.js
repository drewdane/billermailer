function csvEscape(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function csvFromRows(csvRows) {
  return csvRows.map(r => r.map(csvEscape).join(",")).join("\n");
}

function lineKindRank(l) {
  const kind = String(l.lineKind || "").toUpperCase();

  if (kind === "BASE") return 10;
  if (kind === "CANCEL_FEE") return 10;

  if (
    kind === "AFTER_HOURS" ||
    kind === "THIRD_SHIFT" ||
    kind === "WEEKEND" ||
    kind === "HOLIDAY" ||
    kind === "O2" ||
    kind === "BARI" ||
    kind === "HAZMAT" ||
    kind === "WAIT" ||
    kind === "DEADHEAD" ||
    kind === "ATTENDANT" ||
    kind === "MATCH_TO_QUOTE"
  ) return 20;

  if (kind === "MILEAGE") return 30;

  return 50;
}

function compareInvoiceLines(a, b) {
  const riderA = String(a.rider || "").trim().toUpperCase();
  const riderB = String(b.rider || "").trim().toUpperCase();

  if (riderA !== riderB) return riderA.localeCompare(riderB);

  const dateA = String(a.rideDateISO || "");
  const dateB = String(b.rideDateISO || "");

  if (dateA !== dateB) return dateA.localeCompare(dateB);

  const idA = String(a.lineId || "");
  const idB = String(b.lineId || "");

  if (idA !== idB) return idA.localeCompare(idB);

  return lineKindRank(a) - lineKindRank(b);
}

function buildCsvRowsFromGrouped(grouped, period, { fmtQboDate }) {
  const csvRows = [
    ["Customer", "InvoiceNo", "InvoiceDate", "DueDate", "ServiceDate", "Product/Service", "Description", "Qty", "Rate", "Amount", "Class"],
  ];

  for (const inv of grouped) {
    const sortedLines = [...inv.lines].sort(compareInvoiceLines);

    for (const l of sortedLines) {
      const invoiceDate = l.isPrivatePay
        ? fmtQboDate(l.rideDateISO || "")
        : fmtQboDate(period.split("_")[2] || "");

      csvRows.push([
        inv.customer,
        inv.invoiceNo,
        invoiceDate,
        invoiceDate,
        fmtQboDate(l.rideDateISO || ""),
        l.productService || "Services",
        l.lineDescription,
        l.qty === "" ? "" : Number(l.qty ?? 1).toFixed(2),
        l.rate === "" ? "" : Number(l.rate ?? l.amount ?? 0).toFixed(2),
        Number(l.amount || 0).toFixed(2),
        l.className || "",
      ]);
    }
  }

  return csvRows;
}

module.exports = {
  csvEscape,
  csvFromRows,
  buildCsvRowsFromGrouped,
};