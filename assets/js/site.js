/* ==========================================================================
   site.js — shared helpers for every page that reads from the database.
   Exposes window.YNEPF. Needs (in this order): vendor/supabase.js,
   vendor/marked.min.js, vendor/purify.min.js, config.js
   ========================================================================== */
(function () {
  "use strict";

  var TZ = "Europe/London"; // GMT in winter, BST in summer
  var cfg = window.YNEPF_CONFIG || {};
  var client = null;

  function configured() {
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  }

  function db() {
    if (!client && configured()) {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  // ---- DOM ----------------------------------------------------------------
  // el("div", {class: "x", onclick: fn}, child, "text", ...) -> Element
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === false || v === null || v === undefined) return;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v; // only ever called with sanitised HTML
        else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(node, c); });
    else node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }
  function svg(path) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = path;
    return s;
  }
  var ICONS = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    pin: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/>',
    people: '<circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="2"/><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    chevron: '<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/>'
  };

  // ---- Markdown (always sanitised) -----------------------------------------
  function markdown(md) {
    var html = window.marked.parse(md || "", { gfm: true, breaks: false });
    var tmp = document.createElement("div");
    tmp.innerHTML = window.DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
    Array.prototype.forEach.call(tmp.querySelectorAll("table"), function (t) {
      t.classList.add("data");
      var wrap = document.createElement("div");
      wrap.className = "table-wrap";
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
    Array.prototype.forEach.call(tmp.querySelectorAll("a[href]"), function (a) {
      if (/^https?:/i.test(a.getAttribute("href")) && a.hostname !== location.hostname) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener");
      }
    });
    return tmp;
  }
  // Plain-text excerpt from markdown, for list pages.
  function excerpt(md, max) {
    var t = (md || "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/[#>*_`|~-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    max = max || 180;
    return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + "…" : t;
  }

  // ---- UK time -------------------------------------------------------------
  function parts(date, opts) {
    var out = {};
    new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: TZ, hourCycle: "h23" }, opts))
      .formatToParts(date).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  // Date -> "YYYY-MM-DDTHH:mm" as UK wall-clock time (for <input type=datetime-local>)
  function toLondonInput(iso) {
    if (!iso) return "";
    var p = parts(new Date(iso), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  // "YYYY-MM-DDTHH:mm" read as UK wall-clock time -> ISO instant (handles GMT/BST)
  function fromLondonInput(local) {
    if (!local) return null;
    var m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    var asUTC = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var guess = asUTC;
    for (var i = 0; i < 3; i++) {
      var p = parts(new Date(guess), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      var shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
      guess += asUTC - shown;
    }
    return new Date(guess).toISOString();
  }
  function todayLondon() {
    var p = parts(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" });
    return p.year + "-" + p.month + "-" + p.day;
  }
  function addDays(ymd, n) {
    var d = new Date(ymd + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dmy(ymd) { var a = ymd.split("-"); return { y: +a[0], m: +a[1] - 1, d: +a[2] }; }
  function dateRange(start, end) {
    var s = dmy(start);
    if (!end || end === start) return s.d + " " + MONTHS[s.m] + " " + s.y;
    var e = dmy(end);
    if (s.m === e.m && s.y === e.y) return s.d + "–" + e.d + " " + MONTHS[s.m] + " " + s.y;
    return s.d + " " + MONTHS[s.m] + (s.y !== e.y ? " " + s.y : "") + " – " + e.d + " " + MONTHS[e.m] + " " + e.y;
  }
  function clock(date) {
    var p = parts(date, { hour: "numeric", minute: "2-digit" });
    var h = +p.hour, mi = p.minute;
    if (h === 12 && mi === "00") return "noon";
    if (h === 0 && mi === "00") return "midnight";
    var ap = h >= 12 ? "pm" : "am";
    var h12 = h % 12 || 12;
    return h12 + (mi === "00" ? "" : ":" + mi) + ap;
  }
  function dayMonth(date, withYear) {
    var p = parts(date, { day: "numeric", month: "short", year: "numeric" });
    return +p.day + " " + p.month + (withYear ? " " + p.year : "");
  }
  function longDate(iso) {
    var p = parts(new Date(iso), { day: "numeric", month: "long", year: "numeric" });
    return +p.day + " " + p.month + " " + p.year;
  }

  // ---- Competitions --------------------------------------------------------
  // state: "archived" | "closed" | "open" | "soon" | "none"
  function compState(c, now) {
    now = now || new Date();
    var last = c.end_date || c.start_date;
    if (last < todayLondon()) return "archived";
    var opens = c.entry_opens ? new Date(c.entry_opens) : null;
    var closes = c.entry_closes ? new Date(c.entry_closes) : null;
    if (c.entry_manually_closed) return "closed";
    if (closes && now >= closes) return "closed";
    if (opens && now < opens) return "soon";
    if (opens || closes || c.entry_url) return "open";
    return "none";
  }
  function entryLine(c) {
    var o = c.entry_opens ? new Date(c.entry_opens) : null;
    var cl = c.entry_closes ? new Date(c.entry_closes) : null;
    var yearOf = c.start_date.slice(0, 4);
    if (o && cl) {
      var oy = parts(o, { year: "numeric" }).year, cy = parts(cl, { year: "numeric" }).year;
      return "Entry opens " + dayMonth(o, oy !== yearOf) + " at " + clock(o) +
        " and closes " + dayMonth(cl, cy !== oy) + " at " + clock(cl);
    }
    if (o) return "Entry opens " + dayMonth(o, true) + " at " + clock(o);
    if (cl) return "Entry closes " + dayMonth(cl, true) + " at " + clock(cl);
    return "";
  }
  function mapsUrl(c) {
    if (c.map_url) return c.map_url;
    var q = [c.venue_name, c.venue_address].filter(Boolean).join(", ");
    return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "";
  }
  var STATE_TAG = {
    open: ["tag tag-open", "Entry open"],
    closed: ["tag tag-closed", "Entry closed"],
    soon: ["tag tag-closed", "Entry not open yet"]
  };

  // Renders one competition as the existing <article class="event"> markup.
  function competitionCard(c, opts) {
    opts = opts || {};
    var state = compState(c);
    var H = opts.heading || "h2";
    var title = opts.link ? el("a", { href: opts.link }, c.name) : c.name;
    var tags = [];
    if (c.label) tags.push(el("span", { class: "tag tag-position" }, c.label));
    if (STATE_TAG[state] && !opts.noStatus) tags.push(el("span", { class: STATE_TAG[state][0] }, STATE_TAG[state][1]));

    var meta = el("div", { class: "event-meta" },
      el("span", null, svg(ICONS.calendar), dateRange(c.start_date, c.end_date)));
    var map = mapsUrl(c);
    if (c.venue_name) {
      meta.appendChild(el("span", null, svg(ICONS.pin),
        map ? el("a", { href: map, target: "_blank", rel: "noopener", "aria-label": c.venue_name + " on Google Maps (opens in a new tab)" }, c.venue_name) : c.venue_name));
    }
    if (c.capacity) meta.appendChild(el("span", null, svg(ICONS.people), c.capacity + " lifters"));

    var card = el("article", { class: "event" },
      el("div", { class: "event-head" }, el(H, null, title), tags));
    if (c.description) {
      if (opts.brief) {
        card.appendChild(el("p", { class: "event-desc" }, excerpt(c.description, 160)));
      } else {
        var d = markdown(c.description);
        d.className = "event-desc md";
        card.appendChild(d);
      }
    }
    if (!opts.brief) {
      var line = state === "archived" ? "" : entryLine(c);
      if (line) card.appendChild(el("ul", { style: "margin-top:var(--space-2);" }, el("li", null, line)));
      if (c.entry_url && state === "open") {
        card.appendChild(el("p", { style: "margin:var(--space-3) 0 0;" },
          el("a", { class: "btn btn-primary", href: c.entry_url, target: "_blank", rel: "noopener" }, "Enter this competition")));
      }
    }
    card.appendChild(meta);
    return card;
  }

  // ---- Page status helpers --------------------------------------------------
  function notice(target, message, kind) {
    target.replaceChildren(el("div", { class: "callout", role: kind === "error" ? "alert" : "status" },
      el("p", { class: "callout-title" }, kind === "error" ? "Something went wrong" : "Nothing to show yet"),
      el("p", { style: "margin:0;" }, message)));
  }
  function guard(target) {
    if (db()) return true;
    notice(target, "This page loads its content from our database, which has not been connected yet.", "error");
    return false;
  }

  window.YNEPF = {
    TZ: TZ, db: db, configured: configured, el: el, svg: svg, ICONS: ICONS,
    markdown: markdown, excerpt: excerpt,
    toLondonInput: toLondonInput, fromLondonInput: fromLondonInput,
    todayLondon: todayLondon, addDays: addDays, dateRange: dateRange, longDate: longDate,
    compState: compState, entryLine: entryLine, mapsUrl: mapsUrl, competitionCard: competitionCard,
    notice: notice, guard: guard
  };
})();
