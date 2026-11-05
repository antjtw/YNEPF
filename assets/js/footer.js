/* ==========================================================================
   footer.js: draws the footer's links from the database, so they can be edited
   under Footer in the site editor (rename columns, add and reorder links).

   The footer in the page's HTML is a complete fallback. This replaces its
   columns, social links and bottom-row links with the live version and also
   fills the menu drawer's links. It talks to the database with a plain fetch,
   so it adds almost no weight to a page.
   ========================================================================== */
(function () {
  "use strict";
  var footer = document.querySelector(".site-footer");
  var cfg = window.YNEPF_CONFIG || {};
  if (!footer || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
  var ROOT = footer.getAttribute("data-root") || "";
  var CACHE = "ynepf-footer-v1", TTL = 60 * 1000;

  // Only these kinds of address ever become links: https, mailto, "#" (a placeholder),
  // and pages on this site such as faqs.html. Anything else (javascript:, data:...) is dropped.
  function clean(url) {
    url = String(url || "").trim();
    if (url === "#") return { href: "#", placeholder: true };
    if (/^https:\/\/[^\s]+$/i.test(url)) return { href: url, external: true };
    if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return { href: url };
    if (/^[A-Za-z0-9][A-Za-z0-9_\-.\/]*(#[\w-]*)?$/.test(url) && url.indexOf("..") < 0 && url.indexOf("//") < 0) return { href: ROOT + url };
    return null;
  }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== undefined) n.setAttribute(k, attrs[k]); });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return n;
  }
  function anchor(item, withIcon) {
    var c = clean(item.url);
    if (!c) return null;
    var a = el("a", { href: c.href });
    if (withIcon) { var icon = ICONS[(item.label.match(/instagram|facebook/i) || [""])[0].toLowerCase()]; if (icon) a.insertAdjacentHTML("beforeend", icon); }
    a.appendChild(document.createTextNode(item.label));
    if (c.external) {
      a.target = "_blank"; a.rel = "noopener";
      a.appendChild(el("span", { class: "visually-hidden" }, " (opens in a new tab)"));
    }
    return a;
  }
  var ICONS = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21h3z"/></svg>'
  };
  var bySort = function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); };
  function linksOf(groups) {
    var out = [];
    groups.forEach(function (g) { (g.footer_links || []).slice().sort(bySort).forEach(function (l) { out.push(l); }); });
    return out;
  }
  function fillList(ul, items, withEditor) {
    if (!ul) return;
    ul.replaceChildren();
    items.forEach(function (l) { var a = anchor(l); if (a) ul.appendChild(el("li", null, a)); });
    if (withEditor) ul.appendChild(el("li", null, el("a", { href: ROOT + "admin/" }, "Site editor")));
  }

  function render(groups) {
    groups = (groups || []).slice().sort(bySort);
    var cols = groups.filter(function (g) { return g.placement === "column" && (g.footer_links || []).length; });
    var bottom = groups.filter(function (g) { return g.placement === "bottom"; });
    var social = groups.filter(function (g) { return g.placement === "social"; });

    // Columns: the logo column plus one per group. Widths follow the grid (halves, thirds, quarters).
    var row = document.getElementById("footer-main"), brand = document.getElementById("footer-brand");
    if (row && brand) {
      Array.prototype.forEach.call(row.querySelectorAll("[data-footer-col]"), function (n) { n.remove(); });
      var total = 1 + cols.length;
      var cls = total <= 2 ? "grid-column-one-half" : total === 3 ? "grid-column-one-third" : "grid-column-one-quarter";
      brand.className = cls;
      cols.forEach(function (g) {
        var ul = el("ul", { class: "footer-list" });
        (g.footer_links || []).slice().sort(bySort).forEach(function (l) { var a = anchor(l); if (a) ul.appendChild(el("li", null, a)); });
        row.appendChild(el("div", { class: cls, "data-footer-col": "" },
          el("h2", { class: "footer-heading" }, g.title),
          el("nav", { "aria-label": "Footer: " + g.title }, ul)));
      });
    }
    var soc = document.getElementById("footer-social");
    if (soc) {
      soc.replaceChildren();
      linksOf(social).forEach(function (l) { var a = anchor(l, true); if (a) soc.appendChild(el("li", null, a)); });
      soc.hidden = !soc.children.length;
    }
    fillList(document.getElementById("footer-legal"), linksOf(bottom), true);
    fillList(document.getElementById("drawer-legal"), linksOf(bottom), true);

    // The contact page links to the privacy policy once it has a real address.
    var note = document.querySelector("[data-privacy-note]");
    if (note) {
      var priv = linksOf(groups).filter(function (l) { var c = clean(l.url); return /privacy/i.test(l.label) && c && !c.placeholder; })[0];
      var a = note.querySelector("a");
      if (priv && a) { var c = clean(priv.url); a.href = c.href; if (c.external) { a.target = "_blank"; a.rel = "noopener"; if (!a.querySelector(".visually-hidden")) a.appendChild(el("span", { class: "visually-hidden" }, " (opens in a new tab)")); } note.hidden = false; }
      else note.hidden = true;
    }
  }

  try { var hit = JSON.parse(sessionStorage.getItem(CACHE) || "null"); if (hit && Date.now() - hit.at < TTL) return render(hit.groups); } catch (e) { /* no storage: fine */ }
  var key = cfg.supabaseAnonKey;
  fetch(cfg.supabaseUrl + "/rest/v1/footer_groups?select=id,title,placement,sort_order,footer_links(id,label,url,sort_order)&order=sort_order.asc",
    { headers: { apikey: key, Authorization: "Bearer " + key } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (groups) {
      if (!Array.isArray(groups) || !groups.length) return; // nothing set up yet: keep the built-in footer
      try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), groups: groups })); } catch (e) { /* ignore */ }
      render(groups);
    })
    .catch(function () { /* keep the built-in footer */ });
})();
