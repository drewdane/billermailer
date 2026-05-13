function parseMoney(v) {
  return Number(String(v || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
}

function progressiveDeadheadChargeFromMiles(miles, cfg) {
  const dhMiles = Number(miles || 0);
  if (dhMiles <= 0) return 0;

  const startMiles = parseMoney(cfg.dh_start_miles);
  const rate1 = parseMoney(cfg.dh_rate_tier1);
  const rate2 = parseMoney(cfg.dh_rate_tier2);
  const rate3 = parseMoney(cfg.dh_rate_tier3);
  const tier2Start = parseMoney(cfg.dh_tier2_start_miles);
  const tier3Start = parseMoney(cfg.dh_tier3_start_miles);

  if (dhMiles <= startMiles) return 0;

  let total = 0;

  // Tier 1
  const tier1From = startMiles;
  const tier1To = tier2Start > 0 ? Math.min(dhMiles, tier2Start - 1) : dhMiles;
  if (rate1 > 0 && tier1To > tier1From) {
    total += (tier1To - tier1From) * rate1;
  }

  // Tier 2
  if (tier2Start > 0 && dhMiles >= tier2Start && rate2 > 0) {
    const tier2To = tier3Start > 0 ? Math.min(dhMiles, tier3Start - 1) : dhMiles;
    if (tier2To >= tier2Start) {
      total += (tier2To - tier2Start + 1) * rate2;
    }
  }

  // Tier 3
  if (tier3Start > 0 && dhMiles >= tier3Start && rate3 > 0) {
    total += (dhMiles - tier3Start + 1) * rate3;
  }

  return Number(total.toFixed(2));
}

module.exports = {
  progressiveDeadheadChargeFromMiles,
};