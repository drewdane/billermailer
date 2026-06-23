const fs = require("fs");
const path = require("path");

function readJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function moveRowsToAccount({ baseDir, fromAcct, toAcct, period, lineIds, safeJoin }) {
  if (!toAcct || toAcct === fromAcct || !Array.isArray(lineIds) || !lineIds.length) {
    return { moved: 0, skipped: true, reason: "nothing to move" };
  }

  const fromItemsPath = safeJoin(fromAcct, period, "items.json");
  const fromOverridesPath = safeJoin(fromAcct, period, "overrides.json");

  const toItemsPath = safeJoin(toAcct, period, "items.json");
  const toOverridesPath = safeJoin(toAcct, period, "overrides.json");
  const indexPath = safeJoin("index.json");

  const fromItems = readJson(fromItemsPath, null);
  if (!Array.isArray(fromItems)) {
    throw new Error(`Move failed: source items missing or invalid: ${fromItemsPath}`);
  }

  const toItems = readJson(toItemsPath, []);
  const fromOverrides = readJson(fromOverridesPath, { overrides: {} });
  const toOverrides = readJson(toOverridesPath, { overrides: {} });

  const moveSet = new Set(lineIds.map(String));

  const moving = [];
  const staying = [];

  for (const row of fromItems) {
    const id = String(row.LineId || "");

    if (moveSet.has(id)) {
      const movedRow = {
        ...row,
        AccountCode: toAcct,
        AccountName: toAcct,
      };

      if (Array.isArray(movedRow.legs)) {
        movedRow.legs = movedRow.legs.map((leg) => ({
          ...leg,
          AccountCode: toAcct,
          AccountName: toAcct,
        }));
      }

      moving.push(movedRow);
    } else {
      staying.push(row);
    }
  }

  if (!moving.length) {
    throw new Error(`Move failed: selected rows not found in source account ${fromAcct}`);
  }

  const movingIds = new Set(moving.map((r) => String(r.LineId || "")));

  const mergedToItems = [
    ...toItems.filter((r) => !movingIds.has(String(r.LineId || ""))),
    ...moving,
  ];

  if (!toOverrides.overrides) toOverrides.overrides = {};
  if (!fromOverrides.overrides) fromOverrides.overrides = {};

  for (const id of movingIds) {
    const sourceOverride = fromOverrides.overrides[id] || {};
    const existingDestOverride = toOverrides.overrides[id] || {};

    toOverrides.overrides[id] = {
      ...existingDestOverride,
      ...sourceOverride,
      MoveToAccountCode: "",
    };

    delete fromOverrides.overrides[id];
  }

  writeJson(fromItemsPath, staying);
  writeJson(toItemsPath, mergedToItems);
  writeJson(fromOverridesPath, fromOverrides);
  writeJson(toOverridesPath, toOverrides);

  const index = readJson(indexPath, { facilities: {} });
  if (!index.facilities) index.facilities = {};

  if (!index.facilities[toAcct]) {
    index.facilities[toAcct] = {
      AccountName: toAcct,
      periods: {},
    };
  }

  if (!index.facilities[toAcct].periods) {
    index.facilities[toAcct].periods = {};
  }

  index.facilities[toAcct].periods[period] = {
    ...(index.facilities[toAcct].periods[period] || {}),
    count: mergedToItems.length,
  };

  if (index.facilities[fromAcct]?.periods?.[period]) {
    index.facilities[fromAcct].periods[period].count = staying.length;
  }

  writeJson(indexPath, index);

  const verifyFrom = readJson(fromItemsPath, []);
  const verifyTo = readJson(toItemsPath, []);

  for (const id of movingIds) {
    if (verifyFrom.some((r) => String(r.LineId || "") === id)) {
      throw new Error(`Move verification failed: ${id} still exists in ${fromAcct}`);
    }

    if (!verifyTo.some((r) => String(r.LineId || "") === id)) {
      throw new Error(`Move verification failed: ${id} missing from ${toAcct}`);
    }
  }

  return {
    moved: moving.length,
    fromAcct,
    toAcct,
    period,
  };
}

module.exports = {
  moveRowsToAccount,
};