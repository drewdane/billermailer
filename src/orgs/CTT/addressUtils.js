const { getLocationAlias } = require("./locationAliases");

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
    .replace(/\bPARKWAY\b/g, "PKWY")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bCIRCLE\b/g, "CIR")
    .replace(/\bTRAIL\b/g, "TRL")
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
  const originalName = String(name || "");
  const originalAddress1 = String(address1 || "");

  const alias = getLocationAlias(originalName, originalAddress1);

  return {
    name: alias?.name || originalName,
    address1: alias?.address1 || originalAddress1,

    // Preserve the TripMaster values as the permanent alias key.
    originalName,
    originalAddress1,
  };
}

function applyAliasesToLeg(leg) {
  if (!leg) return leg;

  const pickup = applyLocationAliasToPlace(
    leg.OriginalPickupName || leg.PickupName,
    leg.OriginalPickupAddress1 || leg.PickupAddress1
  );

  const dropoff = applyLocationAliasToPlace(
    leg.OriginalDropoffName || leg.DropoffName,
    leg.OriginalDropoffAddress1 || leg.DropoffAddress1
  );

  leg.OriginalPickupName = pickup.originalName;
  leg.OriginalPickupAddress1 = pickup.originalAddress1;
  leg.OriginalDropoffName = dropoff.originalName;
  leg.OriginalDropoffAddress1 = dropoff.originalAddress1;

  leg.PickupName = pickup.name;
  leg.PickupAddress1 = pickup.address1;
  leg.DropoffName = dropoff.name;
  leg.DropoffAddress1 = dropoff.address1;

  return leg;
}

function applyLocationAliasesToRow(row) {
  if (!row) return row;

  if (Array.isArray(row.legs)) {
    row.legs.forEach(applyAliasesToLeg);
  }

  applyAliasesToLeg(row);

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