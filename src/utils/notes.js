// src/utils/notes.js

function normalizeChunks(v) {
  return String(v || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function dedupePush(out, seen, text) {
  const key = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!key) return;
  if (seen.has(key)) return;

  seen.add(key);
  out.push(String(text).trim());
}

function combinedComments(trip) {
  const out = [];
  const seen = new Set();

  const legs =
    Array.isArray(trip?.legs) && trip.legs.length
      ? trip.legs
      : [trip];

  for (const leg of legs) {
    const fields = [
      leg?.Comments,
      leg?.Comments1,
      leg?.SpecialDirections,
    ];

    for (const field of fields) {
      for (const chunk of normalizeChunks(field)) {
        dedupePush(out, seen, chunk);
      }
    }
  }

  return out.join("\n");
}

function notesPreview(text, max = 160) {
  const flattened = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .join(" | ");

  if (flattened.length <= max) return flattened;

  return flattened.slice(0, max - 3).trimEnd() + "...";
}

module.exports = {
  combinedComments,
  notesPreview,
};