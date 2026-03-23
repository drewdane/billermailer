function sourceText(r) {
  return String(r?.notesFull || r?.Comments || r?.Comments1 || "").toUpperCase();
}

function hasAny(text, patterns) {
  return patterns.some((rx) => rx.test(text));
}

function getPreReviewSuggestions(r) {
  const text = sourceText(r);

  const flags = {
    O2: hasAny(text, [/\bO2\b/, /\bOXYGEN\b/, /\b\d+L O2\b/]),
    RECL: hasAny(text, [/\bRECL\b/, /\bRECLINER\b/, /\bNEEDS RECLINER\b/]),
    BARI: hasAny(text, [
      /\bBARI\b/,
      /\bBARIATRIC\b/,
      /\b3\d{2,}\s*(LBS|LB|#)\b/,
    ]),
    NeedWC: hasAny(text, [
      /\bNEED\s*WC\b/,
      /\bNEEDS\s*WC\b/,
      /\bNEEDWC\b/,
      /\bNEEDSWC\b/,
      /\bNEED\s*WHEELCHAIR\b/,
      /\bNEEDS\s*WHEELCHAIR\b/,
    ]),
  };

  return {
    flags,
    text,
  };
}

function applySuggestionStyle(labelEl, isSuggested, isChecked) {
  if (!labelEl) return;

  if (isSuggested && !isChecked) {
    labelEl.style.color = "#dc2626";
    labelEl.style.fontWeight = "600";
  } else {
    labelEl.style.color = "";
    labelEl.style.fontWeight = "";
  }
}

window.getPreReviewSuggestions = getPreReviewSuggestions;
window.applySuggestionStyle = applySuggestionStyle;