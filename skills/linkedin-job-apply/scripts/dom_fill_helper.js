// dom_fill_helper.js — self-healing form-fill helper for the linkedin-job-apply skill.
//
// SCOPE: this only works on fields that live in the TOP FRAME — i.e. LinkedIn's own native
// Easy Apply flow with no third-party ATS iframe in the way. Run diagnostic_helper.js's
// window.__diag.findCoveringIframes() first (or check the result already has, if you loaded
// it this session) — if that returns a full-viewport iframe, these functions cannot reach the
// real fields at all (cross-origin, same-origin-policy-blocked) and you must fall back to
// coordinate-based clicking instead. Don't try this library against an iframe-backed modal;
// it will silently find nothing, because there is nothing to find in the top frame.
//
// WHY DIRECT DOM FILL AT ALL, WHEN IT WORKS: setting a field's value via JS and firing the
// right events is immune to the whole class of bug that hit this session twice — a screenshot
// going stale after the browser window resized, causing a coordinate click to land on the
// wrong element. There's no coordinate here to go stale.
//
// THE REACT-SAFE VALUE TRICK: LinkedIn's UI is React-based. Setting `input.value = x` directly
// does NOT trigger React's internal onChange — React tracks value changes through its own
// event-listener wiring, which a plain property assignment bypasses, so the on-screen field
// updates visually but the form's actual state does not. The fix is to call the *native*
// property setter (bypassing any React-patched accessor) and then dispatch a real 'input' event
// so React's listener picks it up. This is a well-known pattern, not a hack specific to this
// skill — it's necessary for scripting any React-controlled form.
//
// HOW TO USE: paste this whole file into one javascript_tool call to load it (attaches to
// `window`, persists across later javascript_tool calls on the same page). Then:
//   1. window.__fill.describeFormFields() — dump every labeled field currently on the page
//      (tag, type, label text, current value). Do this FIRST, always — don't guess a label
//      string and hope; read the real structure before targeting a field.
//   2. window.__fill.fillFieldSelfHealing("Notice period", "30 days") — finds the field whose
//      label best matches the hint, fills it, reads the value back, and reports whether the
//      readback matches what you set. If no field matched the hint, it returns the same
//      describeFormFields() dump instead of failing silently — use that dump to pick the exact
//      label text that's actually on the page and retry with a corrected hint. That retry loop
//      (try -> verify -> if it failed, look at what's really there -> retry with better info)
//      is the "self-healing" part: don't keep guessing blind, look at the DOM's own answer.
//   3. For a <select>, fillFieldSelfHealing tries to match the hint against the option list
//      (case-insensitive substring) rather than requiring an exact value string, since option
//      values are often internal codes that don't match their visible label text.

(function () {
  function setNativeInputValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setNativeSelectValue(el, hint) {
    const options = [...el.options];
    // Prefer an exact value match, then an exact visible-text match, then a substring match —
    // in that order, since select option `value` attributes are frequently internal codes
    // (e.g. "RESIDENCY_VISA") that don't read the same as what's shown to the user.
    let match =
      options.find((o) => o.value === hint) ||
      options.find((o) => o.textContent.trim() === hint) ||
      options.find((o) => o.textContent.trim().toLowerCase().includes(hint.toLowerCase()));
    if (!match) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(el, match.value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return match.textContent.trim();
  }

  function labelTextFor(field) {
    // Try, in order: explicit <label for=id>, aria-label, aria-labelledby, placeholder,
    // then a preceding label-like sibling — real forms use a mix of all of these.
    if (field.id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (explicit) return explicit.textContent.trim();
    }
    if (field.getAttribute('aria-label')) return field.getAttribute('aria-label').trim();
    const labelledBy = field.getAttribute('aria-labelledby');
    if (labelledBy) {
      const el = document.getElementById(labelledBy);
      if (el) return el.textContent.trim();
    }
    if (field.placeholder) return field.placeholder.trim();
    const parentLabel = field.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    return null;
  }

  function allFields() {
    return [...document.querySelectorAll('input, textarea, select')].filter((f) => {
      const type = (f.getAttribute('type') || '').toLowerCase();
      return !['hidden', 'submit', 'button'].includes(type) && f.offsetParent !== null; // visible only
    });
  }

  // Dump of every currently-visible, labeled field — the ground truth to regenerate a selector
  // from, instead of guessing a label string again.
  function describeFormFields() {
    return allFields().map((f) => ({
      tag: f.tagName,
      type: f.getAttribute('type') || null,
      label: labelTextFor(f),
      currentValue: f.tagName === 'SELECT' ? f.options[f.selectedIndex]?.textContent.trim() : f.value,
      options: f.tagName === 'SELECT' ? [...f.options].map((o) => o.textContent.trim()) : undefined,
    }));
  }

  function scoreLabelMatch(label, hint) {
    if (!label) return 0;
    const l = label.toLowerCase();
    const h = hint.toLowerCase();
    if (l === h) return 3;
    if (l.includes(h) || h.includes(l)) return 2;
    // crude word-overlap fallback for loosely-worded hints
    const overlap = h.split(/\s+/).filter((w) => w.length > 2 && l.includes(w)).length;
    return overlap > 0 ? 1 : 0;
  }

  // The self-healing entry point. Returns either a success report (field filled + verified) or,
  // if nothing matched well enough, the full field dump so the caller can retry with the real
  // label text instead of another guess.
  function fillFieldSelfHealing(labelHint, value) {
    const fields = allFields();
    const scored = fields
      .map((f) => ({ f, label: labelTextFor(f), score: scoreLabelMatch(labelTextFor(f), labelHint) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { ok: false, reason: 'no_field_matched', fieldDump: describeFormFields() };
    }

    const { f: field, label } = scored[0];
    let readback;
    if (field.tagName === 'SELECT') {
      const matchedText = setNativeSelectValue(field, value);
      if (matchedText === null) {
        return {
          ok: false,
          reason: 'no_matching_option',
          matchedLabel: label,
          fieldDump: describeFormFields(),
        };
      }
      readback = matchedText;
    } else {
      setNativeInputValue(field, value);
      readback = field.value;
    }

    return {
      ok: true,
      matchedLabel: label,
      valueSet: value,
      readback,
      readbackMatchesIntent: readback === value || readback.toLowerCase().includes(String(value).toLowerCase()),
    };
  }

  window.__fill = { describeFormFields, fillFieldSelfHealing, setNativeInputValue, setNativeSelectValue };
})();
