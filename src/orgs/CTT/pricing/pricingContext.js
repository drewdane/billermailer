// src/orgs/CTT/pricing/pricingContext.js

const path = require("path");
const { deriveInLoop } = require("./inLoop");
const { gmtdRule } = require("./rules/gmtdRule");
const { medstarInLoopRule } = require("./rules/medstarInLoopRule");

const ratesPath = path.join("src", "orgs", "CTT", "rates", "accounts_v2.csv");

function buildPricingContext(groupedTrip) {
  const loop = deriveInLoop(groupedTrip);

  return {
    specialPricingRules: [
      gmtdRule,
      medstarInLoopRule,
    ],
    derived: {
      inLoop: loop.inLoop,
      inLoopReason: loop.reason,
      gmtdRoundTripMilesRaw: Number(groupedTrip.DirectMileage || 0),
    },
  };
}

module.exports = {
  ratesPath,
  buildPricingContext,
};