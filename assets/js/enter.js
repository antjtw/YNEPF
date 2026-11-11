/* ==========================================================================
   enter.js: the entry form (/enter?c=<competition address>).

   Three steps (About you, Your lifting, Check your answers), then payment inside
   this page with Stripe's embedded Checkout. The page only SHOWS prices; the real
   rules and price are decided by the database function start_entry() when the
   entry-checkout function runs, so nothing here can be used to get a cheaper entry
   or an extra place. Errors follow the GOV.UK pattern (summary + per-field message).
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF, el = Y.el, CFG = window.YNEPF_CONFIG || {};
  var app = document.getElementById("enter-app"), status = document.getElementById("enter-status");
  var summary = document.getElementById("error-summary"), list = document.getElementById("error-list");
  var lede = document.getElementById("enter-lede"), title = document.getElementById("enter-title");
  var ctx = null;                               // competition, settings, price rules, classes, divisions
  var step = 1, shownKids = false, preview = false;
  var v = { sex: "", event: "", equipment: "", weight_class_id: "", division_id: "", dd: "", mm: "", yyyy: "" };
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var EVENT_NAMES = { full_power: "Full power (squat, bench press and deadlift)", bench_only: "Bench press only" };
  var EQUIP_NAMES = { classic: "Classic (raw)", equipped: "Equipped" };

  // ---- rules that mirror the database (the database is the one that decides) ------------------
  function ageCategory(yearOfBirth, compYear) {
    var d = compYear - yearOfBirth;
    if (d >= 14 && d <= 18) return "SJ"; if (d >= 19 && d <= 23) return "J"; if (d >= 24 && d <= 39) return "";
    if (d >= 40 && d <= 49) return "M1"; if (d >= 50 && d <= 59) return "M2"; if (d >= 60 && d <= 69) return "M3"; if (d >= 70) return "M4";
    return "under14";
  }
  function dobISO() {
    var d = +v.dd, m = +v.mm, y = +v.yyyy;
    if (!d || !m || !y || String(v.yyyy).length !== 4) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
  }
  function ageOnDay() {
    var iso = dobISO(); if (!iso) return null;
    var c = ctx.comp.start_date.split("-").map(Number), b = iso.split("-").map(Number);
    var age = c[0] - b[0]; if (c[1] < b[1] || (c[1] === b[1] && c[2] < b[2])) age--;
    return age;
  }
  // Classes this lifter may enter: men's 53 and women's 43 are for sub-juniors only (the database checks this too).
  function allowedClasses() {
    var iso = dobISO(), cat = iso ? ageCategory(+iso.slice(0, 4), +ctx.comp.start_date.slice(0, 4)) : null;
    return ctx.classes.filter(function (c) { return c.sex === v.sex && (!c.min_age_category || c.min_age_category === cat); });
  }
  function priceNow() {
    var iso = dobISO(); if (!iso || !v.event || !v.equipment) return null;
    var cat = ageCategory(+iso.slice(0, 4), +ctx.comp.start_date.slice(0, 4));
    for (var i = 0; i < ctx.rules.length; i++) {
      var r = ctx.rules[i];
      if ((!r.event || r.event === v.event) && (!r.equipment || r.equipment === v.equipment) && (!r.age_category || r.age_category === cat)) return r.price_pence;
    }
    return null;
  }
  function pounds(p) { return "£" + (p / 100).toFixed(p % 100 ? 2 : 0); }

  // ---- errors ----------------------------------------------------------------------------------
  function clearErrors() {
    summary.hidden = true; list.innerHTML = "";
    Array.prototype.forEach.call(app.querySelectorAll(".field-error"), function (p) { p.hidden = true; p.textContent = ""; });
    Array.prototype.forEach.call(app.querySelectorAll(".has-error"), function (f) { f.classList.remove("has-error"); });
  }
  function showErrors(errs) {
    clearErrors();
    errs.forEach(function (e) {
      var li = el("li", null, el("a", { href: "#" + e[0] }, e[1])); list.appendChild(li);
      var f = app.querySelector('[data-field="' + e[0] + '"]'), msg = document.getElementById(e[0] + "-error");
      if (f) f.classList.add("has-error"); if (msg) { msg.textContent = e[1]; msg.hidden = false; }
    });
    summary.hidden = false; summary.focus();
  }

  // ---- little form builders --------------------------------------------------------------------
  function text(id, label, opts) {
    opts = opts || {};
    return el("div", { class: "field", "data-field": id },
      el("label", { for: id }, label + (opts.optional ? " (optional)" : "")),
      opts.help ? el("p", { class: "help", id: id + "-help" }, opts.help) : null,
      el("p", { class: "field-error", id: id + "-error", hidden: true }),
      el("input", { id: id, name: id, type: opts.type || "text", value: v[id] || "", autocomplete: opts.autocomplete || "off", maxlength: opts.max || 200,
        spellcheck: "false", "aria-describedby": opts.help ? id + "-help" : false, oninput: function (e) { v[id] = e.target.value; } }));
  }
  function check(id, label, help) {
    return el("div", { class: "field", "data-field": id },
      el("p", { class: "field-error", id: id + "-error", hidden: true }),
      el("div", { class: "field-check" },
        el("input", { id: id, name: id, type: "checkbox", checked: !!v[id], onchange: function (e) { v[id] = e.target.checked; if (/^access_|guardian/.test(id)) render(true); } }),
        el("label", { for: id }, label)),
      help ? el("p", { class: "help" }, help) : null);
  }
  function radios(id, legend, options, help) {
    return el("div", { class: "field", "data-field": id },
      el("fieldset", { id: id, tabindex: "-1" },
        el("legend", null, legend), help ? el("p", { class: "help" }, help) : null,
        el("p", { class: "field-error", id: id + "-error", hidden: true }),
        options.map(function (o, i) {
          var rid = id + "-" + i;
          return el("div", { class: "field-check" },
            el("input", { id: rid, type: "radio", name: id, value: o[0], checked: v[id] === o[0], onchange: function () { v[id] = o[0]; if (id === "sex") v.weight_class_id = ""; render(true); } }),
            el("label", { for: rid }, o[1]));
        })));
  }
  function select(id, label, options, blank) {
    return el("div", { class: "field", "data-field": id },
      el("label", { for: id }, label), el("p", { class: "field-error", id: id + "-error", hidden: true }),
      el("select", { id: id, name: id, onchange: function (e) { v[id] = e.target.value; } },
        el("option", { value: "" }, blank), options.map(function (o) { return el("option", { value: o[0], selected: v[id] === o[0] }, o[1]); })));
  }
  function dobField() {
    function part(k, label, w, max) {
      return el("div", { class: "date-part" }, el("label", { for: "dob-" + k }, label),
        el("input", { id: "dob-" + k, type: "text", inputmode: "numeric", maxlength: max, size: w, value: v[k], autocomplete: k === "dd" ? "bday-day" : k === "mm" ? "bday-month" : "bday-year", oninput: function (e) { v[k] = e.target.value; }, onchange: function () { var k = ageOnDay() !== null && ageOnDay() < 18; if (k !== shownKids) render(true); } }));
    }
    return el("div", { class: "field", "data-field": "dob" },
      el("fieldset", { id: "dob", tabindex: "-1" }, el("legend", null, "Date of birth"),
        el("p", { class: "help" }, "For example, 27 3 1990. We use it to work out your age category. It is never published."),
        el("p", { class: "field-error", id: "dob-error", hidden: true }),
        el("div", { style: "display:flex;gap:1rem;flex-wrap:wrap" }, part("dd", "Day", 3, 2), part("mm", "Month", 3, 2), part("yyyy", "Year", 5, 4))));
  }

  // ---- steps -----------------------------------------------------------------------------------
  function stepAbout() {
    var age = ageOnDay(), kids = age !== null && age < 18, wantsAccess = v.access_hearing || v.access_sight || (v.access_notes || "").trim();
    shownKids = kids;
    return [
      text("full_name", "Full name", { autocomplete: "name", help: "Your name, club and weight class are shown on the entries list and the lifting order." }),
      text("email", "Email address", { type: "email", autocomplete: "email", max: 254, help: "We send your confirmation here." }),
      dobField(),
      radios("sex", "Which category are you entering?", [["M", "Men's"], ["F", "Women's"]]),
      text("bp_number", "British Powerlifting membership number", { max: 40 }),
      text("club", "Club", { optional: true, max: 120 }),
      text("instagram", "Instagram handle", { optional: true, max: 60, help: "If you would like to be tagged." }),
      kids ? el("div", { class: "panel" },
        el("h2", null, "Parent or guardian"),
        el("p", null, "You are under 18 on the day of the competition. A parent or guardian must be with you at the competition, and we need their details. Only the entries team can see these, and we delete them 30 days after the competition."),
        text("guardian_name", "Parent or guardian's full name", { max: 120 }),
        text("guardian_phone", "Their phone number", { type: "tel", max: 30, autocomplete: "tel" }),
        text("guardian_email", "Their email address", { type: "email", max: 254 }),
        check("guardian_consent", "I am the parent or guardian, or I have their permission, and I consent to this entry and to photos being taken")) : null,
      el("div", { class: "panel" },
        el("h2", null, "Do you need any help on the day?"),
        el("p", null, "Everyone is asked. Answering is optional. We use it so the team can help you, for example by using hand signals. Only the entries team sees it, we keep it for 30 days after the competition and you can ask us to delete it at any time."),
        check("access_hearing", "I am hard of hearing"),
        check("access_sight", "I am hard of seeing"),
        el("div", { class: "field", "data-field": "access_notes" },
          el("label", { for: "access_notes" }, "Anything else we should know (optional)"),
          el("p", { class: "field-error", id: "access_notes-error", hidden: true }),
          el("textarea", { id: "access_notes", rows: "3", maxlength: "500", oninput: function (e) { v.access_notes = e.target.value; } }, v.access_notes || "")),
        wantsAccess ? check("access_consent", "I agree you can store what I have written here so you can help me on the day") : null),
      el("div", { class: "panel" },
        el("h2", null, "Photos"),
        check("photo_ok", "You can use photos and video of me in promotional material"),
        check("photo_opt_out", "I do not want to be photographed or filmed")),
      check("eligibility_confirmed", "I confirm I am eligible to compete in the category I have chosen",
        "If you need to talk to us about this, please email the entries team and we will deal with it privately.")
    ];
  }
  function stepLifting() {
    var allowed = allowedClasses();
    if (v.weight_class_id && !allowed.some(function (c) { return c.id === v.weight_class_id; })) v.weight_class_id = "";
    var classes = allowed.map(function (c) { return [c.id, c.label + " kg"]; });
    var p = priceNow();
    return [
      radios("event", "Event", ctx.settings.events.map(function (e) { return [e, EVENT_NAMES[e] || e]; })),
      radios("equipment", "Equipment", ctx.settings.equipment.map(function (e) { return [e, EQUIP_NAMES[e] || e]; })),
      select("weight_class_id", "Weight class", classes, classes.length ? "Choose your class" : "Choose men's or women's first"),
      ctx.divisions.length ? select("division_id", "Your division (optional)", ctx.divisions.map(function (d) { return [d.id, d.name]; }), "Choose a division") : null,
      text("openipf_url", "OpenIPF profile link", { optional: true, max: 300, help: "If you have one, paste your link from openipf.org. We use it to check qualification." }),
      p !== null ? el("p", { class: "lede" }, "Your entry fee: ", el("strong", null, pounds(p))) : null
    ];
  }
  function row(label, value, stepNo) {
    return el("div", { class: "summary-row", style: "display:flex;justify-content:space-between;gap:1rem;padding:.5rem 0;border-bottom:1px solid var(--border,#ccd)" },
      el("div", null, el("strong", null, label), el("div", null, value || "—")),
      el("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: function () { step = stepNo; render(); } }, "Change", el("span", { class: "visually-hidden" }, " " + label)));
  }
  function stepCheck() {
    var cls = ctx.classes.filter(function (c) { return c.id === v.weight_class_id; })[0], p = priceNow(), age = ageOnDay();
    return [
      el("h2", null, "Check your answers"),
      row("Name", v.full_name, 1), row("Email", v.email, 1), row("Date of birth", v.dd + "/" + v.mm + "/" + v.yyyy, 1),
      row("Category", v.sex === "M" ? "Men's" : "Women's", 1), row("Membership number", v.bp_number, 1), row("Club", v.club, 1),
      row("Event", EVENT_NAMES[v.event], 2), row("Equipment", EQUIP_NAMES[v.equipment], 2), row("Weight class", cls ? cls.label + " kg" : "", 2),
      age !== null && age < 18 ? el("p", { class: "help" }, "A parent or guardian must be with you at the competition.") : null,
      el("p", { class: "lede" }, "Total to pay: ", el("strong", null, p === null ? "—" : pounds(p))),
      el("p", { class: "help" }, "Pressing the button holds your place for " + ctx.settings.hold_minutes + " minutes while you pay. We never see or store your card details."),
      el("p", { class: "field-error", id: "submit-error", hidden: true })
    ];
  }

  // ---- validation per step ---------------------------------------------------------------------
  function trim(s) { return (s || "").replace(/^\s+|\s+$/g, ""); }
  function validate(n) {
    var e = [];
    if (n === 1) {
      if (!trim(v.full_name)) e.push(["full_name", "Enter your full name"]);
      if (!trim(v.email)) e.push(["email", "Enter your email address"]);
      else if (!EMAIL.test(trim(v.email))) e.push(["email", "Enter an email address in the correct format, like name@example.com"]);
      var iso = dobISO();
      if (!iso) e.push(["dob", "Enter your date of birth as a real date, for example 27 3 1990"]);
      else { var age = ageOnDay(); if (age < 14 && ageCategory(+iso.slice(0, 4), +ctx.comp.start_date.slice(0, 4)) === "under14") e.push(["dob", "Lifters must be at least 14 in the year of the competition"]); }
      if (!v.sex) e.push(["sex", "Choose men's or women's"]);
      if (!trim(v.bp_number)) e.push(["bp_number", "Enter your British Powerlifting membership number"]);
      if (iso && ageOnDay() < 18) {
        if (!trim(v.guardian_name)) e.push(["guardian_name", "Enter your parent or guardian's name"]);
        if (!trim(v.guardian_phone)) e.push(["guardian_phone", "Enter your parent or guardian's phone number"]);
        if (!EMAIL.test(trim(v.guardian_email))) e.push(["guardian_email", "Enter your parent or guardian's email address"]);
        if (!v.guardian_consent) e.push(["guardian_consent", "A parent or guardian must consent to this entry"]);
      }
      if ((v.access_hearing || v.access_sight || trim(v.access_notes)) && !v.access_consent) e.push(["access_consent", "Tick the box to agree we can store this, or remove what you have written"]);
      if (v.photo_ok && v.photo_opt_out) e.push(["photo_opt_out", "Choose either photos allowed or no photos, not both"]);
      if (!v.eligibility_confirmed) e.push(["eligibility_confirmed", "Confirm that you are eligible to compete in this category"]);
    }
    if (n === 2) {
      if (!v.event) e.push(["event", "Choose an event"]);
      if (!v.equipment) e.push(["equipment", "Choose your equipment"]);
      if (!v.weight_class_id || !allowedClasses().some(function (c) { return c.id === v.weight_class_id; })) e.push(["weight_class_id", "Choose your weight class"]);
      if (priceNow() === null && v.event && v.equipment) e.push(["event", "We could not work out a price. Please contact the entries team"]);
    }
    return e;
  }

  // ---- payment ---------------------------------------------------------------------------------
  function payload() {
    var o = { competition_id: ctx.comp.id, email: trim(v.email), full_name: trim(v.full_name), date_of_birth: dobISO(), sex: v.sex,
      bp_number: trim(v.bp_number), club: trim(v.club), instagram: trim(v.instagram).replace(/^@/, ""), event: v.event, equipment: v.equipment,
      weight_class_id: v.weight_class_id, division_id: v.division_id || "", openipf_url: trim(v.openipf_url),
      photo_ok: !!v.photo_ok, photo_opt_out: !!v.photo_opt_out, eligibility_confirmed: !!v.eligibility_confirmed,
      access_hearing: !!v.access_hearing, access_sight: !!v.access_sight, access_notes: trim(v.access_notes), access_consent: !!v.access_consent };
    if (ageOnDay() < 18) { o.guardian_name = trim(v.guardian_name); o.guardian_phone = trim(v.guardian_phone); o.guardian_email = trim(v.guardian_email); o.guardian_consent = !!v.guardian_consent; }
    return o;
  }
  function loadStripe() {
    return new Promise(function (resolve, reject) {
      if (window.Stripe) return resolve(window.Stripe);
      var s = document.createElement("script"); s.src = "https://js.stripe.com/v3/";
      s.onload = function () { resolve(window.Stripe); }; s.onerror = function () { reject(new Error("stripe.js did not load")); };
      document.head.appendChild(s);
    });
  }
  function pay(btn) {
    var err = document.getElementById("submit-error");
    err.hidden = true; btn.disabled = true; btn.textContent = "Holding your place…";
    Y.db().auth.getSession().then(function (s) {
      var token = s && s.data && s.data.session && s.data.session.access_token, body = payload();
      var headers = { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey || "" };
      if (preview && token) { headers.Authorization = "Bearer " + token; body.preview = true; }
      return fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/functions/v1/entry-checkout", { method: "POST", headers: headers, body: JSON.stringify(body) });
    }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { ok: res.ok, b: b }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.b.message || "Sorry, something went wrong. Please try again.");
        if (r.b.free) return showDone();
        return loadStripe().then(function (Stripe) {
          app.innerHTML = ""; app.appendChild(el("h2", null, "Pay " + pounds(r.b.price_pence)));
          app.appendChild(el("p", { class: "help" }, "Your place is held for " + ctx.settings.hold_minutes + " minutes. Please complete payment before then."));
          var box = el("div", { id: "checkout" }); app.appendChild(box);
          return Stripe(r.b.publishable_key).initEmbeddedCheckout({ clientSecret: r.b.client_secret }).then(function (c) { c.mount(box); });
        });
      })
      .catch(function (e) {
        if (window.console) console.error(e);
        err.textContent = e.message || "Sorry, something went wrong. Please try again."; err.hidden = false; btn.disabled = false; btn.textContent = "Continue to payment";
      });
  }
  function showDone() {
    app.innerHTML = ""; app.appendChild(el("div", { class: "success-panel", tabindex: "-1" }, el("div", { class: "tick", "aria-hidden": "true" }, "✓"),
      el("h2", { style: "margin-top:0" }, "You are entered"), el("p", null, "We have your entry. A confirmation email is on its way.")));
  }

  // ---- render ----------------------------------------------------------------------------------
  function render(keepFocus) {
    var active = keepFocus && document.activeElement && document.activeElement.id;
    clearErrors(); app.innerHTML = "";
    var names = ["About you", "Your lifting", "Check your answers"];
    app.appendChild(el("p", { class: "help" }, "Step " + step + " of 3: " + names[step - 1]));
    var form = el("form", { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (step === 3) return pay(form.querySelector("button[type=submit]"));
      var errs = validate(step); if (errs.length) return showErrors(errs);
      step++; render(); window.scrollTo(0, 0);
    } }, step === 1 ? stepAbout() : step === 2 ? stepLifting() : stepCheck(),
      el("div", { style: "display:flex;gap:.75rem;margin-top:1.5rem;flex-wrap:wrap" },
        step > 1 ? el("button", { class: "btn btn-secondary", type: "button", onclick: function () { step--; render(); window.scrollTo(0, 0); } }, "Back") : null,
        el("button", { class: "btn btn-primary", type: "submit" }, step === 3 ? "Continue to payment" : "Continue")));
    app.appendChild(form);
    if (active) { var a = document.getElementById(active); if (a) a.focus(); }
  }

  // ---- load ------------------------------------------------------------------------------------
  function stop(headline, html) {
    title.textContent = headline; lede.textContent = ""; app.hidden = true; status.hidden = false; status.innerHTML = html;
  }
  function init() {
    var slug = new URLSearchParams(location.search).get("c") || "";
    var db = Y.db();
    if (!db || !slug) return stop("Enter a competition", "<p>Choose a competition from the <a href='calendar.html'>calendar</a> to enter.</p>");
    var cols = "id,name,start_date,end_date,venue_name,slug,entry_url,waitlist_url";
    // The public sees published competitions only. A signed-in entries team member can also open an unpublished one
    // (a TEST competition) to try it. The payment function re-checks their login before allowing it.
    db.from("competitions_public").select(cols).eq("slug", slug).maybeSingle().then(function (r) {
      if (r.data) return { comp: r.data, preview: false };
      return db.from("competitions").select(cols + ",entry_method,entries_closed_manually").eq("slug", slug).maybeSingle().then(function (r2) {
        return r2.data ? { comp: r2.data, preview: true } : { comp: null };
      });
    }).then(function (found) {
      var comp = found.comp;
      if (!comp) return stop("Competition not found", "<p>We could not find that competition. Try the <a href='calendar.html'>calendar</a>.</p>");
      return Promise.all([
        found.preview ? Promise.resolve({ data: { entry_method: comp.entry_method, entries_closed_manually: comp.entries_closed_manually } }) : db.from("competition_entry_state").select("*").eq("competition_id", comp.id).maybeSingle(),
        db.from("entry_settings").select("*").eq("competition_id", comp.id).maybeSingle(),
        db.from("entry_stages").select("*").eq("competition_id", comp.id).order("opens_at"),
        db.from("price_rules").select("*").eq("competition_id", comp.id).order("sort_order"),
        db.from("weight_classes").select("*").eq("active", true).order("sort_order"),
        db.from("divisions").select("*").order("sort_order"),
        db.rpc("places_left", { c: comp.id })
      ]).then(function (a) {
        var st = a[0].data, settings = a[1].data, stages = a[2].data || [];
        if (st) { st.places_left = a[6].data; st.entries_close_at = settings && settings.entries_close_at; }
        preview = found.preview;
        title.textContent = "Enter " + comp.name;
        lede.textContent = Y.dateRange(comp.start_date, comp.end_date) + (comp.venue_name ? " at " + comp.venue_name : "");
        if (!st || !settings || st.entry_method !== "yne")
          return stop("Enter " + comp.name, "<p>Entries for this competition are not taken on this page." + (comp.entry_url ? " <a href='" + encodeURI(comp.entry_url) + "'>Enter here</a>." : "") + "</p>");
        var now = new Date();
        if (st.entries_closed_manually || (st.entries_close_at && new Date(st.entries_close_at) <= now)) return stop("Entries are closed", "<p>Entries for " + Y.el("span", null, comp.name).textContent + " are closed.</p>");
        var general = stages.filter(function (s) { return s.kind === "general"; })[0];
        if (!general || new Date(general.opens_at) > now) return stop("Entries are not open yet", "<p>Entries" + (general ? " open on " + new Date(general.opens_at).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "full", timeStyle: "short" }) : " have not opened yet") + ".</p>");
        if (st.places_left < 1) return stop("This competition is full", "<p>Sorry, all places have gone." + (comp.waitlist_url ? " <a href='" + encodeURI(comp.waitlist_url) + "'>Join the waiting list</a>." : "") + "</p>");
        ctx = { comp: comp, settings: settings, rules: a[3].data || [], classes: a[4].data || [], divisions: a[5].data || [] };
        document.getElementById("hold-minutes").textContent = settings.hold_minutes;
        lede.textContent += ". " + st.places_left + (st.places_left === 1 ? " place" : " places") + " left.";
        if (preview) status.hidden = false, status.innerHTML = "<p><strong>Preview.</strong> This competition is not published. You can enter it because you are signed in to the site editor. Use Stripe test cards only.</p>";
        app.hidden = false; render();
      });
    }).catch(function (e) { if (window.console) console.error(e); stop("Something went wrong", "<p>We could not load this page. Please try again or <a href='contact.html'>contact us</a>.</p>"); });
  }
  init();
})();
