/* ==========================================================================
   home.js: the homepage's editable content.

   The homepage HTML already contains the standard wording, so it works with no
   JavaScript and before the database answers. The editor's Home tab can change:
     hero       the headline and the two buttons
     events     the "Upcoming events" heading and button
     resources  the Resources list (icon, colour, title, text, link)
     cards      the "Find your place" heading and cards
     news       the "Latest news" heading and button
     cta        the "Got a question?" band
   plus the pool of hero photos (a different one is picked on every visit).

   How it avoids a flash of the old wording: the last content fetched is kept in
   localStorage and applied by a tiny script straight after each block, before the
   browser paints it. public.js then fetches the latest, applies it and updates
   the copy for next time.

   Used by index.html and by the editor (for the standard wording and icons).
   ========================================================================== */
(function () {
  "use strict";

  var CACHE_KEY = "ynepf-home-v1", LAST_KEY = "ynepf-hero-last";

  // The standard wording: exactly what index.html says. Block texts may use *stars* to highlight words.
  var DEFAULTS = {
    hero: { title: "The home of *drug tested* powerlifting in Yorkshire and the North East",
      primaryLabel: "See the calendar", primaryUrl: "calendar.html", secondaryLabel: "New to powerlifting?", secondaryUrl: "faqs.html" },
    events: { heading: "Upcoming events", buttonLabel: "See the full competition calendar" },
    resources: { heading: "Resources", items: [
      { icon: "membership", colour: "iron", title: "Buy a membership", text: "To lift in the YNEPF you need a valid British Powerlifting membership.", url: "https://www.britishpowerlifting.org/membership/" },
      { icon: "rules", colour: "navy", title: "Technical rules", text: "The rules of powerlifting performance that we follow in the YNEPF.", url: "https://www.powerlifting.sport/rules/codes/info/technical-rules" },
      { icon: "kit", colour: "rose", title: "Approved kit", text: "Only officially registered equipment may be used in the YNEPF.", url: "https://www.powerlifting.sport/rules/codes/info/approved-list" },
      { icon: "records", colour: "grey", title: "Divisional records", text: "Records set by YNEPF lifters at all levels of competition.", url: "records.html" }] },
    cards: { heading: "Find your place on the platform", items: [
      { title: "Your first competition", text: "No experience needed. Everything you need to know before you enter.", linkLabel: "Read the FAQs", url: "faqs.html", style: "inverse" },
      { title: "Compete", text: "From novice days to the divisional championships, all drug tested.", linkLabel: "View the calendar", url: "calendar.html", style: "plain" },
      { title: "Give something back", text: "Volunteer at a competition and earn points towards entries and memberships.", linkLabel: "How points work", url: "faqs.html", style: "plain" }] },
    news: { heading: "Latest news", buttonLabel: "Read all news" },
    cta: { heading: "Got a question?", text: "Entries, kit, volunteering or anything else. Send us a message and we will reply by email.", buttonLabel: "Contact us", url: "contact.html" }
  };

  // The hero photos used until the editor's own pool is available (these files ship with the site).
  var POOL = [
    { url: "assets/img/hero.webp", small: "assets/img/hero-640.webp", alt: "A lifter benching at a YNEPF competition, with spotters either side of the bar" },
    { url: "assets/img/hero-deadlift.webp", small: "assets/img/hero-deadlift-640.webp", alt: "A lifter pulling a deadlift in a maroon kit, with a spotter standing behind the bar" }
  ];

  // Icons for the Resources list (24px, stroke style, same as the rest of the site).
  var S = 'stroke="currentColor" stroke-width="2"', R = ' stroke-linecap="round"', J = ' stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    membership: '<rect x="3" y="5" width="18" height="14" rx="2" ' + S + '/><circle cx="8.5" cy="11" r="2" ' + S + '/><path d="M13 10h5M13 14h4" ' + S + R + '/>',
    rules: '<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2V5Z" ' + S + '/><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2V5Z" ' + S + '/>',
    kit: '<path d="M4 7h10M4 12h10M4 17h7" ' + S + R + '/><path d="M16 16l2 2 4-4" ' + S + J + '/>',
    records: '<rect x="3" y="4" width="18" height="5" rx="1" ' + S + '/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" ' + S + R + '/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2" ' + S + '/><path d="M3 10h18M8 3v4M16 3v4" ' + S + R + '/>',
    news: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" ' + S + '/><path d="M18 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2M9 8h6M9 12h6M9 16h4" ' + S + R + '/>',
    people: '<circle cx="9" cy="8" r="3.2" ' + S + '/><path d="M3 20a6 6 0 0 1 12 0M16 4.8a3.2 3.2 0 0 1 0 6.4M21 20a6 6 0 0 0-4-5.6" ' + S + R + '/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" ' + S + R + '/>'
  };
  var ICON_NAMES = { membership: "Membership card", rules: "Rule book", kit: "Checklist", records: "Archive box", calendar: "Calendar", news: "Newspaper", people: "People", link: "Link" };
  var COLOUR_NAMES = { iron: "Orange", navy: "Blue", rose: "Rose", grey: "Grey" };

  var state = { blocks: {}, pool: null }, rendered = {};
  try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c) { state.blocks = c.blocks || {}; state.pool = c.pool || null; } } catch (e) { /* storage blocked: standard wording */ }

  // A link the site is happy to show: https, mailto, a page on this site, or # (placeholder).
  function urlOk(u) {
    u = String(u || "").trim();
    return u === "#" || /^https:\/\/[^\s]+$/i.test(u) || /^mailto:[^\s@]+@[^\s@]+$/i.test(u) ||
      (/^[A-Za-z0-9][A-Za-z0-9_\-.\/]*(#[\w-]*)?$/.test(u) && u.indexOf("..") < 0 && u.indexOf("//") < 0);
  }
  function str(v, max) { return typeof v === "string" ? v.trim().slice(0, max || 300) : ""; }
  // A hero photo address: one of the site's own pictures, or the project's public storage.
  function imgOk(u) {
    var base = (window.YNEPF_CONFIG && window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "");
    return /^assets\/img\/[A-Za-z0-9_\-.\/]+$/.test(u) || (!!base && String(u).indexOf(base + "/storage/v1/object/public/") === 0);
  }

  // The block as it should read now: the standard wording with the editor's changes on top.
  function merged(name) {
    var d = DEFAULTS[name], s = state.blocks[name];
    if (!s || typeof s !== "object") return d;
    var out = {};
    Object.keys(d).forEach(function (k) {
      if (k === "items") out.items = Array.isArray(s.items) ? s.items.slice(0, 8) : d.items;
      else out[k] = typeof s[k] === "string" ? s[k] : d[k];
    });
    return out;
  }

  function $(sel) { return document.querySelector(sel); }
  function setText(sel, text) { var e = $(sel); if (e && text != null) e.textContent = text; }
  function setLink(sel, label, url) { var e = $(sel); if (!e) return; if (label) e.textContent = label; if (urlOk(url)) e.setAttribute("href", url); }
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  // "The home of *drug tested* powerlifting" -> the starred words highlighted
  function highlighted(el, text) {
    el.textContent = "";
    String(text).split("*").forEach(function (part, i) {
      if (!part) return;
      if (i % 2) el.appendChild(node("em", "", part)); else el.appendChild(document.createTextNode(part));
    });
  }
  function svg(name) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.innerHTML = ICONS[name] || ICONS.link;   // our own fixed icon markup
    return s;
  }

  var RENDER = {
    hero: function (b) {
      var h = $("#hero-title"); if (h) highlighted(h, b.title);
      var a = document.querySelectorAll(".hero-actions a");
      if (a[0]) { a[0].textContent = b.primaryLabel; if (urlOk(b.primaryUrl)) a[0].setAttribute("href", b.primaryUrl); }
      if (a[1]) { a[1].textContent = b.secondaryLabel; if (urlOk(b.secondaryUrl)) a[1].setAttribute("href", b.secondaryUrl); }
    },
    events: function (b) { setText("#events-heading", b.heading); setText("#events-button", b.buttonLabel); },
    news: function (b) { setText("#news-heading", b.heading); setText("#news-button", b.buttonLabel); },
    cta: function (b) { setText("#cta-heading", b.heading); setText(".cta p", b.text); setLink(".cta .btn", b.buttonLabel, b.url); },
    resources: function (b) {
      setText("#resources-heading", b.heading);
      var ul = $(".resource-list"); if (!ul) return;
      ul.textContent = "";
      b.items.forEach(function (it) {
        var li = node("li"), box = node("div", "resource");
        var icon = node("span", "resource-icon " + (COLOUR_NAMES[it.colour] ? it.colour : "navy"));
        icon.setAttribute("aria-hidden", "true"); icon.appendChild(svg(it.icon));
        var h = node("h3"), a = node("a", "", str(it.title, 80));
        if (urlOk(it.url)) a.setAttribute("href", it.url);
        h.appendChild(a);
        var body = node("div"); body.appendChild(h); body.appendChild(node("p", "", str(it.text, 240)));
        box.appendChild(icon); box.appendChild(body); li.appendChild(box); ul.appendChild(li);
      });
    },
    cards: function (b) {
      setText("#tiles-heading", b.heading);
      var wrap = $(".tiles"); if (!wrap) return;
      wrap.textContent = "";
      wrap.setAttribute("data-count", String(b.items.length));
      b.items.forEach(function (it) {
        var art = node("article", "tile reveal" + (it.style === "inverse" ? " tile--inverse" : ""));
        var div = node("div"); div.appendChild(node("h3", "", str(it.title, 80))); div.appendChild(node("p", "", str(it.text, 200)));
        var a = node("a", "more", str(it.linkLabel, 60) || "Read more");
        if (urlOk(it.url)) a.setAttribute("href", it.url);
        art.appendChild(div); art.appendChild(a); wrap.appendChild(art);
      });
    }
  };

  // Apply one block. Blocks the editor has never changed are left exactly as the page's own HTML has them.
  function apply(name) {
    if (!RENDER[name] || !(state.blocks[name] || rendered[name])) return;
    RENDER[name](merged(name));
    rendered[name] = !!state.blocks[name];
  }
  function applyAll() { Object.keys(RENDER).forEach(apply); }

  // Fresh content from the database: { blocks: {name: {...}}, pool: [{url, small, alt}] | null }
  function update(data) {
    if (data.blocks) {         // left alone when the wording could not be fetched
      var blocks = {};
      Object.keys(DEFAULTS).forEach(function (n) { var v = data.blocks[n]; if (v && typeof v === "object") blocks[n] = v; });
      state.blocks = blocks;
    }
    if (data.pool) {           // likewise the photo pool
      var pool = data.pool.map(function (p) {
        return { url: str(p.url, 600), small: str(p.small, 600), alt: str(p.alt, 300) };
      }).filter(function (p) { return imgOk(p.url) && (!p.small || imgOk(p.small)); });
      state.pool = pool.length ? pool : null;
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ blocks: state.blocks, pool: state.pool })); } catch (e) { /* storage blocked */ }
    applyAll();   // a block that was customised on this page and is now back to standard is redrawn with the standard wording
  }

  // The hero photo: a random one from the pool, never the same one twice running on this device.
  function heroPhoto(figure) {
    var pool = state.pool && state.pool.length ? state.pool : POOL, i = Math.floor(Math.random() * pool.length), last = "";
    try { last = localStorage.getItem(LAST_KEY) || ""; } catch (e) { /* ignore */ }
    if (pool.length > 1 && pool[i].url === last) i = (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
    var p = pool[i];
    try { localStorage.setItem(LAST_KEY, p.url); } catch (e) { /* ignore */ }
    var img = document.createElement("img");
    img.src = p.url;
    if (p.small) img.srcset = p.small + " 640w, " + p.url + " 1000w";
    img.sizes = "(min-width: 64em) 520px, calc(100vw - 2rem)";
    img.alt = p.alt || ""; img.width = 1000; img.height = 1250;
    img.setAttribute("fetchpriority", "high");
    figure.appendChild(img);
  }

  window.YNEPF_HOME = { DEFAULTS: DEFAULTS, POOL: POOL, ICONS: ICONS, ICON_NAMES: ICON_NAMES, COLOUR_NAMES: COLOUR_NAMES,
    urlOk: urlOk, imgOk: imgOk, apply: apply, applyAll: applyAll, update: update, heroPhoto: heroPhoto, merged: merged };
})();
