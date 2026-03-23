// src/orgs/CTT/pricing/pricingContext.js

const path = require("path");
const { deriveInLoop } = require("./inLoop");
const { gmtdRule } = require("./rules/gmtdRule");
const { medstarInLoopRule } = require("./rules/medstarInLoopRule");

const ratesPath = path.join("src", "orgs", "CTT", "rates", "accounts_v2.csv");

function buildPricingContext(groupedTrip) {
  const loop = deriveInLoop(groupedTrip);

  const legs = Array.isArray(groupedTrip.legs) && groupedTrip.legs.length
    ? groupedTrip.legs
    : [groupedTrip];

  const firstLeg = legs[0] || groupedTrip;
  const lastLeg = legs[legs.length - 1] || groupedTrip;

  const firstPickupLoop = deriveInLoop({
    PickupZip: firstLeg.PickupZip,
    PickupCity: firstLeg.PickupCity,
    DropoffZip: firstLeg.PickupZip,
    DropoffCity: firstLeg.PickupCity,
  });

  const lastDropoffLoop = deriveInLoop({
    PickupZip: lastLeg.DropoffZip,
    PickupCity: lastLeg.DropoffCity,
    DropoffZip: lastLeg.DropoffZip,
    DropoffCity: lastLeg.DropoffCity,
  });

  return {
    specialPricingRules: [
      gmtdRule,
      medstarInLoopRule,
    ],
    derived: {
      inLoop: loop.inLoop,
      inLoopReason: loop.reason,
      firstPickupInLoop: firstPickupLoop.inLoop,
      firstPickupInLoopReason: firstPickupLoop.reason,
      lastDropoffInLoop: lastDropoffLoop.inLoop,
      lastDropoffInLoopReason: lastDropoffLoop.reason,
      gmtdRoundTripMilesRaw: Number(groupedTrip.DirectMileage || 0),
    },
  };
}

module.exports = {
  ratesPath,
  buildPricingContext,
};