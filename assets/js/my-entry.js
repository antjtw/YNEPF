/* ==========================================================================
   my-entry.js: Manage your entry (/my-entry).
   A lifter asks for an emailed one-time code, then sees their upcoming entries. Small things (name, club or university, Instagram, OpenIPF link,
   membership number) change straight away. A different weight class or equipment, or cancelling, is a REQUEST the entries team approves or declines.
   Once entries have closed there are no changes, only a cancellation request (no refund). Everything is done through the waitlist function.
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF, el = Y.el, CFG = window.YNEPF_CONFIG || {};
  var root = document.getElementById("live");
  if (!root) return;
  var EVENT = { full_power: "Full power", bench_only: "Bench only" }, EQUIP = { classic: "Classic", equipped: "Equipped" };
  var TEAM = "competitions@ynepf.co.uk";
  var state = { email: "", code: "", data: null };

  function post(action, payload) {
    return fetch((CFG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", {
      method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey || "", Authorization: "Bearer " + (CFG.supabaseAnonKey || "") },
      body: JSON.stringify(Object.assign({ action: action, email: state.email, code: state.code }, payload || {}))
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return { ok: false, message: "We could not reach the server. Please try again." }; });
  }
  var longDate = function (d) { return new Date(d).toLocaleDateString("en-GB", { timeZone: Y.TZ || "Europe/London", dateStyle: "long" }); };
  var when = function (d) { return new Date(d).toLocaleString("en-GB", { timeZone: Y.TZ || "Europe/London", dateStyle: "full", timeStyle: "short" }); };

  // ---- step 1 and 2: get in ----------------------------------------------------------------------------------------------
  // OpenIPF link: accept the full address, one without https:// or www., or just the profile name ("anthonywhite1").
  function ipfLink(s) {
    s = String(s || "").trim();
    var m = s.match(/^(?:https?:\/\/)?(?:www\.)?openipf\.org\/(?:u\/)?([A-Za-z0-9][A-Za-z0-9._-]*)\/?(?:[?#].*)?$/i) || s.match(/^(?:u\/)?([A-Za-z0-9][A-Za-z0-9._-]*)$/i);
    return m ? "https://www.openipf.org/u/" + m[1] : "";
  }

  function signIn() {
    var email = el("input", { type: "email", id: "me-email", autocomplete: "email", required: true, value: new URLSearchParams(location.search).get("email") || "" });
    var code = el("input", { type: "text", id: "me-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "7" });
    var msg = el("p", { role: "status", "aria-live": "polite", class: "help form-status" }), step2 = el("div", { class: "flow-step", hidden: "" });
    function say(t, bad) { msg.textContent = t || ""; msg.className = (bad ? "form-error" : "help") + " form-status"; }
    var send = el("button", { type: "button", class: "btn btn-secondary" }, "Email me a code");
    send.addEventListener("click", function () {
      state.email = email.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.email)) return say("Enter the email address you entered with.", true);
      send.disabled = true; say("Sending…");
      post("entry_start", {}).then(function (b) { send.disabled = false; if (!b.ok) return say(b.message || "We could not send a code.", true); say("If that address has an entry, a 6 digit code is on its way. It works for 15 minutes."); step2.hidden = false; code.focus(); });
    });
    var show = el("button", { type: "button", class: "btn btn-primary" }, "Show my entry");
    show.addEventListener("click", function () {
      if (!code.value.trim()) return say("Enter the code from the email.", true);
      state.email = email.value.trim().toLowerCase(); state.code = code.value.trim();
      show.disabled = true; say("Checking…");
      load().then(function (ok) { show.disabled = false; if (!ok) return say(state.error || "That code did not work.", true); say(""); });
    });
    step2.replaceChildren(el("h3", { class: "flow-step-title" }, el("span", { class: "step-num", "aria-hidden": "true" }, "2"), "Enter the code"),
      el("div", { class: "field" }, el("label", { for: "me-code" }, "The code we emailed you"), code), el("div", { class: "actions" }, show));
    root.replaceChildren(el("section", { class: "panel flow", "aria-labelledby": "me-h" }, el("h2", { id: "me-h" }, "Find your entry"),
      el("p", { class: "flow-intro" }, "Change your details, ask the entries team for a different weight class, or ask to cancel. We will email you a code to check it is you."),
      el("div", { class: "flow-step" }, el("h3", { class: "flow-step-title" }, el("span", { class: "step-num", "aria-hidden": "true" }, "1"), "Get a code"),
        el("div", { class: "field" }, el("label", { for: "me-email" }, "The email address you entered with"), email), el("div", { class: "actions" }, send), msg), step2));
  }

  // ---- after sign-in: their entries ----------------------------------------------------------------------------------------
  function load(focusId) {
    return post("entry_portal", {}).then(function (b) {
      if (!b.ok) { state.error = b.message; return false; }
      state.data = b; draw(focusId); return true;
    });
  }
  function draw(focusId) {
    var d = state.data, kids = [];
    if (!d.entries.length) kids.push(el("p", null, "There are no upcoming entries for this email address."));
    d.entries.forEach(function (e) { kids.push(entryPanel(e)); });
    kids.push(el("p", { class: "help" }, "To change your event, date of birth or sex, or anything to do with money, email ", el("a", { href: "mailto:" + TEAM }, TEAM), "."));
    root.replaceChildren.apply(root, kids);
    var f = focusId && document.getElementById(focusId); if (f) { f.setAttribute("tabindex", "-1"); f.focus(); }
  }
  function banner(e) {
    var r = (e.requests || []).filter(function (x) { return x.status !== "withdrawn"; })[0];
    if (!r) return null;
    var what = r.kind === "cancel" ? "cancellation" : "change", diff = Object.keys(r.after || {}).map(function (k) { return k + (r.before && r.before[k] ? ": " + r.before[k] + " to " + r.after[k] : ": " + r.after[k]); });
    var list = diff.length ? el("ul", null, diff.map(function (t) { return el("li", null, t); })) : null;
    if (r.status === "pending") {
      var withdraw = el("button", { type: "button", class: "btn btn-secondary btn-sm" }, "Withdraw this request");
      withdraw.addEventListener("click", function () { withdraw.disabled = true; post("entry_withdraw", { request_id: r.id }).then(function (b) { if (!b.ok) { withdraw.disabled = false; return window.alert(b.message || "We could not do that."); } load("banner-" + e.entry_id); }); });
      return el("div", { class: "callout entry-banner", role: "status", id: "banner-" + e.entry_id }, el("p", { class: "callout-title" }, "Waiting for the entries team: " + what + " requested"),
        list, el("p", { style: "margin:0 0 var(--space-3)" }, "Sent " + when(r.created_at) + ". Nothing changes until they approve it, and we will email you either way."), withdraw);
    }
    if (r.status === "approved") return el("div", { class: "success-panel entry-banner", role: "status", id: "banner-" + e.entry_id }, el("h3", { style: "margin:0 0 var(--space-2);color:inherit" }, what === "cancellation" ? "Cancellation approved" : "Change approved"), list, el("p", { style: "margin:0" }, what === "cancellation" ? "Your entry has been cancelled." : "Your entry has been updated."));
    return el("div", { class: "callout entry-banner", role: "alert", id: "banner-" + e.entry_id }, el("p", { class: "callout-title" }, (what === "cancellation" ? "Cancellation" : "Change") + " declined"), el("p", { style: "margin:0" }, "Reason: " + (r.decline_reason || "none given") + ". Your entry has not changed."));
  }
  function entryPanel(e) {
    var id = e.entry_id, pending = (e.requests || []).some(function (r) { return r.status === "pending"; }), msg = el("p", { role: "status", "aria-live": "polite", class: "help form-status", id: "msg-" + id });
    function say(t, bad) { msg.textContent = t || ""; msg.className = (bad ? "form-error" : "help") + " form-status"; }
    // Each form shows its message straight under its own button (one message at the bottom of the page could be out of sight on a phone).
    var rmsg = el("p", { role: "status", "aria-live": "polite", class: "help form-status" }), cmsg = el("p", { role: "status", "aria-live": "polite", class: "help form-status" });
    function mk(m) { return function (t, bad) { m.textContent = t || ""; m.className = (bad ? "form-error" : "help") + " form-status"; }; }
    var rsay = mk(rmsg), csay = mk(cmsg);
    var uni = e.competition.is_university, clubWord = uni ? "University" : "Club";
    var rows = [["Name", e.name], ["Event", EVENT[e.event] || e.event], ["Equipment", EQUIP[e.equipment] || e.equipment], ["Weight class", e.weight_class], [clubWord, e.club || "(none)"], ["Instagram", e.instagram ? "@" + e.instagram : "(none)"],
      ["OpenIPF profile", e.openipf_url || "(none)"], ["Membership number", e.bp_number], ["Paid", e.price_pence ? "£" + (e.price_pence / 100).toFixed(2) : "Free"]];
    var details = el("dl", { class: "entry-dl" }, rows.map(function (r) { return [el("dt", null, r[0]), el("dd", null, r[1])]; }));
    var kids = [el("h2", null, e.competition.name), el("p", { class: "flow-intro" }, longDate(e.competition.start_date)), banner(e), details];

    if (!e.open) {
      kids.push(el("div", { class: "callout entry-banner" }, el("p", { class: "callout-title" }, "Entries have closed"), el("p", { style: "margin:0" }, "Entries cannot be changed now. You can still ask to cancel: there is no refund, but your place is freed up and the lifting order is updated.")));
    } else {
      // small changes, made straight away
      var name = el("input", { type: "text", id: "n-" + id, value: e.name, maxlength: "120", autocomplete: "name" });
      var ig = el("input", { type: "text", id: "i-" + id, value: e.instagram, maxlength: "31", autocomplete: "off", placeholder: "handle, no @" });
      var url = el("input", { type: "text", id: "u-" + id, value: e.openipf_url, maxlength: "300", autocomplete: "off" });
      var bp = el("input", { type: "text", id: "b-" + id, value: e.bp_number, maxlength: "30", autocomplete: "off" });
      var list = uni ? state.data.universities : state.data.clubs, inList = list.indexOf(e.club) >= 0, other = el("input", { type: "text", id: "o-" + id, maxlength: "120", value: inList ? "" : e.club, autocomplete: "off" });
      var club = el("select", { id: "c-" + id, class: "control" }, [el("option", { value: "" }, uni ? "Select your university" : "Unattached")].concat(list.map(function (c) { return el("option", { value: c, selected: c === e.club }, c); }), uni ? [el("option", { value: "__other__", selected: !inList && !!e.club }, "Other (not on this list)")] : []));
      var otherField = el("div", { class: "field", hidden: uni && !inList && e.club ? false : "" }, el("label", { for: "o-" + id }, "Name of your university"), other);
      club.addEventListener("change", function () { otherField.hidden = club.value !== "__other__"; });
      var save = el("button", { type: "button", class: "btn btn-secondary" }, "Save my details");
      save.addEventListener("click", function () {
        var changes = { full_name: name.value, instagram: ig.value, openipf_url: url.value.trim() ? ipfLink(url.value) : "", bp_number: bp.value, club: uni && club.value === "__other__" ? other.value : club.value };
        if (url.value.trim() && !changes.openipf_url) return say("That does not look like an OpenIPF profile. Enter the link or just your profile name.", true);
        save.disabled = true; say("Saving…");
        post("entry_update", { entry_id: id, changes: changes }).then(function (b) {
          save.disabled = false;
          if (!b.ok) return say(b.message || "We could not save that.", true);
          if (b.unchanged) return say("Nothing has changed.");
          load("msg-" + id).then(function () { var m = document.getElementById("msg-" + id); if (m) { m.textContent = "Saved. Your details are updated."; } });
        });
      });
      kids.push(el("h3", { class: "flow-sub" }, "Update your details"), el("p", { class: "help" }, "These change straight away."),
        el("div", { class: "field" }, el("label", { for: "n-" + id }, "First and last name"), name),
        el("div", { class: "field" }, el("label", { for: "c-" + id }, clubWord), club), otherField,
        el("div", { class: "field" }, el("label", { for: "i-" + id }, "Instagram handle (optional)"), ig),
        el("div", { class: "field" }, el("label", { for: "u-" + id }, "OpenIPF profile link"), url),
        el("div", { class: "field" }, el("label", { for: "b-" + id }, "Membership number"), bp), el("div", { class: "actions" }, save), msg);

      // a request: different weight class or equipment
      var wc = el("select", { id: "w-" + id, class: "control" }, [el("option", { value: "" }, "Keep " + (e.weight_class || "my weight class"))].concat((e.classes || []).filter(function (c) { return c.id !== e.weight_class_id; }).map(function (c) { return el("option", { value: c.id }, c.text); })));
      var eq = el("select", { id: "q-" + id, class: "control" }, [el("option", { value: "" }, "Keep " + (EQUIP[e.equipment] || "my equipment"))].concat((e.equipment_options || []).filter(function (x) { return x !== e.equipment; }).map(function (x) { return el("option", { value: x }, EQUIP[x] || x); })));
      var note = el("textarea", { id: "t-" + id, rows: "3", maxlength: "500" });
      var ask = el("button", { type: "button", class: "btn btn-primary" }, "Send request to the entries team");
      ask.disabled = pending;
      ask.addEventListener("click", function () {
        if (!wc.value && !eq.value) return rsay("Choose a different weight class or equipment above first. To change anything else, email " + TEAM + ".", true);
        ask.disabled = true; rsay("Sending…");
        post("entry_request", { entry_id: id, kind: "change", weight_class_id: wc.value, equipment: eq.value, note: note.value }).then(function (b) {
          if (!b.ok) { ask.disabled = pending; return rsay(b.message || "We could not send that.", true); }
          load("banner-" + id);
        });
      });
      // Only offer the form if there is something to switch to. (A lifter who pressed Send with nothing chosen was not sure what it was for.)
      var canClass = (e.classes || []).some(function (c) { return c.id !== e.weight_class_id; }), canEquip = (e.equipment_options || []).some(function (x) { return x !== e.equipment; });
      if (canClass || canEquip) {
        kids.push(el("h3", { class: "flow-sub" }, "Ask for a different weight class or equipment"),
          el("p", { class: "help" }, pending ? "You already have a request waiting. Withdraw it above if you want to ask for something else." : "Choose what you would like instead. The entries team will look at it. Nothing changes until they approve it, and we will email you."),
          el("div", { class: "field" }, el("label", { for: "w-" + id }, "Weight class"), wc), el("div", { class: "field" }, el("label", { for: "q-" + id }, "Equipment"), eq),
          el("div", { class: "field" }, el("label", { for: "t-" + id }, "Anything the team should know (optional)"), note), el("div", { class: "actions" }, ask), rmsg);
      }
      // Everything else goes by email, and says so where a lifter will see it.
      kids.push(el("h3", { class: "flow-sub" }, "Need to change something else?"),
        el("p", { class: "help" }, "Your event, date of birth or sex, or anything to do with money, is changed by the entries team. Email them before entries close and they will sort it."),
        el("div", { class: "actions" }, el("a", { class: "btn btn-secondary", href: "mailto:" + TEAM + "?subject=" + encodeURIComponent("Changing my entry: " + e.competition.name) }, "Email the entries team")));
    }

    // cancelling: open until entries close for a change, always possible as a request
    var cnote = el("textarea", { id: "cn-" + id, rows: "3", maxlength: "500" });
    var go = el("button", { type: "button", class: "btn btn-danger" }, "Send cancellation request"); go.disabled = pending;
    go.addEventListener("click", function () {
      go.disabled = true; csay("Sending…");
      post("entry_request", { entry_id: id, kind: "cancel", note: cnote.value }).then(function (b) { if (!b.ok) { go.disabled = pending; return csay(b.message || "We could not send that.", true); } load("banner-" + id); });
    });
    kids.push(el("details", { class: "ol-settings" }, el("summary", null, "Ask to cancel my entry"),
      el("div", { class: "stack" }, el("p", null, e.open ? "Refunds are available until entries close on " + when(e.competition.entry_closes || e.competition.start_date) + ". The entries team will confirm what is refunded." : "Entries have closed, so there is no refund."),
        el("div", { class: "field" }, el("label", { for: "cn-" + id }, "Reason (optional)"), cnote), el("div", { class: "actions" }, go), cmsg)));
    return el("section", { class: "panel flow", "aria-labelledby": "h-" + id }, [].concat(kids.map(function (k, i) { return i === 0 ? (k.id = "h-" + id, k) : k; })));
  }

  signIn();
})();
