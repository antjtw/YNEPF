/* ==========================================================================
   volunteer.js: the volunteer sign-up form (/volunteer?c=<competition address>).

   The competition's sessions and the roles volunteers can choose come from the database function volunteer_form, and the answers go back
   through volunteer_signup. Nothing personal is ever readable from this page. Referees, the technical controller and the session manager
   are not on the form: the volunteers coordinator fills those in. Validation follows the GOV.UK pattern, as the contact form does.
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF, el = Y.el, root = document.getElementById("live"), summary = document.getElementById("error-summary"), list = document.getElementById("error-list");
  if (!root || !Y) return;
  var SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"], EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var slug = new URLSearchParams(location.search).get("c") || "", form = null, data = null;

  function stop(h, html) { document.getElementById("page-title").textContent = h; document.getElementById("page-lede").textContent = ""; root.innerHTML = html; }
  function field(id, label, input, help, optional) {
    return el("div", { class: "field", "data-field": id },
      el("label", { for: id }, label + (optional ? " (optional)" : "")),
      help ? el("p", { class: "help", id: id + "-help" }, help) : null,
      el("p", { class: "field-error", id: id + "-error", hidden: "" }),
      input);
  }
  function check(id, label, name, value) {
    return el("div", { class: "field-check" }, el("input", { id: id, name: name, type: "checkbox", value: value || "" }), el("label", { for: id }, label));
  }

  function build() {
    var sessionBoxes = data.sessions.map(function (s) {
      var title = s.label + (s.when_text ? ": " + s.when_text : "");
      return el("fieldset", { class: "field", "data-field": "choices", style: "border:0;padding:0;margin:0 0 var(--space-5)" },
        el("legend", { style: "font-weight:700;margin-bottom:var(--space-2)" }, title),
        s.roles.map(function (r) { return check("c-" + s.id + "-" + r.id, r.name, "choice", s.id + "|" + r.id); }));
    });
    var shirt = el("select", { id: "tshirt", name: "tshirt", autocomplete: "off" }, el("option", { value: "" }, "Choose a size"), SIZES.map(function (z) { return el("option", { value: z }, z); }));
    form = el("form", { class: "contact-card form-touch", novalidate: "" },
      data.intro ? el("p", null, data.intro) : null,
      el("p", null, "You will earn points for each session you help with. Points can be spent on priority entry and discounts. ", el("a", { href: "faqs.html#how-do-i-earn-points" }, "How points work"), "."),
      el("p", { class: "callout" }, el("strong", null, "Please tell us in advance if you cannot make it. "), "If you do not turn up and have not let us know, you lose your volunteer points."),
      field("name", "Your first and last name", el("input", { id: "name", name: "name", type: "text", autocomplete: "name", maxlength: "120" })),
      field("email", "Your email address", el("input", { id: "email", name: "email", type: "email", autocomplete: "email", spellcheck: "false", maxlength: "200" }), "We use this to contact you about the rota, and to keep your points."),
      field("mobile", "Mobile number", el("input", { id: "mobile", name: "mobile", type: "tel", autocomplete: "tel", maxlength: "20" }), "We may add you to a WhatsApp group for the competition.", true),
      data.offer_tshirts ? field("tshirt", "T-shirt size", shirt, "Unisex sizes. We usually get a T-shirt for each volunteer.") : null,
      el("h2", { style: "font-size:var(--fs-24);margin-top:var(--space-6)" }, "When can you help?"),
      el("p", null, "Tick every role you would be happy to do. We will let you know what you have been given."),
      el("div", { "data-field": "choices-wrap" }, el("p", { class: "field-error", id: "choices-error", hidden: "" }), sessionBoxes),
      field("note", "Anything else we should know?", el("textarea", { id: "note", name: "note", rows: "3", maxlength: "500" }), null, true),
      el("div", { class: "field", "data-field": "over18" }, el("p", { class: "field-error", id: "over18-error", hidden: "" }), check("over18", "I am 18 or over", "over18")),
      el("div", { class: "hp-field", "aria-hidden": "true" }, el("label", { for: "website" }, "Leave this field empty"), el("input", { id: "website", name: "website", type: "text", tabindex: "-1", autocomplete: "off" })),
      el("p", { class: "small" }, "We use your details to run the rota and the points scheme. Read our ", el("a", { href: "privacy" }, "privacy policy"), "."),
      el("button", { class: "btn btn-primary", type: "submit", id: "send" }, "Sign up"));
    form.addEventListener("submit", submit);
    root.replaceChildren(form);
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
      var target = e[0] === "choices" ? document.getElementById("choices-error") : document.getElementById(e[0] + "-error");
      if (target) { target.textContent = e[1]; target.hidden = false; var f = target.closest(".field, [data-field]"); if (f) f.classList.add("has-error"); }
      var first = e[0] === "choices" ? form.querySelector("input[name=choice]") : document.getElementById(e[0]);
      list.appendChild(el("li", null, el("a", { href: "#" + (first && first.id ? first.id : e[0]) }, e[1])));
    });
    summary.hidden = false; summary.focus();
  }
  var MESSAGES = { closed: "Sign-up for this competition is closed.", "invalid:over18": "Volunteers must be 18 or over.", "invalid:email": "Check your email address.", "invalid:name": "Enter your first and last name.", "invalid:mobile": "Check your mobile number, or leave it empty.", "invalid:tshirt": "Choose a T-shirt size.", "invalid:choices": "Tick at least one role you could do." };

  function submit(ev) {
    ev.preventDefault(); clearErrors();
    var v = values(), errs = validate(v);
    if (errs.length) return showErrors(errs);
    if (v.website) return;                                           // a bot filled the hidden field
    var btnEl = document.getElementById("send"); btnEl.disabled = true;
    Y.db().rpc("volunteer_signup", { p: { slug: slug, name: v.name, email: v.email, mobile: v.mobile, tshirt: v.tshirt, over18: v.over18, note: v.note, choices: v.choices } }).then(function (r) {
      if (r.error) { var m = String(r.error.message || "").replace(/^.*?ERROR:\s*/s, "").split("\n")[0].trim(); btnEl.disabled = false; return showErrors([["name", MESSAGES[m] || "We could not save your sign-up. Please try again in a moment."]]); }
      var got = {}; v.choices.forEach(function (c) { got[c.session_id + "|" + c.role_id] = 1; });
      var lines = [];
      data.sessions.forEach(function (s) { var rs = s.roles.filter(function (r) { return got[s.id + "|" + r.id]; }).map(function (r) { return r.name; }); if (rs.length) lines.push(el("li", null, s.label + ": " + rs.join(", "))); });
      document.getElementById("page-title").textContent = "Thank you, " + v.name.split(" ")[0];
      document.getElementById("page-lede").textContent = "You are signed up to volunteer at " + data.name + ".";
      root.replaceChildren(el("p", null, "You said you could help with:"), el("ul", null, lines),
        el("p", null, "We will be in touch about the rota. If anything changes, ", el("strong", null, "please tell us in advance"), ": reply to our email or write to ", el("a", { href: "mailto:info@ynepf.co.uk" }, "info@ynepf.co.uk"), ". If you do not turn up and have not told us, you lose your volunteer points."),
        el("p", null, "If you need to change your answers, fill the form in again with the same email address."));
    }).catch(function () { btnEl.disabled = false; showErrors([["name", "We could not save your sign-up. Please try again in a moment."]]); });
  }

  if (!Y.db() || !slug) return stop("Volunteer", "<p>Choose a competition from the <a href='calendar.html'>calendar</a>.</p>");
  Y.db().rpc("volunteer_form", { slug: slug }).then(function (r) {
    if (r.error) throw r.error;
    data = r.data || {};
    if (!data.open) return stop(data.name ? "Volunteer sign-up for " + data.name : "Volunteer sign-up", "<p>Volunteer sign-up is not open for this competition. We open it a couple of weeks after entry opens. Keep an eye on our social media, or email <a href='mailto:info@ynepf.co.uk'>info@ynepf.co.uk</a> if you would like to help.</p>");
    document.getElementById("page-title").textContent = "Volunteer at " + data.name;
    document.getElementById("page-lede").textContent = Y.longDate(data.start_date) + ". Sign up to help.";
    build();
  }).catch(function (e) { if (window.console) console.error(e); stop("Something went wrong", "<p>We could not load this page. Please try again or <a href='contact.html'>contact us</a>.</p>"); });
})();
