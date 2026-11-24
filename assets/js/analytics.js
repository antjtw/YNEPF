/* ==========================================================================
   analytics.js: Vercel Web Analytics. It sets no cookies, so no banner is needed.
   It stays OFF for anything that could carry personal details in the address: my-entry (the email is in the link), and any
   link with a token or email in it (priority, offer, volunteer edit, payment return). Only the plain competition and post
   links (?c= and ?p=) are counted. It also respects Do Not Track.
   ========================================================================== */
(function () {
  "use strict";
  try {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
    if (/\/my-entry(\.html)?\/?$/.test(location.pathname)) return;
    var safe = true;
    new URLSearchParams(location.search).forEach(function (v, k) { if (k !== "c" && k !== "p") safe = false; });
    if (!safe) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    var s = document.createElement("script");
    s.defer = true; s.src = "/_vercel/insights/script.js";
    document.head.appendChild(s);
  } catch (e) { /* analytics must never get in the way of the page */ }
})();
