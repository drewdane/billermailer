(function () {
  function mark(ctx) {
    if (ctx.markDirty) ctx.markDirty();
  }

  function wireBasicRowControls(ctx) {
    const {
      r,
      tr,
      inclCb,
      moveInput,
      mergeCtl,
      typeSel,
      classSel,
    } = ctx;

    if (inclCb) {
      inclCb.onchange = () => {
        r.Action = inclCb.checked ? "INCLUDE" : "EXCLUDE";
        r.review.Action = r.Action;
        tr.className = inclCb.checked ? "" : "row-exclude";
        mark(ctx);
      };
    }

    if (moveInput) {
      moveInput.onchange = () => {
        r.review.MoveToAccountCode = moveInput.value.trim();
        mark(ctx);
      };
    }

    if (mergeCtl?.cb) {
      mergeCtl.cb.onchange = () => {
        r.review.MergeSelected = mergeCtl.cb.checked;
        mark(ctx);
      };
    }

    if (typeSel) {
      typeSel.onchange = () => {
        r.review.TripTypeOverride = typeSel.value || r.Mobility || "AMBU";
        mark(ctx);
      };
    }

    if (classSel) {
      classSel.onchange = () => {
        r.review.ClassOverride = classSel.value;
        mark(ctx);
      };
    }
  }

  window.BM_ROW_CONTROLS = {
    wireBasicRowControls,
  };
})();