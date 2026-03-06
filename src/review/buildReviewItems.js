// src/review/buildReviewItems.js

const { priceTrip } = require("../pricing/pricing");
const { combinedComments, notesPreview } = require("../utils/notes");

/**
 * Build review items from harvested trips
 */
function buildReviewItems(trips, rateLookupFn) {
  const items = [];

  for (const trip of trips) {
    const rateRow = rateLookupFn(trip);

    const pricing = rateRow
      ? priceTrip(trip, rateRow)
      : {
          pricingType: "NO_RATE",
          base: 0,
          mileage: 0,
          accessories: [],
          cancelFee: 0,
          total: 0,
          flags: ["NO_RATE_MATCH"]
        };

    const notesFull = combinedComments(trip);
    const notesShort = notesPreview(notesFull);

    const item = {
      LineId: trip.ConfirmationNumber || `${trip.RideDate}_${trip.FirstName}_${trip.LastName}`,

      AccountCode: trip.AccountCode,
      AccountName: trip.AccountName,

      trip,

      notesFull,
      notesPreview: notesShort,

      pricing,

      review: {
        Action: "INCLUDE",
        Modifier: "NONE",
        Note: "",
        MoveToAccountCode: "",

        AddHazmat: false,
        AddO2: false,
        AddBari: false,
        AddWait: false,
        WaitTotalMinutes: 0,
        AddDeadhead: false,
        DeadheadMiles: 0,

        MatchToQuote: false,
        QuoteAmount: 0
      }
    };

    items.push(item);
  }

  return items;
}

module.exports = {
  buildReviewItems
};