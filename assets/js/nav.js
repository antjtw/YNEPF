/* ==========================================================================
   nav.js: the slide-out menu. The drawer is a native <dialog>, so the browser
   already traps focus, closes on Esc and makes the page behind it inert. This
   only opens it, closes it from the Close button or a click on the backdrop,
   keeps aria-expanded honest, and hands focus back to the menu button.
   ========================================================================== */
(function () {
  "use strict";
  function wire() {
    var dlg = document.getElementById("site-menu");
    var toggles = document.querySelectorAll(".menu-toggle");
    if (!dlg || !toggles.length || dlg.dataset.wired) return;
    dlg.dataset.wired = "true";
    var opener = null;

    function setExpanded(v) { Array.prototype.forEach.call(toggles, function (t) { t.setAttribute("aria-expanded", String(v)); }); }
    function open(from) {
      if (typeof dlg.showModal !== "function") { location.href = (document.querySelector('a[data-nav="contact"]') || {}).href || "contact.html"; return; }
      opener = from; dlg.showModal(); setExpanded(true);
    }
    Array.prototype.forEach.call(toggles, function (t) { t.addEventListener("click", function () { open(t); }); });
    dlg.addEventListener("close", function () { setExpanded(false); if (opener && opener.focus) opener.focus(); });
    dlg.addEventListener("click", function (e) {
      // A click on the dialog element itself is a click on the backdrop.
      if (e.target === dlg || (e.target.closest && e.target.closest("[data-close-menu]"))) dlg.close();
    });
    // Following a link to the page you are already on should not leave the menu open.
    dlg.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (a && a.getAttribute("href").charAt(0) === "#") dlg.close();
    });
    // If the window is resized wide enough to show the inline nav, tuck the drawer away.
    window.matchMedia("(min-width: 64em)").addEventListener("change", function (m) { if (m.matches && dlg.open) dlg.close(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
