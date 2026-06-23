function fmtQboDate(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;

  return String(Number(m[2])) + "/" + String(Number(m[3])) + "/" + m[1];
}

function compactDateForDocNum(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "000000";
  return m[2] + m[3] + m[1].slice(-2);
}

function riderInitials(r) {
  const first = String(r.FirstName || "").trim();
  const last = String(r.LastName || "").trim();

  return ((first[0] || "X") + (last[0] || "X")).toUpperCase();
}

function shortAcctCode(acct) {
  const acctKey = String(acct || "").trim();

  if (global.BM_SHORT_CODE_MAP && global.BM_SHORT_CODE_MAP.has(acctKey)) {
    return global.BM_SHORT_CODE_MAP.get(acctKey);
  }

  throw new Error(`Missing ShortCode in accounts_v2 for account: "${acctKey}"`);
}

function buildPrivatePayInvoiceNo(r, serviceDate, seq = null) {
  const initials = String(r.ppInitials || riderInitials(r) || "XX").toUpperCase();

  const compactDate = String(serviceDate || "")
    .replace(/-/g, "")
    .slice(2);

  const base = "PP" + initials + "-" + compactDate;

  if (seq == null) return base;

  return base + "-" + String(seq).padStart(2, "0");
}

function buildInvoiceNo(acct, periodEndIso, suffix = null) {
  const base = shortAcctCode(acct) + "-" + compactDateForDocNum(periodEndIso);

  if (suffix == null) return base;

  if (typeof suffix === "number") {
    return base + "-" + String(suffix).padStart(2, "0");
  }

  return base + "-" + String(suffix).trim().toUpperCase();
}

function assertNoInvoiceNoCollisions(grouped) {
  const seen = new Map();

  for (const inv of grouped || []) {
    const invoiceNo = String(inv.invoiceNo || "").trim();
    const customer = String(inv.customer || "").trim();

    if (!invoiceNo) continue;

    const prior = seen.get(invoiceNo);
    if (prior && prior !== customer) {
      throw new Error(
        `Invoice number collision: ${invoiceNo} assigned to both "${prior}" and "${customer}"`
      );
    }

    seen.set(invoiceNo, customer);
  }
}

module.exports = {
  fmtQboDate,
  compactDateForDocNum,
  riderInitials,
  buildPrivatePayInvoiceNo,
  buildInvoiceNo,
  assertNoInvoiceNoCollisions,
};