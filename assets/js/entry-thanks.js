/* ==========================================================================
   entry-thanks.js: the page people land on after paying.
   It only says "You're in" once the payment is really confirmed. It asks the entry-status function (using the
   payment's own session id from the address, or the entry id for a free entry) every few seconds for up to about a minute: confirmed shows the
   confirmation, still waiting shows "Still confirming" (and says not to pay again), an unknown payment or a
   missing session id says so, and a refund says so. If the address says which competition this was (?c=), the
   "View entries" button goes to its list.
   ========================================================================== */
(function () {
  "use strict";
  var q = new URLSearchParams(location.search), slug = q.get("c"), session = q.get("session_id") || "", entry = q.get("entry") || "";
  var CFG = window.YNEPF_CONFIG || {};
  var states = ["pending", "paid", "slow", "unknown", "refunded"];
  function show(name) {
    states.forEach(function (s) { var n = document.getElementById("state-" + s); if (n) n.hidden = s !== name; });
    var h = document.querySelector("#state-" + name + " h1"); if (h) { h.setAttribute("tabindex", "-1"); if (name !== "pending") h.focus(); }
  }
  var a = document.getElementById("view-entries");
  if (a && slug && /^[a-z0-9-]+$/i.test(slug)) { a.href = "/entries?c=" + encodeURIComponent(slug); a.hidden = false; }

  var validSession = /^cs_[A-Za-z0-9_]{8,200}$/.test(session), validEntry = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry);
  if ((!validSession && !validEntry) || !CFG.supabaseUrl) return show("unknown");
  var tries = 0, MAX = 24, DELAY = 2500;     // about a minute
  function ask() {
    tries++;
    fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/functions/v1/entry-status?" + (validSession ? "session_id=" + encodeURIComponent(session) : "entry_id=" + encodeURIComponent(entry)), { headers: { apikey: CFG.supabaseAnonKey || "" } })
      .then(function (r) { return r.ok ? r.json() : { status: "pending" }; })
      .catch(function () { return { status: "pending" }; })
      .then(function (b) {
        if (b.status === "paid") return show("paid");
        if (b.status === "refunded") return show("refunded");
        if (b.status === "unknown") return show("unknown");
        if (tries >= MAX) return show("slow");
        setTimeout(ask, DELAY);
      });
  }
  ask();
})();
