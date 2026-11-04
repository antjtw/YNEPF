/* ==========================================================================
   contact.js: the contact form.

   Validation follows the GOV.UK pattern: nothing is checked until Send is
   pressed, then an error summary at the top links to each problem, each field
   gets its own message, and focus moves to the summary so a screen reader
   announces it. Messages are saved to Supabase (visitors can add a message but
   not read any) and appear in the site editor under Messages. A hidden
   honeypot field catches simple bots; a rate limit in the database stops floods.
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF;
  var form = document.getElementById("contact-form");
  if (!form) return;

  var FIELDS = ["name", "email", "subject", "message"];
  var MAX = { name: 120, email: 254, subject: 200, message: 4000 };
  var summary = document.getElementById("error-summary");
  var list = document.getElementById("error-list");
  var sent = document.getElementById("sent");
  var sendBtn = document.getElementById("send");
  var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function validate(v) {
    var e = [];
    if (!v.name) e.push(["name", "Enter your name"]);
    if (!v.email) e.push(["email", "Enter your email address"]);
    else if (!EMAIL.test(v.email)) e.push(["email", "Enter an email address in the correct format, like name@example.com"]);
    if (!v.subject) e.push(["subject", "Enter a subject"]);
    if (!v.message) e.push(["message", "Enter your message"]);
    else if (v.message.length > MAX.message) e.push(["message", "Your message must be " + MAX.message.toLocaleString("en-GB") + " characters or fewer"]);
    return e;
  }

  function clearErrors() {
    summary.hidden = true;
    list.replaceChildren();
    FIELDS.forEach(function (id) {
      var input = document.getElementById(id), msg = document.getElementById(id + "-error");
      var help = document.getElementById(id + "-help");
      input.closest(".field").classList.remove("has-error");
      input.removeAttribute("aria-invalid");
      if (help) input.setAttribute("aria-describedby", id + "-help"); else input.removeAttribute("aria-describedby");
      msg.hidden = true; msg.textContent = "";
    });
  }

  function showErrors(errors) {
    clearErrors();
    errors.forEach(function (pair) {
      var id = pair[0], text = pair[1];
      var input = document.getElementById(id), msg = document.getElementById(id + "-error");
      input.closest(".field").classList.add("has-error");
      input.setAttribute("aria-invalid", "true");
      msg.textContent = text; msg.hidden = false;
      var help = document.getElementById(id + "-help");
      input.setAttribute("aria-describedby", msg.id + (help ? " " + help.id : ""));
      var a = document.createElement("a");
      a.href = "#" + id; a.textContent = text;
      a.addEventListener("click", function (ev) { ev.preventDefault(); input.focus(); });
      var li = document.createElement("li"); li.appendChild(a); list.appendChild(li);
    });
    summary.hidden = false;
    summary.focus();
    summary.scrollIntoView({ block: "start" });
  }

  function failure(text) {
    clearErrors();
    var li = document.createElement("li");
    li.appendChild(document.createTextNode(text + " "));
    var a = document.createElement("a"); a.href = "mailto:ynepfentries@gmail.com"; a.textContent = "ynepfentries@gmail.com";
    li.appendChild(a);
    list.appendChild(li);
    summary.hidden = false; summary.focus(); summary.scrollIntoView({ block: "start" });
  }

  function succeed(email) {
    clearErrors();
    document.getElementById("sent-email").textContent = email;
    form.hidden = true;
    sent.hidden = false;
    sent.focus();
    sent.scrollIntoView({ block: "start" });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = {};
    FIELDS.forEach(function (id) { v[id] = document.getElementById(id).value.trim(); });
    var errors = validate(v);
    if (errors.length) return showErrors(errors);

    // Honeypot: a person never sees this field. Pretend it worked and send nothing.
    if (document.getElementById("website").value) return succeed(v.email);

    var sb = Y && Y.db();
    if (!sb) return failure("The contact form is not connected yet. Please email us at");
    sendBtn.disabled = true; sendBtn.textContent = "Sending…";
    sb.from("contact_messages").insert({ name: v.name, email: v.email, subject: v.subject, message: v.message })
      .then(function (res) {
        if (res.error) {
          if (/rate_limited/.test(res.error.message || "")) return failure("You have sent several messages recently. Please wait a while before trying again, or email us at");
          throw res.error;
        }
        form.reset();
        succeed(v.email);
      })
      .catch(function (e) {
        if (window.console) console.error(e);
        failure("Sorry, your message could not be sent. Please try again, or email us at");
      })
      .then(function () { sendBtn.disabled = false; sendBtn.textContent = "Send message"; });
  });

  document.getElementById("send-another").addEventListener("click", function () {
    sent.hidden = true; form.hidden = false; clearErrors();
    document.getElementById("name").focus();
  });
})();
