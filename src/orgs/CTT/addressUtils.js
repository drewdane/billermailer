function normalizeAddress(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bSTATE\s+HIGHWAY\b/g, "HWY")
    .replace(/\bSTATE\s+HWY\b/g, "HWY")
    .replace(/\bHIGHWAY\b/g, "HWY")
    .replace(/\bROUTE\b/g, "RT")
    .replace(/\s+/g, " ")
    .trim();
}

function streetAddressKey(s) {
  return normalizeAddress(s)
    .replace(/[^A-Z0-9]/g, "");
}

function addressMatches(a, b) {
  const x = normalizeAddress(a);
  const y = normalizeAddress(b);

  if (!x || !y) return false;

  return x.includes(y) || y.includes(x);
}

function matchesAnyBillingAddress(addr, r) {
  if (!addr) return false;

  const candidates = [
    r.billingAddress,
    r.billing_address,
    r.billingAddress2,
    r.billingAddress3,
    r.alt_address_1,
    r.alt_address_2,
    r.alt_address_3,
  ];

  return candidates.some((c) => addressMatches(addr, c));
}

function applyLocationAliasToPlace(name, address1) {
  return {
    name,
    address1,
  };
}

function applyLocationAliasesToRow(row) {
  row.PickupName = row.PickupName || "";
  row.DropoffName = row.DropoffName || "";

  return row;
}

module.exports = {
  normalizeAddress,
  streetAddressKey,
  addressMatches,
  matchesAnyBillingAddress,
  applyLocationAliasToPlace,
  applyLocationAliasesToRow,
};