/* ==========================================================================
   pass.js: a gym day pass (/pass?t=<secret>).
   Two views of the same pass, told apart by &show=1 in the address:
     the gym   (the QR code opens this): is the pass valid, who is it for, and a button to mark it used. Nothing changes until that button.
     the volunteer (the link in their email): their pass, with the QR code drawn here, so it works even if the email hides pictures.
   Nothing about the pass is kept in the page: the secret in the address is checked by the waitlist function every time.
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF, el = Y.el, CFG = window.YNEPF_CONFIG || {};
  var root = document.getElementById("live");
  if (!root) return;
  var params = new URLSearchParams(location.search), token = params.get("t") || "", showMine = params.get("show") === "1";
  var title = document.getElementById("page-title"), lede = document.getElementById("page-lede");

  function post(action) {
    return fetch((CFG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", {
      method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey || "", Authorization: "Bearer " + (CFG.supabaseAnonKey || "") },
      body: JSON.stringify({ action: action, token: token })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return { ok: false, status: "error", message: "We could not reach the server. Please try again." }; });
  }
  var fmt = function (d, o) { return new Date(d).toLocaleString("en-GB", Object.assign({ timeZone: Y.TZ || "Europe/London" }, o)); };
  var dateOnly = function (d) { return fmt(d, { dateStyle: "long" }); };
  var dateTime = function (d) { return fmt(d, { dateStyle: "long", timeStyle: "short" }); };

  // One big, plain verdict a person can read at a glance across a reception desk.
  function verdict(kind, headline, lines, extra) {
    var panel = el("section", { class: "pass-verdict is-" + kind, role: "status", "aria-live": "polite" },
      el("h2", { class: "pass-headline" }, headline), lines.map(function (t) { return el("p", { class: "pass-line" }, t); }), extra || null);
    root.replaceChildren(panel);
    panel.setAttribute("tabindex", "-1");
  }
  function reason(d) {
    if (d.status === "used") return ["This pass was used on " + dateTime(d.used_at) + ".", "Please do not let anyone in with it again."];
    if (d.status === "expired") return ["This pass ran out on " + dateOnly(d.expires_at) + "."];
    if (d.status === "cancelled") return ["This pass was given back and no longer works."];
    return ["We do not recognise this pass. Check you scanned the right code, or ask the person to open the link in their email."];
  }

  function gymView(d) {
    title.textContent = "Day pass check";
    lede.textContent = "Scanned by the gym.";
    if (d.status !== "valid") return verdict("bad", d.status === "used" ? "Already used" : d.status === "expired" ? "Expired" : d.status === "cancelled" ? "Not valid" : "Not recognised",
      (d.name ? [d.name + (d.gym ? " at " + d.gym : "")] : []).concat(reason(d)));
    var msg = el("p", { class: "help", role: "status" }), use = el("button", { type: "button", class: "btn btn-primary btn-lg" }, "Mark as used");
    var yes = el("button", { type: "button", class: "btn btn-primary" }, "Yes, mark as used"), no = el("button", { type: "button", class: "btn btn-secondary" }, "Not yet");
    var dlg = el("dialog", { class: "pass-confirm", "aria-labelledby": "pass-confirm-h" },
      el("h2", { id: "pass-confirm-h" }, "Mark this pass as used?"),
      el("p", null, el("strong", null, d.name), " at ", d.gym, "."),
      el("p", null, "This is only for the gym to do. Once you mark it, the pass is used up and cannot be used again."),
      el("div", { class: "actions" }, yes, no));
    no.addEventListener("click", function () { dlg.close(); use.focus(); });
    use.addEventListener("click", function () { if (dlg.showModal) dlg.showModal(); else if (window.confirm("Mark this pass as used? It cannot be used again.")) yes.click(); });
    yes.addEventListener("click", function () {
      yes.disabled = true; no.disabled = true; use.disabled = true; msg.textContent = "Marking it used…";
      post("pass_use").then(function (r) {
        if (dlg.open) dlg.close();
        if (r.just_used) return verdict("done", "Marked as used", [r.name + " at " + r.gym, "Thank you. This pass will not work again."]);
        if (r.status === "valid") { use.disabled = false; yes.disabled = false; no.disabled = false; msg.textContent = r.message || "That did not work. Please try again."; return; }
        gymView(r);        // someone else got there first, or it has run out
      });
    });
    verdict("good", "Valid day pass", [d.name, "Day pass at " + d.gym, "Use it by " + dateOnly(d.expires_at) + ". One visit."],
      el("div", { class: "pass-actions" }, use, msg, el("p", { class: "help" }, "Only the gym should press this, once the person is in. It uses the pass up for good."), dlg));
  }

  function volunteerView(d) {
    title.textContent = "Your day pass";
    lede.textContent = "A thank you from YNEPF for volunteering.";
    if (d.status !== "valid") return verdict("bad", d.status === "used" ? "This pass has been used" : d.status === "expired" ? "This pass has run out" : d.status === "cancelled" ? "This pass was given back" : "We do not recognise this pass", reason(d).slice(0, 1));
    var qr = el("div", { class: "pass-qr", role: "img", "aria-label": "QR code for your day pass. Show it to the gym." });
    try { qr.innerHTML = window.YNEPF_QR.qrSvg(window.YNEPF_QR.qrMatrix(location.origin + "/pass?t=" + encodeURIComponent(token))); } catch (e) { qr.textContent = "We could not draw the code. Open this page on your phone at the gym."; }
    root.replaceChildren(el("section", { class: "panel pass-mine" },
      el("h2", null, d.gym), el("p", { class: "lead" }, "Show this code to the team at " + d.gym + ". They will scan it and let you in."), qr,
      el("dl", { class: "entry-dl" }, el("div", null, el("dt", null, "Pass for"), el("dd", null, d.name)), el("div", null, el("dt", null, "Gym"), el("dd", null, d.gym)), el("div", null, el("dt", null, "Use it by"), el("dd", null, dateOnly(d.expires_at)))),
      el("p", { class: "help" }, "It works once. Please do not share this page or the code: anyone with it could use your pass.")));
  }

  if (!/^[a-f0-9]{48}$/.test(token)) return verdict("bad", "Not recognised", reason({ status: "unknown" }));
  root.replaceChildren(el("p", null, "Checking the pass…"));
  post("pass_check").then(function (d) {
    if (d.status === "busy" || d.status === "error") return verdict("bad", "Please try again", [d.message || "We could not check that just now."]);
    (showMine ? volunteerView : gymView)(d);
  });
})();
