function handleGetConfig({
  res,
  send,
  readReviewConfig,
}) {
  return send(
    res,
    200,
    JSON.stringify(readReviewConfig()),
    "application/json"
  );
}

function handlePostConfig({
  req,
  res,
  send,
  writeReviewConfigPatch,
}) {
  let body = "";

  req.on("data", (c) => (body += c));

  req.on("end", () => {
    const payload = JSON.parse(body || "{}");

    writeReviewConfigPatch({
      fuelSurchargeEnabled: !!payload.fuelSurchargeEnabled,
      fuelSurchargeWindows: Array.isArray(payload.fuelSurchargeWindows)
        ? payload.fuelSurchargeWindows
        : [],
    });

    return send(
      res,
      200,
      JSON.stringify({ ok: true }),
      "application/json"
    );
  });
}

module.exports = {
  handleGetConfig,
  handlePostConfig,
};