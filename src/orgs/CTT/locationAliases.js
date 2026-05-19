const fs = require("fs");
const path = require("path");

const aliasPath = path.resolve(
  __dirname,
  "location_aliases.json"
);

function normalizeKey(name, address1 = "") {
  return [
    String(name || "").trim().toLowerCase(),
    String(address1 || "").trim().toLowerCase()
  ]
    .join("|")
    .replace(/\s+/g, " ");
}

function loadAliases() {
  try {
    return JSON.parse(fs.readFileSync(aliasPath, "utf8"));
  } catch {
    return {};
  }
}

function saveAliases(data) {
  fs.writeFileSync(
    aliasPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function getLocationAlias(name, address1 = "") {
  const aliases = loadAliases();
  return aliases[normalizeKey(name, address1)] || null;
}

function setLocationAlias(originalName, originalAddress1, alias) {
  const aliases = loadAliases();

  aliases[
    normalizeKey(originalName, originalAddress1)
  ] = {
    name: alias?.name || "",
    address1: alias?.address1 || ""
  };

  saveAliases(aliases);
}

module.exports = {
  normalizeKey,
  loadAliases,
  saveAliases,
  getLocationAlias,
  setLocationAlias,
  aliasPath,
};