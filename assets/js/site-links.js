/* ==========================================================================
   site-links.js: links to documents and social pages that live elsewhere.

   The privacy policy, franchise documents and so on are Google Docs (or any
   web page). Paste each address below. A link with an empty address stays
   hidden everywhere on the site (footer, menu, contact page), so there are
   never dead links. Use the Doc's "Anyone with the link: Viewer" share link.
   ========================================================================== */
(function () {
  "use strict";
  var LINKS = {
    privacy: "",      // Privacy policy (Google Doc)
    franchise: "",    // Franchise documents (Google Doc or folder)
    instagram: "",    // https://www.instagram.com/...
    facebook: ""      // the Facebook group
  };

  function apply(map) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-link]"), function (a) {
      var url = map[a.getAttribute("data-link")];
      var box = a.closest("[data-link-group]") || a;
      if (!url || !/^https:\/\//i.test(url)) { box.hidden = true; return; }
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      if (!a.querySelector(".visually-hidden")) {
        var s = document.createElement("span"); s.className = "visually-hidden"; s.textContent = " (opens in a new tab)"; a.appendChild(s);
      }
      box.hidden = false;
    });
  }
  window.YNEPF_APPLY_LINKS = apply;   // also lets tests and previews try addresses out
  apply(LINKS);
})();
