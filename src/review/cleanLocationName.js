const { getLocationAlias } = require("../orgs/CTT/locationAliases");
function cleanLocationName(name) {
  let s = String(name || "").trim();
  if (!s) return "";

  if (s === "-" || s === "–" || s === "—") return "";
  // Expand common facility abbreviations
  s = s.replace(/\bJPS\b\.?/giu, "John Peter Smith");

  // Anything after ** is definitely note junk
  s = s.replace(/\s*\*\*.*$/u, "").trim();

  // Remove parenthetical junk like "(A Building) Main Entrance"
  s = s.replace(/\([^)]*\)\s*MAIN ENTRANCE/giu, "").trim();

  // Remove obvious instruction / destination-note tails
  const junkPatterns = [
    /\bTAKE TO REGISTRATION\b/giu,
    /\b\d+(ST|ND|RD|TH)\s+FLOOR\b/giu,
    /\bMAIN ENTRANCE\b/giu,
    /\bBUILDING\s+[A-Z]\s+BUILDING\b/giu,
    /\bMUST HAVE A RIDER FOR THIS OFFICE\b/giu,
    /\bs+STRETCHER\s+AMBULANCE\s+BAY\s+ONLY\b/giu,
    /\bs+CT\s+SCAN\s*\/\s*MRI\s+AMBULANCE\s+BAY\b/giu,
    /\bLEAVE PAPERWORK\b/giu,
    /\bDON'T FORGET\b/giu,
    /\bDO NOT FORGET\b/giu,
    /\bMAKE SURE\b/giu,
    /\bBRING PAPERWORK\b/giu,
    /\bCALL\s+\d/giu,
    /\bASK FOR\b/giu,
    /\b--SOMEONE HAS TO GO WITH PASSENGER\b/giu,
    /\b!\b/giu,
    /\bfront valet Richardson Registration\b/giu,
    /\bFloor # 817-922-4680\b/giu,
    /\bFront doors\b/giu,
    /\bMain Entrance\b/giu,
    /\bAmbulance Bay Stretcher Radiology Department\b/giu,
    /\bLocated Richardson back side Entrance by Justin:\b/giu,
    /\bMain Wheelchair Admission Office CT Scan \b/giu,
    /\bMRI Check In\b/giu,
    /\bROOM TBD\b/giu,
    /\bROOM TBD\b/giu,
    /\bROOM TBD\b/giu,
  ];

  for (const rx of junkPatterns) {
    s = s.replace(rx, "").trim();
  }

  // Clean up dangling separators
  s = s.replace(/\s+-\s*$/u, "").trim();
  s = s.replace(/\s{2,}/gu, " ").trim();

  const alias = getLocationAlias(s);

  if (alias?.name) {
    s = alias.name;
  }
  
  return String(s || "").trim().replace(/\s+/gu, " ");
}

module.exports = {
  cleanLocationName,
};