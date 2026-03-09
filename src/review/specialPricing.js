// src/review/specialPricing.js

function applySpecialPricingRules(groupedTrip, rateRow, tripType, ctx = {}) {
  const rules = Array.isArray(ctx.specialPricingRules) ? ctx.specialPricingRules : [];

  for (const rule of rules) {
    const result = rule(groupedTrip, rateRow, tripType, ctx);
    if (result) return result;
  }

  return null;
}

module.exports = {
  applySpecialPricingRules,
};