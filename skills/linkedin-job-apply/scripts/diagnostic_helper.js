// diagnostic_helper.js — top-frame click-safety diagnostics for the linkedin-job-apply skill.
//
// WHY THIS EXISTS: LinkedIn's Easy Apply modal is sometimes rendered inside a cross-origin
// iframe (a third-party ATS like SmartRecruiters). JS run via javascript_tool executes in the
// TOP FRAME only — same-origin policy makes the iframe's internal DOM completely unreachable,
// no matter how the script is written. So this file does NOT fill any fields. Its only job is
// to answer, right before a coordinate-based click: "is the thing I'm about to click on the
// element I think it is, at the coordinates I think they're at?" — because misclicks in this
// flow have two distinct causes, both worth catching before you click rather than after:
//   1. A STALE SCREENSHOT: the real browser window silently resized between tool calls, so a
//      click computed from an old screenshot lands on the modal's backdrop instead of the field
//      (this hit both the Location field and the final Submit button in earlier runs).
//   2. A STATIC OVERLAY: independent of any resize, LinkedIn's own UI sometimes has an unrelated
//      full-page div (seen in testing as `#interop-outlet`, presumably wired up for some other
//      LinkedIn feature) sitting on top of the ATS iframe at specific coordinates — reproduced
//      reliably at the Location field's position across multiple runs, viewport unchanged. No
//      amount of re-screenshotting fixes this one; the fix is clicking a *different*, unblocked
//      field first and reaching the real target via Tab instead (see Step 5's Location-field note).
//
// HOW TO USE: paste this whole file into one javascript_tool call to load it (functions attach
// to `window`, so they persist across later javascript_tool calls on the same page/tab without
// re-pasting). Then, immediately before any click whose coordinates came from a screenshot taken
// more than one tool call ago, run:
//     window.__diag.beforeClick(x, y)
// It returns a small report. Read it before you click:
//   - viewportChanged: true means the viewport size is different from the last time you checked
//     it on this page — your screenshot's coordinates may already be stale. Take a fresh
//     screenshot and recompute (x, y) before clicking.
//   - elementAtPoint: what's actually sitting at (x, y) right now. If its tag/role doesn't match
//     what you expect to click (e.g. you expect an INPUT but this says DIV with a generic
//     className), the click will not do what you think — this catches BOTH failure modes above,
//     regardless of which one it is. Re-screenshot and re-locate the target, or use the Tab
//     workaround, rather than clicking anyway.
//   - coveringIframe: if a full-viewport iframe is present, this names it — that's your signal
//     the actual form fields are unreachable to JS and only coordinate clicks will work at all.
//
// IMPORTANT LIMITATION — this can warn you BEFORE a bad click, but it cannot CONFIRM a good one
// for fields inside the iframe: `document.activeElement` in the top frame cannot see focus that
// lands inside a cross-origin iframe at all (verified in testing — it kept reporting a generic
// top-frame wrapper div even while the field visibly had a focus ring and blinking cursor in the
// screenshot). So use this script to catch misclicks before they happen; use the screenshot's own
// visual state (border highlight, cursor, typed text appearing) as the only real confirmation
// that a click into iframe content actually worked.
//
// This never touches iframe content and never fills anything — it's read-only inspection of the
// top frame, safe to run as many times as you want.

(function () {
  const state = { lastViewport: null };

  function getViewport() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
  }

  function findCoveringIframes() {
    // An iframe whose rendered box covers most of the viewport is almost always the thing
    // actually holding the Easy Apply / third-party-ATS form — not a tracking pixel or embed.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return [...document.querySelectorAll('iframe')]
      .map((f) => {
        const r = f.getBoundingClientRect();
        return { el: f, rect: r, coverage: (r.width * r.height) / (vw * vh) };
      })
      .filter((f) => f.coverage > 0.5)
      .map((f) => ({
        id: f.el.id || null,
        className: f.el.className || null,
        width: Math.round(f.rect.width),
        height: Math.round(f.rect.height),
        top: Math.round(f.rect.top),
        left: Math.round(f.rect.left),
      }));
  }

  function describeElementAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      tag: el.tagName,
      id: el.id || null,
      className: (el.className && el.className.toString()) || null,
      role: el.getAttribute('role'),
      isFormControl: ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName),
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      position: style.position,
    };
  }

  // Call this right before any coordinate-based click. x, y are the coordinates you're about
  // to pass to the click tool, in CSS pixels (same frame the screenshot tool reports).
  function beforeClick(x, y) {
    const current = getViewport();
    const viewportChanged =
      state.lastViewport !== null &&
      (state.lastViewport.width !== current.width || state.lastViewport.height !== current.height);
    state.lastViewport = current;

    return {
      viewport: current,
      viewportChanged, // true => your screenshot is stale, re-screenshot before clicking
      elementAtPoint: describeElementAtPoint(x, y),
      coveringIframes: findCoveringIframes(), // non-empty => real fields are behind an iframe wall
    };
  }

  // Call this once after any unexpected dialog (e.g. a "Save this application?" prompt you
  // didn't ask for) to sanity-check what's currently visible before deciding how to recover.
  function currentState() {
    return {
      viewport: getViewport(),
      coveringIframes: findCoveringIframes(),
      title: document.title,
    };
  }

  window.__diag = { beforeClick, currentState, getViewport, findCoveringIframes, describeElementAtPoint };
})();
