/* ==========================================================================
   glp.js: the IPF GL points calculator.

     IPF GL Coefficient = 100 / (A - B * e^(-C * Bwt))
     IPF GL Points      = IPF GL Coefficient * Result   (0 when Result is 0)

   Bwt is bodyweight in kg (at least 40 for men, 35 for women). A, B and C are the
   constants in the IPF's Table 1, one set for each sex, event and kit type.
   Result is the total for powerlifting, or the bench press for bench press only.

   The maths lives in YNEPF_GLP so it can be tested on its own; the rest wires up
   the form on glp-calculator.html.
   ========================================================================== */
(function () {
  "use strict";

  // IPF GL formula constants: [A, B, C]
  var PARAMS = {
    men: {
      powerlifting: { equipped: [1236.25115, 1449.21864, 0.01644], classic: [1199.72839, 1025.18162, 0.00921] },
      bench:        { equipped: [381.22073, 733.79378, 0.02398],   classic: [320.98041, 281.40258, 0.01008] }
    },
    women: {
      powerlifting: { equipped: [758.63878, 949.31382, 0.02435],   classic: [610.32796, 1045.59282, 0.03048] },
      bench:        { equipped: [221.82209, 357.00377, 0.02937],   classic: [142.40398, 442.52671, 0.04724] }
    }
  };
  var MIN_BWT = { men: 40, women: 35 };
  var MAX_BWT = 300;
  var MAX_RESULT = { powerlifting: 1500, bench: 600 };

  function coefficient(sex, event, kit, bwt) {
    var k = PARAMS[sex][event][kit];
    return 100 / (k[0] - k[1] * Math.exp(-k[2] * bwt));
  }
  function points(sex, event, kit, bwt, result) {
    return result === 0 ? 0 : coefficient(sex, event, kit, bwt) * result;
  }
  // "83.5", "83,5" and "83.5 kg" all read as 83.5; anything else is not a number (NaN).
  function parseKg(text) {
    var t = String(text == null ? "" : text).trim().replace(/\s*kgs?$/i, "").replace(",", ".");
    return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  }

  window.YNEPF_GLP = { PARAMS: PARAMS, MIN_BWT: MIN_BWT, MAX_BWT: MAX_BWT, MAX_RESULT: MAX_RESULT, coefficient: coefficient, points: points, parseKg: parseKg };

  // ---- the page ---------------------------------------------------------------
  var form = typeof document !== "undefined" && document.getElementById("glp-form");
  if (!form) return;

  var bwtInput = document.getElementById("bodyweight");
  var resInput = document.getElementById("result");
  var resLabel = document.getElementById("result-label");
  var resHelp = document.getElementById("result-help");
  var bwtError = document.getElementById("bodyweight-error");
  var resError = document.getElementById("result-error");
  var out = document.getElementById("glp-result");
  var value = document.getElementById("glp-value");
  var detail = document.getElementById("glp-detail");
  var prompt = document.getElementById("glp-prompt");
  var status = document.getElementById("glp-status");   // read out by screen readers, updated once typing pauses
  var timer = null;

  function checked(name) { var r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ""; }
  function setError(input, box, msg) {
    box.textContent = msg || "";
    box.hidden = !msg;
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    var d = (input.getAttribute("data-help") || "") + (msg ? " " + box.id : "");
    if (d.trim()) input.setAttribute("aria-describedby", d.trim()); else input.removeAttribute("aria-describedby");
    input.closest(".field").classList.toggle("has-error", !!msg);
  }

  function update(announce) {
    var sex = checked("sex"), event = checked("event"), kit = checked("kit");

    // The result field is the total for powerlifting and the bench press for bench press only.
    resLabel.firstChild.nodeValue = event === "bench" ? "Your bench press (kg)" : "Your total (kg)";
    resHelp.textContent = event === "bench" ? "Your best successful bench press." : "Squat, bench press and deadlift added together.";

    var bwtText = bwtInput.value.trim(), resText = resInput.value.trim();
    var bwt = parseKg(bwtText), res = parseKg(resText);
    var bErr = "", rErr = "";
    if (bwtText) {
      if (isNaN(bwt)) bErr = "Enter your bodyweight in kilograms, using numbers only, like 83.5";
      else if (sex && bwt < MIN_BWT[sex]) bErr = "Bodyweight must be " + MIN_BWT[sex] + " kg or more for " + sex;
      else if (!sex && bwt < MIN_BWT.women) bErr = "Bodyweight must be at least " + MIN_BWT.women + " kg";
      else if (bwt > MAX_BWT) bErr = "Enter a bodyweight of " + MAX_BWT + " kg or less";
    }
    if (resText) {
      var cap = MAX_RESULT[event || "powerlifting"];
      if (isNaN(res)) rErr = "Enter your result in kilograms, using numbers only, like 600";
      else if (res > cap) rErr = "That looks too high. Check it is in kilograms, and no more than " + cap + " kg";
    }
    setError(bwtInput, bwtError, bErr);
    setError(resInput, resError, rErr);

    var missing = [];
    if (!sex) missing.push("sex");
    if (!event) missing.push("event");
    if (!kit) missing.push("kit");
    if (!bwtText) missing.push("bodyweight");
    if (!resText) missing.push("result");
    if (bErr || rErr || missing.length) {
      value.textContent = "";
      detail.textContent = "";
      prompt.hidden = false;
      prompt.textContent = bErr || rErr ? "Fix the highlighted answers to see your score."
        : "To see your score, add your " + missing.join(", ").replace(/, ([^,]*)$/, " and $1") + ".";
      out.classList.remove("ready");
      if (announce) status.textContent = prompt.textContent;
      return;
    }
    var c = coefficient(sex, event, kit, bwt), p = points(sex, event, kit, bwt, res);
    var shown = p.toFixed(2);
    prompt.hidden = true;
    value.textContent = shown;
    detail.textContent = (res === 0 ? "A result of 0 scores 0 points." : "Coefficient " + c.toFixed(5) + " × " + res + " kg = " + shown + " points.");
    out.classList.add("ready");
    if (announce) status.textContent = "IPF GL points: " + shown + ". " + detail.textContent;
  }

  // Live update while typing; the screen reader announcement waits until typing pauses.
  function soon() {
    update(false);
    clearTimeout(timer);
    timer = setTimeout(function () { update(true); }, 700);
  }
  form.addEventListener("input", soon);
  form.addEventListener("change", soon);
  form.addEventListener("submit", function (e) { e.preventDefault(); update(true); });
  // The table of constants is built from the same numbers the calculator uses, so they cannot disagree.
  var table = document.getElementById("glp-constants");
  if (table) {
    var NAMES = { men: "Men", women: "Women", powerlifting: "Powerlifting", bench: "Bench press", classic: "Classic", equipped: "Equipped" };
    function cell(tag, text, attrs) { var c = document.createElement(tag); c.textContent = text; Object.keys(attrs || {}).forEach(function (k) { c.setAttribute(k, attrs[k]); }); return c; }
    var head = document.createElement("tr");
    ["Sex", "Event", "Kit", "A", "B", "C"].forEach(function (h) { head.appendChild(cell("th", h, { scope: "col" })); });
    var thead = document.createElement("thead"); thead.appendChild(head);
    var tbody = document.createElement("tbody");
    ["men", "women"].forEach(function (sex) {
      ["powerlifting", "bench"].forEach(function (ev) {
        ["equipped", "classic"].forEach(function (kit) {
          var k = PARAMS[sex][ev][kit], tr = document.createElement("tr");
          tr.appendChild(cell("th", NAMES[sex], { scope: "row" }));
          tr.appendChild(cell("td", NAMES[ev])); tr.appendChild(cell("td", NAMES[kit]));
          k.forEach(function (n) { tr.appendChild(cell("td", String(n))); });
          tbody.appendChild(tr);
        });
      });
    });
    table.appendChild(thead); table.appendChild(tbody);
  }
  update(false);
})();
