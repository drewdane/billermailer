function normalizeInvoiceSplit(v) {
  const s = String(v || "").trim().toUpperCase();

  if (s === "ER") return "ER";
  if (s === "ADMISSION") return "ADMISSION";
  if (s === "DISCHARGE") return "DISCHARGE";
  if (s === "OTHER") return "OTHER";

  return "OTHER";
}

function inferThrSplit(r) {
  const erText = [
    r.PickupName,
    r.DropoffName,
    r.notesFull
  ].map(v => String(v || "").toLowerCase()).join(" ");

  if (
    /\bemergency\s+(room|department)\b/i.test(erText) ||
    /\bfrom\s+er\b/i.test(erText) ||
    /\bto\s+er\b/i.test(erText) ||
    /\bER\s+pickup\b/i.test(erText)
  ) {
    return "ER";
  }

  const pu = [
    r.PickupName,
    r.PickupAddress1
  ].map(v => String(v || "").toLowerCase()).join(" ");

  const drop = [
    r.DropoffName,
    r.DropoffAddress1
  ].map(v => String(v || "").toLowerCase()).join(" ");

  const hospitalRx =
    /\b(harris|texas health|THR|huguley|hospital|methodist)\b/i;

  if (hospitalRx.test(drop) && !hospitalRx.test(pu)) {
    return "ADMISSION";
  }

  if (hospitalRx.test(pu) && !hospitalRx.test(drop)) {
    return "DISCHARGE";
  }

  return "OTHER";
}

function pickPoNumber(rateRow, invoiceSplit) {
  const split = String(invoiceSplit || "").toUpperCase();

  if (split === "ER") {
    return (
      rateRow?.er_po_number ||
      rateRow?.ErPONumber ||
      rateRow?.erPoNumber ||
      rateRow?.po_number ||
      rateRow?.PONumber ||
      rateRow?.poNumber ||
      ""
    );
  }

  return (
    rateRow?.po_number ||
    rateRow?.PONumber ||
    rateRow?.poNumber ||
    ""
  );
}

function invoiceSplitSuffix(split) {
  const s = normalizeInvoiceSplit(split);

  if (s === "ER") return "ER";
  if (s === "ADMISSION") return "ADM";
  if (s === "DISCHARGE") return "DIS";
  return "OTH";
}

module.exports = {
  normalizeInvoiceSplit,
  inferThrSplit,
  pickPoNumber,
  invoiceSplitSuffix,
};