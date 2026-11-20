/* ==========================================================================
   volunteer.js: the volunteer sign-up form (/volunteer?c=<competition address>), and changing your answers
   (/volunteer?c=<address>&edit=<your personal token>).

   The competition's sessions and the roles volunteers can choose come from the database function volunteer_form. The answers go to
   the waitlist Edge Function (action volunteer_signup), which saves them and emails a confirmation with a personal link for changing
   them. "Email me my link" (action volunteer_link) sends that link again. Referees, the technical controller and the session
   manager are not on the form: the volunteers coordinator fills those in. Validation follows the GOV.UK pattern.
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF, el = Y.el, root = document.getElementById("live"), summary = document.getElementById("error-summary"), list = document.getElementById("error-list");
  if (!root || !Y) return;
  var CFG = window.YNEPF_CONFIG || {};
  var SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"], EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var params = new URLSearchParams(location.search), slug = params.get("c") || "", token = params.get("edit") || "", form = null, data = null, mine = null;

  function setHead(h, lede) { document.getElementById("page-title").textContent = h; document.getElementById("page-lede").textContent = lede || ""; }
  function stop(h, html) { setHead(h, ""); root.innerHTML = html; }
  function post(action, payload) {
    return fetch((CFG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", {
      method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey || "", Authorization: "Bearer " + (CFG.supabaseAnonKey || "") },
      body: JSON.stringify(Object.assign({ action: action, slug: slug }, payload))
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { b.status = r.status; return b; }); });
  }
  function field(id, label, input, help, optional) {
    return el("div", { class: "field", "data-field": id }, el("label", { for: id }, label + (optional ? " (optional)" : "")),
      help ? el("p", { class: "help", id: id + "-help" }, help) : null, el("p", { class: "field-error", id: id + "-error", hidden: "" }), input);
  }
  function check(id, label, name, value) { return el("div", { class: "field-check" }, el("input", { id: id, name: name, type: "checkbox", value: value || "" }), el("label", { for: id }, label)); }

  // ---- the "Already signed up? Change your answers" box: asks for the link by email
  function linkBox() {
    var email = el("input", { id: "link-email", type: "email", autocomplete: "email", spellcheck: "false", maxlength: "200" }), out = el("div", { "aria-live": "polite" });
    var go = el("button", { class: "btn btn-secondary", type: "button" }, "Email me a link");
    go.addEventListener("click", function () {
      var v = String(email.value || "").trim();
      if (!EMAIL.test(v)) { out.replaceChildren(el("p", { class: "form-error" }, "Enter the email address you signed up with, like name@example.com.")); email.focus(); return; }
      go.disabled = true;
      post("volunteer_link", { email: v }).then(function (b) {
        go.disabled = false;
        if (b.ok && b.found) out.replaceChildren(el("div", { class: "success-panel", role: "status" }, el("h2", { style: "font-size:var(--fs-24)" }, "Check your email"), el("p", { style: "margin:0" }, "We have sent a link to " + v + ". It can take a few minutes. Use it to see what you signed up to and change it.")));
        else if (b.ok) out.replaceChildren(el("div", { class: "callout", role: "alert" }, el("p", { class: "callout-title" }, "We could not find a sign-up for that email address"), el("p", { style: "margin:0" }, "Check it is the address you signed up with, or fill in the form above to sign up.")));
        else out.replaceChildren(el("p", { class: "form-error" }, b.message || "We could not do that just now. Please try again in a moment."));
      }).catch(function () { go.disabled = false; out.replaceChildren(el("p", { class: "form-error" }, "We could not do that just now. Please try again in a moment.")); });
    });
    return el("section", { style: "margin-top:var(--space-7)", "aria-labelledby": "link-h" }, el("h2", { id: "link-h", style: "font-size:var(--fs-24)" }, "Already signed up? Change your answers"),
      el("p", null, "Enter the email address you signed up with and we will email you a personal link to see what you signed up to and change it."),
      el("div", { class: "field" }, el("label", { for: "link-email" }, "Your email address"), email), el("div", { class: "actions" }, go), out);
  }

  function build() {
    var editing = !!mine, have = {};
    if (editing) (mine.choices || []).forEach(function (c) { have[c.session_id + "|" + c.role_id] = 1; });
    var sessionBoxes = data.sessions.map(function (s) {
      return el("fieldset", { class: "session-group", "data-field": "choices" },
        el("legend", null, s.label, s.when_text ? el("span", null, s.when_text) : null),
        el("div", { class: "session-roles" }, s.roles.map(function (r) { var b = check("c-" + s.id + "-" + r.id, r.name, "choice", s.id + "|" + r.id); if (have[s.id + "|" + r.id]) b.querySelector("input").checked = true; return b; })));
    });
    var shirt = el("select", { id: "tshirt", name: "tshirt", autocomplete: "off" }, el("option", { value: "" }, "Choose a size"), SIZES.map(function (z) { return el("option", { value: z }, z); }));
    var emailInput = el("input", { id: "email", name: "email", type: "email", autocomplete: "email", spellcheck: "false", maxlength: "200" });
    form = el("form", { class: "contact-card form-touch", novalidate: "" },
      editing ? el("p", { class: "form-note", role: "status" }, "You are changing your answers. Tick or untick the roles, then save. We will email you a copy.") : null,
      data.intro ? el("p", null, data.intro) : null,
      el("p", null, "You will earn points for each session you help with. Points can be spent on priority entry and discounts. ", el("a", { href: "faqs#how-do-i-earn-points" }, "How points work"), "."),
      el("p", { class: "form-note" }, el("strong", null, "Please tell us in advance if you cannot make it. "), "If you do not turn up and have not let us know, you lose your volunteer points."),
      field("name", "Your first and last name", el("input", { id: "name", name: "name", type: "text", autocomplete: "name", maxlength: "120" })),
      field("email", "Your email address", emailInput, editing ? "This is the address you signed up with. It cannot be changed here." : "We use this to contact you about the rota, and to keep your points."),
      field("mobile", "Mobile number", el("input", { id: "mobile", name: "mobile", type: "tel", autocomplete: "tel", maxlength: "20" }), "We may add you to a WhatsApp group for the competition.", true),
      data.offer_tshirts ? field("tshirt", "T-shirt size", shirt, "Unisex sizes. We usually get a T-shirt for each volunteer.") : null,
      el("h2", { class: "form-part" }, "When can you help?"),
      el("p", null, "Tick every role you would be happy to do. We will only give you a role you ticked."),
      el("div", { "data-field": "choices-wrap" }, el("p", { class: "field-error", id: "choices-error", hidden: "" }), sessionBoxes),
      field("note", "Anything else we should know?", el("textarea", { id: "note", name: "note", rows: "3", maxlength: "500" }), null, true),
      el("div", { class: "form-consent" },
        el("div", { class: "field", "data-field": "over18" }, el("p", { class: "field-error", id: "over18-error", hidden: "" }), check("over18", "I am 18 or over", "over18")),
        el("div", { class: "hp-field", "aria-hidden": "true" }, el("label", { for: "website" }, "Leave this field empty"), el("input", { id: "website", name: "website", type: "text", tabindex: "-1", autocomplete: "off" })),
        el("p", { class: "small" }, "We use your details to run the rota and the points scheme. Read our ", el("a", { href: "privacy" }, "privacy policy"), "."),
        el("button", { class: "btn btn-primary", type: "submit", id: "send" }, editing ? "Save my answers" : "Sign up")));
    form.addEventListener("submit", submit);
    root.replaceChildren(form);
    if (editing) {
      form.elements.name.value = mine.name || ""; form.elements.email.value = mine.email || ""; form.elements.email.readOnly = true; form.elements.mobile.value = mine.mobile || "";
      if (form.elements.tshirt) form.elements.tshirt.value = mine.tshirt || ""; form.elements.note.value = mine.note || ""; form.elements.over18.checked = true;
    } else root.appendChild(linkBox());
  }

  function values() {
    var v = { choices: [] };
    ["name", "email", "mobile", "tshirt", "note", "website"].forEach(function (k) { var n = form.elements[k]; v[k] = n ? String(n.value || "").trim() : ""; });
    Array.prototype.forEach.call(form.querySelectorAll("input[name=choice]:checked"), function (c) { var p = c.value.split("|"); v.choices.push({ session_id: p[0], role_id: p[1] }); });
    v.over18 = form.elements.over18.checked;
    return v;
  }
  function validate(v) {
    var e = [];
    if (v.name.length < 2) e.push(["name", "Enter your first and last name"]);
    if (!v.email) e.push(["email", "Enter your email address"]); else if (!EMAIL.test(v.email)) e.push(["email", "Enter an email address in the correct format, like name@example.com"]);
    if (v.mobile && !/^[0-9 +()-]{7,20}$/.test(v.mobile)) e.push(["mobile", "Enter a mobile number in the correct format, like 07700 900123, or leave it empty"]);
    if (data.offer_tshirts && !v.tshirt) e.push(["tshirt", "Choose a T-shirt size"]);
    if (!v.choices.length) e.push(["choices", "Tick at least one role you could do"]);
    if (!v.over18) e.push(["over18", "Confirm you are 18 or over"]);
    return e;
  }
  function clearErrors() {
    summary.hidden = true; list.replaceChildren();
    Array.prototype.forEach.call(form.querySelectorAll(".field-error"), function (m) { m.hidden = true; m.textContent = ""; });
    Array.prototype.forEach.call(form.querySelectorAll(".has-error"), function (f) { f.classList.remove("has-error"); });
  }
  function showErrors(errs) {
    errs.forEach(function (e) {
      var target = document.getElementById(e[0] + "-error");
      if (target) { target.textContent = e[1]; target.hidden = false; var f = target.closest(".field, [data-field]"); if (f) f.classList.add("has-error"); }
      var first = e[0] === "choices" ? form.querySelector("input[name=choice]") : document.getElementById(e[0]);
      list.appendChild(el("li", null, el("a", { href: "#" + (first && first.id ? first.id : e[0]) }, e[1])));
    });
    summary.hidden = false; summary.focus();
  }

  function submit(ev) {
    ev.preventDefault(); clearErrors();
    var v = values(), errs = validate(v);
    if (errs.length) return showErrors(errs);
    if (v.website) return;                                           // a bot filled the hidden field
    var btnEl = document.getElementById("send"); btnEl.disabled = true;
    post("volunteer_signup", { name: v.name, email: v.email, mobile: v.mobile, tshirt: v.tshirt, over18: v.over18, note: v.note, choices: v.choices, token: token }).then(function (b) {
      btnEl.disabled = false;
      if (!b.ok) return showErrors([["name", b.message || "We could not save your sign-up. Please try again in a moment."]]);
      var got = {}; v.choices.forEach(function (c) { got[c.session_id + "|" + c.role_id] = 1; });
      var lines = [];
      data.sessions.forEach(function (s) { var rs = s.roles.filter(function (r) { return got[s.id + "|" + r.id]; }).map(function (r) { return r.name; }); if (rs.length) lines.push(el("li", null, s.label + ": " + rs.join(", "))); });
      setHead(b.edited ? "Your answers are saved" : "Thank you, " + v.name.split(" ")[0], "");
      document.getElementById("error-summary").hidden = true;
      root.replaceChildren(
        el("div", { class: "success-panel confirm-panel", role: "status" }, el("h2", null, b.edited ? "Your answers have been updated" : "You are signed up to volunteer"), el("p", { style: "margin:0" }, "Thank you. A confirmation is on its way to " + v.email + ", with a link you can use to change your answers.")),
        el("h2", { style: "font-size:var(--fs-24);margin-top:var(--space-6)" }, "You said you could help with"), el("ul", null, lines),
        el("p", null, "We will be in touch about the rota. If anything changes, ", el("strong", null, "please tell us in advance"), ": reply to our email or write to ", el("a", { href: "mailto:info@ynepf.co.uk" }, "info@ynepf.co.uk"), ". If you do not turn up and have not told us, you lose your volunteer points."));
    }).catch(function () { btnEl.disabled = false; showErrors([["name", "We could not save your sign-up. Please try again in a moment."]]); });
  }

  if (!Y.db() || !slug) return stop("Volunteer", "<p>Choose a competition from the <a href='calendar.html'>calendar</a>.</p>");
  Y.db().rpc("volunteer_form", { slug: slug, token: token || null }).then(function (r) {
    if (r.error) throw r.error;
    data = r.data || {};
    if (!data.open) return stop(data.name ? "Volunteer sign-up for " + data.name : "Volunteer sign-up", "<p>Volunteer sign-up is not open for this competition. We open it a couple of weeks after entry opens. Keep an eye on our social media, or email <a href='mailto:info@ynepf.co.uk'>info@ynepf.co.uk</a> if you would like to help.</p>");
    if (data.bad_token) { setHead("Volunteer at " + data.name, "That link has expired or is not right."); root.replaceChildren(el("p", null, "We could not find your sign-up from that link. Ask for a new one below."), linkBox()); return; }
    mine = data.mine || null;
    setHead((mine ? "Change your answers: " : "Volunteer at ") + data.name, Y.longDate(data.start_date) + (mine ? "." : ". Sign up to help."));
    build();
  }).catch(function (e) { if (window.console) console.error(e); stop("Something went wrong", "<p>We could not load this page. Please try again or <a href='contact.html'>contact us</a>.</p>"); });
})();
