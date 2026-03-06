// src/utils/notes.js

function combinedComments(trip) {
  const a = String(trip?.Comments || "").trim();
  const b = String(trip?.Comments1 || "").trim();

  if (a && b && a === b) return a;
  if (a && b) return `${a}\n${b}`;
  return a || b || "";
}

function notesPreview(text, max = 120) {
  const firstLine = String(text || "").split(/\r?\n/)[0].trim();
  if (firstLine.length <= max) return firstLine;
  return firstLine.slice(0, max - 3).trimEnd() + "...";
}

module.exports = {
  combinedComments,
  notesPreview,
};