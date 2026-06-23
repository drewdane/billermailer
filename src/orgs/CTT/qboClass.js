function isPrivatePayTrip(r) {
  const code = String(r.AccountCode || "").trim().toLowerCase();
  const name = String(r.AccountName || "").trim().toLowerCase();

  return code === "private pay" || name === "private pay";
}

function inferQboClass(r, helpers = {}) {

  const manualClass =
    r.review?.ClassOverride ||
    r.review?.QboClassOverride ||
    r.review?.BillingClassOverride ||
    r.review?.InferredClassOverride ||
    "";

  if (String(manualClass || "").trim()) {
    return String(manualClass).trim();
  }

  const matchesAnyBillingAddress =
    helpers.matchesAnyBillingAddress || (() => false);

  if (String(r.pricing?.pricingType || "").toUpperCase() === "GMTD") {
    return "390 GMTD";
  }

  const shape = String(r.TripShape || "").toUpperCase();
  const rawStatus = String(r.RideStatus || "").trim().toLowerCase();
  const cancelOverride = String(r.review?.CancelOverride || "AUTO").toUpperCase();

  const isCancelled =
    cancelOverride === "YES" ? true :
    cancelOverride === "NO" ? false :
    rawStatus === "noshow" || rawStatus === "ridercancel";

  if (
    r.HalfRoundTripCandidate ||
    r.InferredClassHint === "350 Half Round Trip"
  ) {
    return "350 Half Round Trip";
  }

  if (isCancelled) return "450 Cancellation";

  const isPrivatePay = isPrivatePayTrip(r);

  if (
    isPrivatePay &&
    (shape === "ROUND_TRIP" || shape === "MULTI_STOP")
  ) {
    return "380 Private Pay Round Trip";
  }

  if (isPrivatePay) return "375 Private Pay One Way";

  if (shape === "ROUND_TRIP") return "300 Round Trip";
  if (shape === "MULTI_STOP") return "300 Round Trip";

  const puAddr = r.PickupAddress1 || "";
  const doAddr = r.DropoffAddress1 || "";

  if (matchesAnyBillingAddress(doAddr, r)) {
    return "100 Admission";
  }

  if (matchesAnyBillingAddress(puAddr, r)) {
    return "200 Discharge";
  }

  return "400 Other";
}

module.exports = {
  inferQboClass,
  isPrivatePayTrip,
};