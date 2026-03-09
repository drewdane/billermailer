// src/review/orgSettings.js

const orgSettings = {
  specialPricing: {
    gmtd: {
      enabled: true,
      privatePayOnly: true,
      requiresRoundTrip: true,
      allowedTripTypes: ["AMBU", "HASWC", "NEEDWC", "WC"],
      loopName: "fort_worth_820",
    },
  },
};

module.exports = {
  orgSettings,
};