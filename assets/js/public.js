/* ==========================================================================
   public.js — fills the public pages from the database.
   Each page has <body data-page="..."> and a container with a data-live
   attribute; this file picks the right renderer.
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF;
  var el = Y.el;

  function load(table, build) {
    var q = build(Y.db().from(table));
    return q.then(function (r) {
      if (r.error) throw r.error;
      return r.data || [];
    });
  }
  function fail(target, err) {
    if (window.console) console.error(err);
    Y.notice(target, "We could not load this just now. Please try again in a moment.", "error");
  }
  function fmtDate(iso) { return Y.longDate(iso); }

  // ---- Calendar -------------------------------------------------------------
  function upcomingAndPast() {
    return load("competitions_public", function (t) {
      return t.select("*").order("start_date", { ascending: true });
    }).then(function (rows) {
      return {
        upcoming: rows.filter(function (c) { return Y.compState(c) !== "archived"; }),
        past: rows.filter(function (c) { return Y.compState(c) === "archived"; }).reverse()
      };
    });
  }

  function group(rows, keyFn) {
    var order = [], map = {};
    rows.forEach(function (c) {
      var k = keyFn(c);
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(c);
    });
    return order.map(function (k) { return { key: k, rows: map[k] }; });
  }
  function cardList(rows, heading, opts) {
    return el("ul", { class: "event-list" }, rows.map(function (c) {
      return el("li", null, Y.competitionCard(c, Object.assign({ heading: heading }, opts || {})));
    }));
  }

  function calendar(root) {
    upcomingAndPast().then(function (r) {
      root.replaceChildren();

      // Upcoming: soonest first, under a year subheading when it spans years.
      root.appendChild(el("h2", { id: "upcoming-heading", style: "margin-top:0;" }, "Upcoming competitions"));
      if (!r.upcoming.length) {
        root.appendChild(el("p", null, "No competitions are scheduled right now. Check back soon."));
      } else {
        var years = group(r.upcoming, Y.yearOf);
        if (years.length === 1) root.appendChild(cardList(years[0].rows, "h3"));
        else years.forEach(function (g) {
          root.appendChild(el("h3", { class: "year-heading" }, g.key));
          root.appendChild(cardList(g.rows, "h4"));
        });
      }

      // Past: one year at a time, most recent year first.
      if (!r.past.length) return;
      var pastYears = group(r.past, Y.yearOf); // r.past is already newest first
      root.appendChild(el("h2", { id: "past" }, "Past competitions"));
      root.appendChild(el("p", null, "Choose a year. Where results are on OpenIPF, each competition links to them."));
      var buttons = {}, panels = {};
      var picker = el("div", { class: "year-picker", role: "group", "aria-labelledby": "past" });
      var wrap = el("div", { id: "past-panels" });
      function pick(year, fromUser) {
        pastYears.forEach(function (g) {
          var on = g.key === year;
          buttons[g.key].setAttribute("aria-pressed", String(on));
          panels[g.key].hidden = !on;
        });
        if (fromUser) { try { history.replaceState(null, "", "#past-" + year); } catch (e) { /* file:// */ } }
      }
      pastYears.forEach(function (g) {
        buttons[g.key] = el("button", { type: "button", class: "btn btn-secondary btn-sm", "aria-pressed": "false",
          onclick: function () { pick(g.key, true); } }, g.key + " (" + g.rows.length + ")");
        panels[g.key] = el("div", { id: "past-" + g.key, role: "region", "aria-label": "Competitions in " + g.key, hidden: true },
          cardList(g.rows, "h3", { noStatus: true }));
        picker.appendChild(buttons[g.key]);
        wrap.appendChild(panels[g.key]);
      });
      root.appendChild(picker);
      root.appendChild(wrap);
      var hash = (location.hash.match(/^#past-(\d{4})$/) || [])[1];
      pick(hash && panels[hash] ? hash : pastYears[0].key, false);
      if (hash && panels[hash]) document.getElementById("past").scrollIntoView();
    }).catch(function (e) { fail(root, e); });
  }

  // ---- Competition page with its lifting order ----------------------------------
  function classWeight(cls) {
    var m = /(\d+(?:\.\d+)?)(\+)?\s*$/.exec(cls || "");
    if (!m) return Infinity;
    return parseFloat(m[1]) + (m[2] ? 0.5 : 0);
  }
  function fmtGlp(v) {
    return v == null ? "" : Number(v).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }
  // Columns appear only if the sheet has something in them, so a worlds-style sheet
  // (best total, GLP) and a simpler one both come out sensibly.
  var LO_TABLE = [
    { key: "name", label: "Name" }, { key: "club", label: "Club" }, { key: "instagram", label: "Instagram" },
    { key: "age", label: "Age" }, { key: "cls", label: "Class" }, { key: "bestTotal", label: "Best total" }, { key: "glp", label: "GLP" }
  ];
  function loCell(col, l) {
    if (col === "name") {
      return el("th", { scope: "row" }, l.openIpf ? el("a", { href: l.openIpf, target: "_blank", rel: "noopener",
        "aria-label": l.name + " on OpenIPF (opens in a new tab)" }, l.name) : l.name);
    }
    if (col === "instagram") {
      return el("td", null, l.instagram ? el("a", { class: "lo-ig", href: "https://www.instagram.com/" + encodeURIComponent(l.instagram) + "/",
        target: "_blank", rel: "noopener", "aria-label": l.name + " on Instagram (opens in a new tab)" }, "@" + l.instagram) : "");
    }
    return el("td", null, col === "glp" ? fmtGlp(l.glp) : l[col]);
  }
  function renderLiftingOrder(host, c, lifters) {
    var cols = LO_TABLE.filter(function (col) {
      return col.key === "name" || lifters.some(function (l) { return col.key === "glp" ? l.glp != null : !!l[col.key]; });
    });
    var days = {};
    lifters.forEach(function (l) {
      var d = days[l.day] = days[l.day] || {};
      var s = d[l.session] = d[l.session] || { name: "", weighIn: "", liftOff: "", flights: {} };
      s.name = s.name || l.sessionName; s.weighIn = s.weighIn || l.weighIn; s.liftOff = s.liftOff || l.liftOff;
      (s.flights[l.flight] = s.flights[l.flight] || []).push(l);
    });
    var num = function (a, b) { return a - b; };
    host.replaceChildren();
    Object.keys(days).map(Number).sort(num).forEach(function (day) {
      var sec = el("section", { class: "lo-day", "aria-labelledby": "lo-day-" + day },
        el("h2", { id: "lo-day-" + day }, "Day " + day + ": " + Y.longDay(Y.addDays(c.start_date, day - 1))));
      Object.keys(days[day]).map(Number).sort(num).forEach(function (sn) {
        var s = days[day][sn];
        var prime = /^prime time$/i.test(s.name);
        var times = [s.weighIn && ["Weigh-in ", el("strong", null, s.weighIn)], s.liftOff && ["Lift off ", el("strong", null, s.liftOff)]].filter(Boolean);
        var block = el("div", { class: "lo-session" },
          el("h3", null, s.name || "Session " + sn),
          times.length ? el("p", { class: "lo-times" }, times[0], times[1] ? [" · ", times[1]] : null) : null);
        Object.keys(s.flights).sort().forEach(function (f) {
          var rows = s.flights[f].slice();
          if (!prime) rows.sort(function (a, b) {
            return (classWeight(a.cls) - classWeight(b.cls)) || ((b.glp == null ? -Infinity : b.glp) - (a.glp == null ? -Infinity : a.glp));
          });
          block.appendChild(el("div", { class: "lo-flight" },
            el("p", { class: "lo-flight-label" }, "Flight " + f),
            el("div", { class: "table-wrap" }, el("table", { class: "data lifters" },
              el("caption", { class: "visually-hidden" }, "Flight " + f + " lifting order"),
              el("thead", null, el("tr", null, cols.map(function (col) { return el("th", { scope: "col" }, col.label); }))),
              el("tbody", null, rows.map(function (l) { return el("tr", null, cols.map(function (col) { return loCell(col.key, l); })); }))))));
        });
        sec.appendChild(block);
      });
      host.appendChild(sec);
    });
  }

  // The lifting order page: the competition's name, then its order from the sheet.
  function lifting(root) {
    var base = document.body.getAttribute("data-root") || "";
    var title = document.getElementById("lo-title"), sub = document.getElementById("lo-sub");
    var params = new URLSearchParams(location.search);
    var key = params.get("c") || (location.pathname.match(/\/lifting-order\/([^/]+)\/?$/) || [])[1];
    key = key ? decodeURIComponent(key) : "";
    var missing = function () {
      document.title = "Lifting order not found — YNEPF";
      title.textContent = "Lifting order not found";
      root.replaceChildren(el("p", null, "We could not find that competition."),
        el("p", null, el("a", { href: base + "calendar.html" }, "Back to the competition calendar")));
    };
    if (!key) return missing();
    var isId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(key);
    load("competitions_public", function (t) { return t.select("*").eq(isId ? "id" : "slug", key).limit(1); }).then(function (rows) {
      if (!rows.length) return missing();
      var c = rows[0];
      document.title = c.name + " lifting order — YNEPF";
      title.textContent = c.name;
      var map = Y.mapsUrl(c);
      sub.replaceChildren(el("span", null, Y.dateRange(c.start_date, c.end_date),
        c.venue_name ? [" · ", map ? el("a", { href: map, target: "_blank", rel: "noopener" }, c.venue_name) : c.venue_name] : null,
        " · ", el("a", { href: base + "calendar.html" }, "All competitions")));
      if (!c.lifting_order_url) {
        root.replaceChildren(el("p", null, "The lifting order will appear here once it has been published. We usually share it a few days after entries open."));
        return;
      }
      Y.loadSheet(c.lifting_order_url).then(function (sheet) {
        var parsed = Y.parseLiftingOrder(sheet);
        if (!parsed.lifters.length) { root.replaceChildren(el("p", null, "The lifting order is not ready yet. Check back soon.")); return; }
        renderLiftingOrder(root, c, parsed.lifters);
      }).catch(function (e) {
        if (window.console) console.error(e);
        root.replaceChildren(el("p", null, "We could not load the lifting order just now. Please try again in a moment."));
      });
    }).catch(function (e) { fail(root, e); });
  }

  // ---- Home: next events + latest news ---------------------------------------
  function home() {
    var ev = document.getElementById("home-events");
    var nw = document.getElementById("home-news");
    if (ev) {
      upcomingAndPast().then(function (r) {
        var next = r.upcoming.slice(0, 4);
        ev.replaceChildren();
        if (!next.length) {
          ev.appendChild(el("li", null, el("p", null, "No competitions are scheduled right now. Check our ",
            el("a", { href: "calendar.html" }, "calendar"), " for the latest.")));
          return;
        }
        next.forEach(function (c) {
          var card = Y.competitionCard(c, { heading: "h3", link: "calendar.html", brief: true });
          card.appendChild(el("a", { class: "event-chevron", href: "calendar.html", "aria-label": "View " + c.name },
            Y.svg(Y.ICONS.chevron)));
          ev.appendChild(el("li", null, card));
        });
      }).catch(function (e) { fail(ev, e); });
    }
    if (nw) {
      load("posts", function (t) {
        return t.select("title,slug,body_md,post_date,author_name").order("post_date", { ascending: false }).limit(3);
      }).then(function (posts) {
        nw.replaceChildren();
        if (!posts.length) { nw.appendChild(el("li", null, el("p", null, "No news yet."))); return; }
        posts.forEach(function (p) { nw.appendChild(newsItem(p, "h3")); });
      }).catch(function (e) { fail(nw, e); });
    }
  }

  // ---- News -----------------------------------------------------------------
  function postHref(p) { return "post.html?p=" + encodeURIComponent(p.slug); }
  function newsItem(p, H) {
    return el("li", { class: "news-item" },
      el(H || "h2", null, el("a", { href: postHref(p) }, p.title)),
      el("p", { class: "post-meta" }, el("time", { datetime: p.post_date }, fmtDate(p.post_date)),
        p.author_name ? " · " + p.author_name : ""),
      el("p", null, Y.excerpt(p.body_md, 200)));
  }

  function news(root) {
    var PAGE = 10, shown = 0;
    var list = el("ul", { class: "news-list" });
    var more = el("button", { class: "btn btn-secondary", type: "button", hidden: true }, "Show older posts");
    root.replaceChildren(list, el("p", null, more));

    function fetchPage() {
      more.disabled = true;
      load("posts", function (t) {
        return t.select("title,slug,body_md,post_date,author_name")
          .order("post_date", { ascending: false }).range(shown, shown + PAGE);
      }).then(function (rows) {
        var hasMore = rows.length > PAGE;
        rows.slice(0, PAGE).forEach(function (p) { list.appendChild(newsItem(p, "h2")); });
        shown += Math.min(rows.length, PAGE);
        more.hidden = !hasMore;
        more.disabled = false;
        if (!shown) root.replaceChildren(el("p", null, "No news yet. Check back soon."));
      }).catch(function (e) { fail(root, e); });
    }
    more.addEventListener("click", fetchPage);
    fetchPage();
  }

  function post(root) {
    var slug = new URLSearchParams(location.search).get("p");
    var missing = function () {
      document.title = "Post not found — YNEPF";
      root.replaceChildren(el("h1", null, "Post not found"),
        el("p", null, "That post does not exist, or has not been published yet."),
        el("p", null, el("a", { href: "news.html" }, "Back to all news")));
    };
    if (!slug) return missing();
    load("posts", function (t) { return t.select("*").eq("slug", slug).limit(1); })
      .then(function (rows) {
        if (!rows.length) return missing();
        var p = rows[0];
        document.title = p.title + " — YNEPF";
        var body = Y.markdown(p.body_md);
        body.className = "md article-body";
        root.replaceChildren(
          el("p", { class: "back" }, el("a", { href: "news.html" }, "All news")),
          el("h1", null, p.title),
          el("p", { class: "post-meta" }, el("time", { datetime: p.post_date }, fmtDate(p.post_date)),
            p.author_name ? " · By " + p.author_name : ""),
          body);
      }).catch(function (e) { fail(root, e); });
  }

  // ---- Committee ------------------------------------------------------------
  function igLink(handle, name) {
    return el("a", { class: "p-social", href: "https://www.instagram.com/" + encodeURIComponent(handle) + "/",
      "aria-label": name + " on Instagram", target: "_blank", rel: "noopener" }, Y.svg(Y.ICONS.instagram));
  }
  function committee(root) {
    Promise.all([
      load("org_sections", function (t) { return t.select("*").order("sort_order"); }),
      load("people", function (t) { return t.select("*").order("sort_order"); })
    ]).then(function (res) {
      root.replaceChildren();
      res[0].forEach(function (s, i) {
        var people = res[1].filter(function (p) { return p.section_id === s.id; });
        root.appendChild(el("h2", i === 0 ? { style: "margin-top:0;" } : null, s.title));
        if (s.description) root.appendChild(el("p", { class: "lede" }, s.description));
        root.appendChild(el("ul", { class: "carousel carousel-bleed", role: "list" },
          people.map(function (p) {
            return el("li", { class: "person-card" },
              el("img", { class: "photo", src: "assets/img/person-placeholder.png", alt: "", width: "240", height: "296" }),
              el("div", { class: "p-head" }, el("p", { class: "p-name" }, p.name), p.role ? el("p", { class: "p-role" }, p.role) : null),
              p.blurb ? el("p", { class: "p-blurb" }, p.blurb) : null,
              p.instagram ? igLink(p.instagram, p.name) : null);
          })));
      });
      if (!res[0].length) root.appendChild(el("p", null, "Nobody is listed yet."));
    }).catch(function (e) { fail(root, e); });
  }

  // ---- FAQs -----------------------------------------------------------------
  function faqs(root) {
    Promise.all([
      load("faq_categories", function (t) { return t.select("*").order("sort_order"); }),
      load("faqs", function (t) { return t.select("*").order("sort_order"); })
    ]).then(function (res) {
      root.replaceChildren();
      res[0].forEach(function (c) {
        var items = res[1].filter(function (f) { return f.category_id === c.id; });
        if (!items.length) return;
        root.appendChild(el("h2", null, c.title));
        root.appendChild(el("div", { class: "faq" }, items.map(function (f) {
          var body = Y.markdown(f.answer_md);
          body.className = "faq-body md";
          return el("details", null, el("summary", null, f.question), body);
        })));
      });
      if (!root.children.length) root.appendChild(el("p", null, "No FAQs yet."));
    }).catch(function (e) { fail(root, e); });
  }

  // ---- Records ----------------------------------------------------------------
  function slug(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function records(root) {
    load("record_sources", function (t) { return t.select("*").order("sort_order"); }).then(function (sources) {
      sources = sources.filter(function (s) { return s.url; });
      root.replaceChildren();
      if (!sources.length) { root.appendChild(el("p", null, "Records are not available yet. Check back soon.")); return; }

      var search = el("input", { type: "search", id: "rec-search", autocomplete: "off", placeholder: "Name, weight class, lift..." });
      var status = el("p", { class: "visually-hidden", role: "status" });
      root.appendChild(el("div", { class: "rec-tools" },
        el("label", { for: "rec-search" }, "Search all records"), search, status));
      root.appendChild(el("ul", { class: "rec-jump" }, sources.map(function (s) {
        return el("li", null, el("a", { href: "#" + slug(s.title) }, s.title));
      })));

      var sections = sources.map(function (s) {
        var body = el("div", null, el("p", null, "Loading…"));
        var sec = el("section", { class: "rec-section", id: slug(s.title), "aria-labelledby": "h-" + slug(s.title) },
          el("h2", { id: "h-" + slug(s.title) }, s.title), body);
        root.appendChild(sec);
        var state = { rows: [], body: body };
        Y.loadSheet(s.url).then(function (sheet) {
          if (!sheet.header.length) { body.replaceChildren(el("p", null, "No records in this sheet yet.")); return; }
          var tbody = el("tbody", null, sheet.rows.map(function (r) {
            var tr = el("tr", null, r.map(function (c, i) { return el(i === 0 ? "th" : "td", i === 0 ? { scope: "row" } : null, c); }));
            state.rows.push({ tr: tr, text: r.join(" ").toLowerCase() });
            return tr;
          }));
          var empty = el("p", { hidden: true }, "No records match your search.");
          state.empty = empty;
          body.replaceChildren(
            el("div", { class: "table-wrap" }, el("table", { class: "data records" },
              el("caption", { class: "visually-hidden" }, s.title + " records"),
              el("thead", null, el("tr", null, sheet.header.map(function (h) { return el("th", { scope: "col" }, h); }))),
              tbody)),
            empty);
        }).catch(function (e) {
          if (window.console) console.error(e);
          body.replaceChildren(el("p", null, "We could not load these records just now. ",
            el("a", { href: s.url, target: "_blank", rel: "noopener" }, "Open the sheet directly"), "."));
        });
        return { sec: sec, state: state };
      });

      search.addEventListener("input", function () {
        var q = search.value.trim().toLowerCase(), shown = 0;
        sections.forEach(function (x) {
          var n = 0;
          x.state.rows.forEach(function (r) { var hit = !q || r.text.indexOf(q) >= 0; r.tr.hidden = !hit; if (hit) n++; });
          if (x.state.empty) x.state.empty.hidden = n > 0 || !x.state.rows.length;
          shown += n;
        });
        status.textContent = q ? shown + " matching record" + (shown === 1 ? "" : "s") : "";
      });
    }).catch(function (e) { fail(root, e); });
  }

  // ---- Boot -----------------------------------------------------------------
  var routes = { calendar: calendar, committee: committee, news: news, post: post, faqs: faqs, records: records, lifting: lifting };
  function boot() {
    var page = document.body.getAttribute("data-view") || document.body.getAttribute("data-page");
    var root = document.getElementById("live");
    var hosts = [root, document.getElementById("home-events"), document.getElementById("home-news")]
      .filter(Boolean);
    if (!hosts.length) return;
    if (!Y.db()) { hosts.forEach(function (h) { Y.guard(h); }); return; }
    if (page === "home") home();
    else if (routes[page] && root) routes[page](root);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
