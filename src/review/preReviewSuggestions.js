function sourceText(r) {
  return String(r?.notesFull || r?.Comments || r?.Comments1 || "").toUpperCase();
}

function hasAny(text, patterns) {
  return patterns.some((rx) => rx.test(text));
}

function detectWaitFromComments(comment, waitBlockMin, waitGraceMin = 0) {
  const text = String(comment || "").toLowerCase();

  if (!text.includes("wait")) return null;

  let multiplier = 0;

  if (text.includes("triple wait")) multiplier = 3;
  else if (text.includes("double wait")) multiplier = 2;
  else if (text.includes("add wait")) multiplier = 1;

  if (!multiplier) return null;
  if (!waitBlockMin || waitBlockMin <= 0) return null;

  const grace = Number(waitGraceMin || 0);
  const block = Number(waitBlockMin || 0);

  return {
    addWait: true,
    waitMinutes: grace + ((multiplier - 1) * block) + 1,
    multiplier
  };
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
    WAIT: !!detectWaitFromComments(
      text,
      Number(r?.waitConfig?.wait_block_min || 0),
      Number(r?.waitConfig?.wait_grace_min || 0)
    ),
  };

  const waitBlockMin = Number(r?.waitConfig?.wait_block_min || 0);
  const waitGraceMin = Number(r?.waitConfig?.wait_grace_min || 0);
  const waitSuggestion = detectWaitFromComments(text, waitBlockMin, waitGraceMin);

  return {
    flags,
    text,
    waitSuggestion
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