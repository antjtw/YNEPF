/* entry-thanks.js: if the address says which competition this was (?c=<address>), the "View entries" button goes to its list. */
(function () {
  "use strict";
  var slug = new URLSearchParams(location.search).get("c");
  var a = document.getElementById("view-entries");
  if (a && slug && /^[a-z0-9-]+$/i.test(slug)) { a.href = "/entries?c=" + encodeURIComponent(slug); a.hidden = false; }
})();
