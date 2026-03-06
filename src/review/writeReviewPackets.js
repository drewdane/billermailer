// src/review/writeReviewPackets.js

const fs = require("fs");
const path = require("path");

function writeReviewPackets(items, outDir) {
  const facilities = {};

  for (const item of items) {
    const acct = item.AccountCode || "UNKNOWN";

    const rideDate = new Date(item.trip.RideDate);
    const day = rideDate.getDate();

    // billing period split
    const period =
      day <= 15
        ? `${rideDate.getFullYear()}-${String(rideDate.getMonth()+1).padStart(2,"0")}-01_15`
        : `${rideDate.getFullYear()}-${String(rideDate.getMonth()+1).padStart(2,"0")}-16_EOM`;

    if (!facilities[acct]) {
      facilities[acct] = {
        AccountName: item.AccountName,
        periods: {}
      };
    }

    if (!facilities[acct].periods[period]) {
      facilities[acct].periods[period] = {
        items: []
      };
    }

    facilities[acct].periods[period].items.push(item);
  }

  const index = { facilities: {} };

  for (const acct of Object.keys(facilities)) {
    const acctData = facilities[acct];

    index.facilities[acct] = {
      AccountName: acctData.AccountName,
      periods: {}
    };

    for (const period of Object.keys(acctData.periods)) {
      const periodData = acctData.periods[period];
      const dir = path.join(outDir, acct, period);

      fs.mkdirSync(dir, { recursive: true });

      const itemsPath = path.join(dir, "items.json");
      const overridesPath = path.join(dir, "overrides.json");

      fs.writeFileSync(
        itemsPath,
        JSON.stringify(periodData.items, null, 2),
        "utf8"
      );

      if (!fs.existsSync(overridesPath)) {
        fs.writeFileSync(
          overridesPath,
          JSON.stringify({ overrides: {} }, null, 2),
          "utf8"
        );
      }

      index.facilities[acct].periods[period] = {
        count: periodData.items.length
      };
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf8"
  );
}

module.exports = { writeReviewPackets };