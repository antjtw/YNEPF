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
      // Which competitions have entries to look at (names only, from the public entries list). Quietly skipped if
      // that list is not there.
      var db = Y.db();
      return db.from("entries_public").select("competition_id").then(function (r) {
        var have = {};
        (r.data || []).forEach(function (e) { have[e.competition_id] = true; });
        rows.forEach(function (c) { c.has_entries = !!have[c.id]; });
        return rows;
      }, function () { return rows; });
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

  // A past competition is deliberately plain: name, date, venue and a results link.
  function pastItem(c) {
    return el("li", { class: "past-item" },
      el("div", { class: "past-main" },
        el("h3", { class: "past-title" }, c.name, c.kind === "event" ? [" ", el("span", { class: "tag tag-event" }, "Event")] : null),
        el("p", { class: "past-meta" }, Y.dateRange(c.start_date, c.end_date) + (Y.timeRange(c) ? ", " + Y.timeRange(c) : ""), c.venue_name ? " · " + c.venue_name : "")),
      c.openipf_url ? el("a", { class: "btn btn-ghost btn-sm past-results", href: c.openipf_url, target: "_blank", rel: "noopener",
        "aria-label": "View results on OpenIPF for " + c.name + " (opens in a new tab)" }, "View results on OpenIPF ", Y.extIcon()) : null);
  }

  function calendar(root) {
    upcomingAndPast().then(function (r) {
      root.replaceChildren();

      // ---- Upcoming: soonest first, under a year subheading when it spans years.
      var up = el("div", { id: "panel-upcoming", role: "tabpanel", "aria-labelledby": "tab-upcoming", tabindex: "0" },
        el("h2", { class: "visually-hidden" }, "Upcoming competitions"));
      if (!r.upcoming.length) {
        up.appendChild(el("p", null, "Nothing is scheduled right now. Check back soon."));
      } else {
        var years = group(r.upcoming, Y.yearOf);
        if (years.length === 1) up.appendChild(cardList(years[0].rows, "h3"));
        else years.forEach(function (g) {
          up.appendChild(el("h3", { class: "year-heading" }, g.key));
          up.appendChild(cardList(g.rows, "h4"));
        });
      }

      // ---- Past: a row of years (newest first); inside a year, January to December.
      var past = el("div", { id: "panel-past", role: "tabpanel", "aria-labelledby": "tab-past", tabindex: "0", hidden: true },
        el("h2", { class: "visually-hidden" }, "Past competitions"));
      var pastPanels = {}, pastButtons = {};
      var pastYears = group(r.past.slice().sort(function (a, b) {
        return a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0;
      }), Y.yearOf).sort(function (a, b) { return b.key.localeCompare(a.key); });
      function pickYear(year, fromUser) {
        pastYears.forEach(function (g) {
          var on = g.key === year;
          pastButtons[g.key].setAttribute("aria-pressed", String(on));
          pastPanels[g.key].hidden = !on;
        });
        if (fromUser) { try { history.replaceState(null, "", "#past-" + year); } catch (e) { /* file:// */ } }
      }
      if (!pastYears.length) {
        past.appendChild(el("p", null, "No past competitions yet."));
      } else {
        var picker = el("div", { class: "year-picker", role: "group", "aria-label": "Choose a year" });
        pastYears.forEach(function (g) {
          pastButtons[g.key] = el("button", { type: "button", "aria-pressed": "false",
            onclick: function () { pickYear(g.key, true); } }, g.key);
          pastPanels[g.key] = el("div", { id: "past-" + g.key, role: "region", "aria-label": "Competitions in " + g.key, hidden: true },
            el("ul", { class: "past-list" }, g.rows.map(pastItem)));
          picker.appendChild(pastButtons[g.key]);
        });
        past.appendChild(picker);
        pastYears.forEach(function (g) { past.appendChild(pastPanels[g.key]); });
        pickYear(pastYears[0].key, false);
      }

      // ---- Tabs (WAI-ARIA tabs pattern: arrows, Home and End; deep links #upcoming, #past, #past-2025)
      var defs = [{ id: "upcoming", label: "Upcoming competitions", panel: up }, { id: "past", label: "Past competitions", panel: past }];
      var tabEls = {};
      var tablist = el("div", { class: "tablist", role: "tablist", "aria-label": "Competitions" });
      function select(id, opts) {
        opts = opts || {};
        defs.forEach(function (d) {
          var on = d.id === id;
          tabEls[d.id].setAttribute("aria-selected", String(on));
          tabEls[d.id].tabIndex = on ? 0 : -1;
          d.panel.hidden = !on;
        });
        if (opts.focus) tabEls[id].focus();
        if (opts.fromUser) { try { history.replaceState(null, "", "#" + id); } catch (e) { /* file:// */ } }
      }
      defs.forEach(function (d, i) {
        var t = el("button", { type: "button", role: "tab", id: "tab-" + d.id, "aria-controls": "panel-" + d.id,
          "aria-selected": "false", tabindex: "-1", onclick: function () { select(d.id, { fromUser: true }); },
          onkeydown: function (e) {
            var n = e.key === "ArrowRight" ? (i + 1) % defs.length : e.key === "ArrowLeft" ? (i + defs.length - 1) % defs.length
              : e.key === "Home" ? 0 : e.key === "End" ? defs.length - 1 : -1;
            if (n < 0) return;
            e.preventDefault();
            select(defs[n].id, { focus: true, fromUser: true });
          } }, d.label);
        tabEls[d.id] = t;
        tablist.appendChild(t);
      });
      root.appendChild(el("div", { class: "tabs", style: "margin-top:0;" }, tablist, up, past));

      function fromHash() {
        var m = location.hash.match(/^#(upcoming|past)(?:-(\d{4}))?$/);
        select(m ? m[1] : "upcoming");
        if (m && m[1] === "past" && m[2] && pastPanels[m[2]]) pickYear(m[2], false);
      }
      fromHash();
      window.addEventListener("hashchange", fromHash);
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
    { key: "name", label: "Name" }, { key: "club", label: "Club" }, { key: "ageClass", label: "Age class" }, { key: "cls", label: "Class" },
    { key: "glp", label: "GLP" }, { key: "total", label: "Total (kg)" }
  ];
  // The name cell carries everything about the person: the name (a link to their
  // OpenIPF profile when they have one), an Instagram icon when the handle is valid,
  // and their club underneath when there is one.
  function loCell(col, l) {
    if (col === "name") {
      var top = el("span", { class: "lo-person" },
        l.openIpf ? el("a", { href: l.openIpf, target: "_blank", rel: "noopener", class: "lo-name",
          "aria-label": l.name + " on OpenIPF (opens in a new tab)" }, l.name) : el("span", { class: "lo-name" }, l.name));
      if (l.instagram) {
        top.appendChild(el("a", { class: "lo-ig", href: "https://www.instagram.com/" + encodeURIComponent(l.instagram) + "/",
          target: "_blank", rel: "noopener", "aria-label": l.name + " on Instagram (opens in a new tab)" }, Y.svg(Y.ICONS.instagram)));
      }
      return el("th", { scope: "row", class: "c-name" }, top);
    }
    return el("td", { class: "c-" + col, "data-label": { club: "Club", ageClass: "Age", cls: "Class", glp: "GLP", total: "Total" }[col] || "" }, col === "glp" ? fmtGlp(l.glp) : l[col]);
  }
  function renderLiftingOrder(host, c, lifters) {
    var cols = LO_TABLE.filter(function (col) {
      if (col.key === "name") return true;
      if (col.key === "ageClass") return lifters.some(function (l) { return l.ageClass !== "Open"; });   // all blank = everyone is Open
      return lifters.some(function (l) { return col.key === "glp" ? l.glp != null : !!l[col.key]; });
    });
    var days = {};
    lifters.forEach(function (l) {
      var d = days[l.day] = days[l.day] || {};
      var s = d[l.session] = d[l.session] || { name: "", weighIn: "", liftOff: "", awards: "", flights: {} };
      s.name = s.name || l.sessionName; s.weighIn = s.weighIn || l.weighIn; s.liftOff = s.liftOff || l.liftOff; s.awards = s.awards || l.awards || "";
      (s.flights[l.flight] = s.flights[l.flight] || []).push(l);
    });
    var num = function (a, b) { return a - b; };
    host.replaceChildren();
    if (cols.some(function (col) { return col.key === "ageClass"; })) {
      host.appendChild(el("p", { class: "lo-key" }, el("strong", null, "Age class: "),
        "Open, SJ sub-junior, J junior, M1 to M4 masters 1 to 4."));
    }
    Object.keys(days).map(Number).sort(num).forEach(function (day) {
      var sec = el("section", { class: "lo-day", "aria-labelledby": "lo-day-" + day },
        el("h2", { id: "lo-day-" + day }, "Day " + day + ": " + Y.longDay(Y.addDays(c.start_date, day - 1))));
      Object.keys(days[day]).map(Number).sort(num).forEach(function (sn) {
        var s = days[day][sn];
        var prime = /^prime time$/i.test(s.name);
        var times = [s.weighIn && ["Weigh-in ", el("strong", null, s.weighIn)], s.liftOff && ["Lift off ", el("strong", null, s.liftOff)], s.awards && ["Awards ", el("strong", null, s.awards)]].filter(Boolean);
        var block = el("div", { class: "lo-session" },
          el("h3", null, s.name || "Session " + sn),
          times.length ? el("p", { class: "lo-times" }, times.map(function (t, i) { return i ? [" · ", t] : t; })) : null);
        Object.keys(s.flights).sort().forEach(function (f) {
          var rows = s.flights[f].slice();
          if (rows.every(function (l) { return l.position != null; })) rows.sort(function (a, b) { return a.position - b.position; });
          else if (!prime) rows.sort(function (a, b) {
            return (classWeight(a.cls) - classWeight(b.cls)) || ((b.glp == null ? -Infinity : b.glp) - (a.glp == null ? -Infinity : a.glp));
          });
          block.appendChild(el("div", { class: "lo-flight" },
            el("p", { class: "lo-flight-label" }, "Flight " + f),
            el("div", { class: "table-wrap" }, el("table", { class: "data lifters" },
              el("caption", { class: "visually-hidden" }, "Flight " + f + " lifting order"),
              el("thead", null, el("tr", null, cols.map(function (col) { return el("th", { scope: "col", class: "c-" + col.key }, col.label); }))),
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
    // Preview (?preview=1): the saved order even if it is not published, for a signed-in entries team member only (the database checks that).
    var preview = params.get("preview") === "1";
    if (preview) { var rb = document.createElement("meta"); rb.name = "robots"; rb.content = "noindex"; document.head.appendChild(rb); }
    // In preview, say exactly what is wrong instead of a general message.
    var why = function (e) {
      var m = String((e && e.message) || e || "");
      return /Could not find the function|schema cache|does not exist/i.test(m) ? "The preview function is not in the database yet. Run the latest all-in-one SQL in Supabase, then reload."
        : /forbidden/i.test(m) ? "You are signed in, but this account is not on the entries team." : "Preview problem: " + m;
    };
    var previewStop = function (e) {
      title.textContent = "Preview";
      Y.db().auth.getSession().then(function (g) {
        var u = g.data && g.data.session && g.data.session.user;
        root.replaceChildren(el("p", null, !u ? "You are not signed in on this web address. Sign in to the admin area at " + location.origin + "/admin first (signing in on a different address does not carry over), then reload this page."
          : e ? why(e) : "Signed in as " + u.email + ", but that competition could not be read. Check the address, and that this account can see the calendar."));
      });
    };
    var find = preview && Y.db() ? Y.db().from("competitions").select("*").eq(isId ? "id" : "slug", key).limit(1).then(function (r) { if (r.error) throw r.error; return r.data || []; })
      : load("competitions_public", function (t) { return t.select("*").eq(isId ? "id" : "slug", key).limit(1); });
    find.then(function (rows) {
      if (!rows.length) { if (preview) return previewStop(null); return missing(); }
      var c = rows[0];
      document.title = c.name + " lifting order — YNEPF";
      title.textContent = c.name;
      var map = Y.mapsUrl(c);
      sub.replaceChildren(el("span", null, Y.dateRange(c.start_date, c.end_date),
        c.venue_name ? [" · ", map ? el("a", { href: map, target: "_blank", rel: "noopener" }, c.venue_name) : c.venue_name] : null,
        " · ", el("a", { href: base + "calendar.html" }, "All competitions")));
      if (c.lifting_published || preview) {
        var hm = function (t) { return t ? new Intl.DateTimeFormat("en-GB", { timeZone: Y.TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t)) : ""; };
        var AGE = { SJ: "SJ", J: "J", M1: "M1", M2: "M2", M3: "M3", M4: "M4" };
        (preview ? Y.db().rpc("lifting_order_preview", { c: c.id }) : Y.db().from("lifting_order_public").select("*").eq("competition_id", c.id)).then(function (r) {
          if (r.error) throw r.error;
          var rows = (r.data || []).map(function (x) {
            var ig = Y.igHandle(x.instagram || "");
            return { day: x.day, session: x.session_no, flight: x.flight, position: x.position, name: x.name, openIpf: /^https:\/\//i.test(x.openipf_url || "") ? x.openipf_url : "", instagram: /^[A-Za-z0-9._]{1,30}$/.test(ig) ? ig : "",
              ageClass: AGE[x.age_category || ""] || "Open", ageClassKnown: true, cls: x.weight_class || "", club: x.club || "", total: x.best_total_kg == null || x.show_total === false ? "" : String(Number(x.best_total_kg)),
              glp: x.best_glp == null || x.show_glp === false ? null : Number(x.best_glp), weighIn: hm(x.weigh_in_at), liftOff: hm(x.lift_off_at), sessionName: x.is_prime_time ? "Prime time" : (x.session_name || ""), _as: x.published_as };
          });
          if (!rows.length) { root.replaceChildren(el("p", null, preview ? "Nothing is saved yet. Sort the entries and save the order first." : "The lifting order is not ready yet. Check back soon.")); return; }
          // times: lift-off as set; weigh-in two hours before and the finish estimated from the attempts, unless they were typed in
          var sess = {};
          (r.data || []).forEach(function (x) {
            var k = x.day + "-" + x.session_no, q = sess[k] = sess[k] || { liftOff: x.lift_off_at ? new Date(x.lift_off_at).getTime() : null, weighIn: x.weigh_in_at ? new Date(x.weigh_in_at).getTime() : null, awards: x.awards_at ? new Date(x.awards_at).getTime() : null, flights: {}, secs: x.seconds_per_attempt, defaultWeighIn: (function () { var d = window.LiftingSort && window.LiftingSort.DEFAULT_WEIGH_IN[x.session_no]; var iso = d && Y.fromLondonInput(Y.addDays(c.start_date, x.day - 1) + "T" + d); return iso ? new Date(iso).getTime() : null; })() };
            (q.flights[x.flight] = q.flights[x.flight] || { lifters: [] }).lifters.push({ event: x.event });
          });
          Object.keys(sess).forEach(function (k) { var q = sess[k]; q.flights = Object.keys(q.flights).map(function (f) { return q.flights[f]; }); q.t = window.LiftingSort ? window.LiftingSort.sessionTimes(q, q.secs) : { weighIn: q.weighIn, liftOff: q.liftOff, awards: q.awards }; });
          rows.forEach(function (l) { var q = sess[l.day + "-" + l.session]; if (q) { l.weighIn = hm(q.t.weighIn); l.liftOff = hm(q.t.liftOff); l.awards = hm(q.t.awards); } });
          renderLiftingOrder(root, c, rows);
          if (preview) root.insertBefore(el("div", { class: "callout", role: "status" }, el("p", { class: "callout-title" }, "Preview"), el("p", { style: "margin:0" }, "This is the saved draft. " + (c.lifting_published ? "It is published, so this is what everyone sees." : "It is not published, and only the entries team can see this page."))), root.firstChild);
          else root.insertBefore(el("p", { class: "lo-key" }, el("strong", null, rows[0]._as === "final" ? "Final" : "Provisional"), rows[0]._as === "final" ? " lifting order." : " lifting order. It may change before the competition."), root.firstChild);
        }).catch(function (e) { if (window.console) console.error(e); if (preview) return previewStop(e); root.replaceChildren(el("p", null, "We could not load the lifting order just now. Please try again in a moment.")); });
        return;
      }
      root.replaceChildren(el("p", null, "The lifting order will appear here once it has been published. We usually share it a few days after entries close."));
    }).catch(function (e) { if (preview) previewStop(e); else fail(root, e); });
  }

  // ---- Home: next events + latest news ---------------------------------------
  function home() {
    var ev = document.getElementById("home-events");
    var nw = document.getElementById("home-news");
    // The editable wording and the hero photo pool. home.js applies them and keeps a copy for the next visit.
    // If either table cannot be read (for example the schema has not been updated yet), the standard page stays.
    if (window.YNEPF_HOME && Y.db()) {
      var sb = Y.db();
      var tolerant = function (r) { return r.error ? null : (r.data || []); };
      Promise.all([
        sb.from("site_settings").select("key,value").like("key", "home.%").then(tolerant, function () { return null; }),
        sb.from("hero_images").select("url,small_url,alt,sort_order").eq("active", true).order("sort_order").then(tolerant, function () { return null; })
      ]).then(function (res) {
        var data = {};
        if (res[0]) {
          data.blocks = {};
          res[0].forEach(function (r) { try { data.blocks[r.key.slice(5)] = JSON.parse(r.value); } catch (e) { /* ignore a damaged row */ } });
        }
        if (res[1]) data.pool = res[1].map(function (p) { return { url: p.url, small: p.small_url, alt: p.alt }; });
        window.YNEPF_HOME.update(data);
      });
    }
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
  function initials(name) {
    var w = (name || "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
    return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase();
  }
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

  function committee(root) {
    Promise.all([
      load("org_sections", function (t) { return t.select("*").order("sort_order"); }),
      load("people", function (t) { return t.select("*").order("sort_order"); })
    ]).then(function (res) {
      root.replaceChildren();
      res[0].forEach(function (s, i) {
        var people = res[1].filter(function (p) { return p.section_id === s.id; });
        root.appendChild(el("h2", i === 0 ? { style: "margin-top:0;" } : null, s.title));
        if (s.description) root.appendChild(el("p", { class: "section-note" }, s.description));
        root.appendChild(el("ul", { class: "people-grid", role: "list" },
          people.map(function (p) {
            return el("li", { class: "person-card reveal" },
              el("span", { class: "avatar a" + (hash(p.name) % 5 + 1), "aria-hidden": "true" }, initials(p.name)),
              el("p", { class: "p-name" }, p.name),
              p.role ? el("p", { class: "p-role" }, p.role) : null,
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
      // Every category and every question gets an address you can link to, such as faqs#yne-worlds
      // (the category) or faqs#how-do-i-enter (one question, which opens when linked).
      var used = {};
      function anchorId(text) {
        var base = Y.anchorSlug(text) || "faq", id = base, n = 2;
        while (used[id] || document.getElementById(id)) id = base + "-" + n++;
        used[id] = true;
        return id;
      }
      res[0].forEach(function (c) {
        var items = res[1].filter(function (f) { return f.category_id === c.id; });
        if (!items.length) return;
        root.appendChild(el("h2", { id: anchorId(c.title) }, c.title));
        root.appendChild(el("div", { class: "faq" }, items.map(function (f) {
          var body = Y.markdown(f.answer_md);
          body.className = "faq-body md";
          return el("details", { id: anchorId(f.question) }, el("summary", null, f.question), body);
        })));
      });
      if (!root.children.length) root.appendChild(el("p", null, "No FAQs yet."));
      // The content arrives after the page has loaded, so jump to a linked heading or question ourselves.
      function toHash() {
        var id = decodeURIComponent(location.hash.slice(1)), t = id && document.getElementById(id);
        if (!t || !root.contains(t)) return;
        if (t.tagName === "DETAILS") t.open = true;
        t.scrollIntoView();
      }
      toHash();
      window.addEventListener("hashchange", toHash);
    }).catch(function (e) { fail(root, e); });
  }

  // ---- Records ----------------------------------------------------------------
  function slug(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  // One weight class as a grid: lifts down the side, age classes across the top. Each cell
  // is the weight (bold), the holder and the date. "Standard" means nobody has beaten it yet.
  function recordGrid(sectionId, sheetTitle, cls, state) {
    var id = sectionId + "-" + slug(cls.label);
    var thead = el("tr", null, el("th", { scope: "col" }, "Lift"),
      cls.ages.map(function (a) { return el("th", { scope: "col" }, a); }));
    var rows = cls.lifts.map(function (l) {
      var texts = [cls.label, l.label];
      var tds = cls.ages.map(function (a) {
        var c = l.cells[a];
        if (!c) return { td: el("td", { class: "rec-cell rec-none" }, el("span", { "aria-hidden": "true" }, "–"), el("span", { class: "visually-hidden" }, "No record")), text: "" };
        var text = [c.weight, c.holder, c.date].join(" ").toLowerCase();
        texts.push(text);
        var td = el("td", { class: "rec-cell" },
          c.weight ? el("strong", { class: "rec-w" }, c.weight) : null,
          c.standard ? el("span", { class: "rec-std" }, "Standard") : null,
          c.holder ? el("span", { class: "rec-n" }, c.holder) : null,
          c.date ? el("span", { class: "rec-d" }, c.date) : null);
        return { td: td, text: text };
      });
      var tr = el("tr", null, el("th", { scope: "row" }, l.label), tds.map(function (x) { return x.td; }));
      return { tr: tr, text: texts.join(" ").toLowerCase(), cells: tds };
    });
    var group = el("section", { class: "rec-class", id: id, "aria-labelledby": "h-" + id },
      el("h3", { id: "h-" + id }, cls.label),
      el("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-labelledby": "h-" + id },
        el("table", { class: "data records rec-grid" },
          el("caption", { class: "visually-hidden" }, sheetTitle + ", " + cls.label + " records"),
          el("thead", null, thead),
          el("tbody", null, rows.map(function (r) { return r.tr; })))));
    state.rows = state.rows.concat(rows);
    state.groups.push({ el: group, rows: rows });
    return { group: group, id: id };
  }

  function records(root) {
    // The submission form link is a setting; if settings cannot be read, fall back to the standard form.
    var setting = Y.db().from("site_settings").select("*").eq("key", "records_submit_url")
      .then(function (r) { return r.error ? null : (r.data || [])[0] || null; }, function () { return null; });
    Promise.all([load("record_sources", function (t) { return t.select("*").order("sort_order"); }), setting]).then(function (got) {
      var sources = got[0].filter(function (s) { return s.url; });
      var formUrl = got[1] ? (got[1].value || "").trim() : Y.RECORDS_FORM_DEFAULT;   // a saved blank hides the button
      root.replaceChildren();
      if (/^https:\/\//i.test(formUrl)) {
        root.appendChild(el("div", { class: "rec-submit" },
          el("div", null, el("p", { class: "rec-submit-title" }, "Set a new divisional record?"),
            el("p", { class: "rec-submit-text" }, "Send it to us with the record submission form.")),
          el("a", { class: "btn btn-primary", href: formUrl, target: "_blank", rel: "noopener",
            "aria-label": "Submit a record (opens in a new tab)" }, "Submit a record ", Y.extIcon())));
      }
      if (!sources.length) { root.appendChild(el("p", null, "Records are not available yet. Check back soon.")); return; }

      var search = el("input", { type: "search", id: "rec-search", autocomplete: "off", placeholder: "Name, weight class, lift..." });
      var status = el("p", { class: "visually-hidden", role: "status" });
      root.appendChild(el("div", { class: "rec-tools" },
        el("label", { for: "rec-search" }, "Search all records"), search, status));
      var tablist = el("div", { class: "tablist", role: "tablist", "aria-label": "Record tables" });
      var tabsWrap = el("div", { class: "tabs", style: "margin-top:0;" }, tablist,
        el("p", { class: "rec-note" }, "All weights are in kilograms. “Standard” means nobody has beaten the qualifying standard yet."));
      root.appendChild(tabsWrap);

      var onLoaded = function () {};   // set below: lets a link to a weight class wait for its sheet to arrive
      var sections = sources.map(function (s) {
        var body = el("div", null, el("p", null, "Loading…"));
        var sid = slug(s.title);
        var sec = el("section", { class: "rec-section", id: sid, role: "tabpanel", "aria-labelledby": "tab-" + sid, tabindex: "0", hidden: true },
          el("h2", { class: "visually-hidden" }, s.title), body);
        tabsWrap.appendChild(sec);
        var state = { rows: [], groups: [], body: body };
        Y.loadSheet(s.url).then(function (sheet) {
          if (!sheet.header.length) { body.replaceChildren(el("p", null, "No records in this sheet yet.")); return; }
          var parsed = Y.parseRecords(sheet.all);
          if (parsed) {
            // The sheet's own layout: one grid per weight class.
            var grids = parsed.classes.map(function (c) { return recordGrid(sid, s.title, c, state); });
            state.empty = el("p", { hidden: true }, "No records match your search.");
            var kids = [
              parsed.updated ? el("p", { class: "rec-updated" }, "Updated " + parsed.updated) : null,
              el("ul", { class: "rec-classes", "aria-label": s.title + " weight classes" }, grids.map(function (g, i) {
                return el("li", null, el("a", { href: "#" + g.id }, parsed.classes[i].label));
              }))
            ].concat(grids.map(function (g) { return g.group; }), [state.empty]).filter(Boolean);
            body.replaceChildren.apply(body, kids);
            onLoaded();
            return;
          }
          // Any other sheet: show it as a plain table, exactly as it is.
          var tbody = el("tbody", null, sheet.rows.map(function (r) {
            var tr = el("tr", null, r.map(function (c, i) { return el(i === 0 ? "th" : "td", i === 0 ? { scope: "row" } : null, c); }));
            state.rows.push({ tr: tr, text: r.join(" ").toLowerCase() });
            return tr;
          }));
          state.empty = el("p", { hidden: true }, "No records match your search.");
          body.replaceChildren(
            el("div", { class: "table-wrap" }, el("table", { class: "data records" },
              el("caption", { class: "visually-hidden" }, s.title + " records"),
              el("thead", null, el("tr", null, sheet.header.map(function (h) { return el("th", { scope: "col" }, h); }))),
              tbody)),
            state.empty);
          onLoaded();
        }).catch(function (e) {
          if (window.console) console.error(e);
          body.replaceChildren(el("p", null, "We could not load these records just now. ",
            el("a", { href: s.url, target: "_blank", rel: "noopener" }, "Open the sheet directly"), "."));
        });
        return { sec: sec, state: state };
      });

      // ---- Tabs (WAI-ARIA tabs pattern: arrows, Home and End; deep links #women-s-classic or a class such as #women-s-classic-57kg)
      var tabEls = [];
      function select(i, opts) {
        opts = opts || {};
        sections.forEach(function (x, n) {
          var on = n === i;
          tabEls[n].setAttribute("aria-selected", String(on));
          tabEls[n].tabIndex = on ? 0 : -1;
          x.sec.hidden = !on;
        });
        if (opts.focus) tabEls[i].focus();
        if (opts.fromUser) { try { history.replaceState(null, "", "#" + slug(sources[i].title)); } catch (e) { /* file:// */ } }
      }
      sources.forEach(function (s, i) {
        var sid = slug(s.title);
        var t = el("button", { type: "button", role: "tab", id: "tab-" + sid, "aria-controls": sid, "aria-selected": "false", tabindex: "-1",
          onclick: function () { select(i, { fromUser: true }); },
          onkeydown: function (e) {
            var n = e.key === "ArrowRight" ? (i + 1) % sources.length : e.key === "ArrowLeft" ? (i + sources.length - 1) % sources.length
              : e.key === "Home" ? 0 : e.key === "End" ? sources.length - 1 : -1;
            if (n < 0) return;
            e.preventDefault();
            select(n, { focus: true, fromUser: true });
          } }, s.title, el("span", { class: "rec-badge", hidden: true }));
        tabEls.push(t);
        tablist.appendChild(t);
      });
      var hashPending = !!location.hash;   // a link such as #women-s-classic-57kg may point at something still loading
      function recFromHash() {
        var id = decodeURIComponent(location.hash.slice(1)), target = id && document.getElementById(id), at = 0;
        sections.forEach(function (x, n) { if (target && x.sec.contains(target)) at = n; });
        select(at);
        if (target && target.closest(".rec-section")) { target.scrollIntoView(); hashPending = false; }   // the panel was hidden when the browser first tried to jump
      }
      onLoaded = function () {
        if (!hashPending) return;
        var id = decodeURIComponent(location.hash.slice(1));
        if (id && document.getElementById(id)) recFromHash();
      };
      tablist.addEventListener("click", function () { hashPending = false; });
      recFromHash();
      window.addEventListener("hashchange", function () { hashPending = false; recFromHash(); });

      search.addEventListener("input", function () {
        var q = search.value.trim().toLowerCase(), shown = 0, firstHit = -1, counts = [];
        sections.forEach(function (x) {
          var n = 0;
          x.state.rows.forEach(function (r) {
            var hit = !q || r.text.indexOf(q) >= 0;
            r.tr.hidden = !hit;
            if (hit) n++;
            if (r.cells) r.cells.forEach(function (c) { c.td.classList.toggle("rec-hit", !!q && !!c.text && c.text.indexOf(q) >= 0); });
          });
          x.state.groups.forEach(function (g) { g.el.hidden = !g.rows.some(function (r) { return !r.tr.hidden; }); });
          if (x.state.empty) x.state.empty.hidden = n > 0 || !x.state.rows.length;
          shown += n;
          counts.push(n);
          if (n && firstHit < 0) firstHit = counts.length - 1;
        });
        // Show how many matches each tab has, and move to one that has some if the open tab has none.
        counts.forEach(function (n, i) {
          var b = tabEls[i].querySelector(".rec-badge");
          b.hidden = !q;
          b.replaceChildren(el("span", { "aria-hidden": "true" }, String(n)), el("span", { class: "visually-hidden" }, " matching records"));
        });
        if (q && firstHit >= 0 && tabEls.every(function (t, i) { return t.getAttribute("aria-selected") !== "true" || !counts[i]; })) select(firstHit);
        status.textContent = q ? shown + " matching record" + (shown === 1 ? "" : "s") : "";
      });
    }).catch(function (e) { fail(root, e); });
  }

  // The privacy policy: the text and the "last updated" date are edited in the site editor and kept in site_settings (key page.privacy).
  function privacy(root) {
    load("site_settings", function (t) { return t.select("value").eq("key", "page.privacy").limit(1); }).then(function (rows) {
      var v = {}; try { v = JSON.parse((rows[0] && rows[0].value) || "{}") || {}; } catch (e) { v = {}; }
      if (!v.body_md) { root.replaceChildren(el("p", null, "The privacy policy is not available just now. Please email info@ynepf.co.uk and we will send it to you.")); return; }
      var body = Y.markdown(v.body_md); body.className = "md article-body";
      var lede = document.getElementById("privacy-updated");
      if (lede && v.updated) lede.textContent = "Last updated: " + Y.longDate(v.updated);
      root.replaceChildren(body);
    }).catch(function (e) { fail(root, e); });
  }

  // The points list: names and points only (emails are never sent to this page). Points expire 24 months after they were earned.
  function points(root) {
    Y.db().rpc("points_public_list").then(function (r) {
      if (r.error) throw r.error;
      var rows = (r.data || []).slice().sort(function (a, b) { return b.points - a.points || (a.name < b.name ? -1 : 1); });
      if (!rows.length) { root.replaceChildren(el("p", null, "Nobody has any points yet.")); return; }
      var q = el("input", { type: "search", id: "points-q", placeholder: "Search by name", "aria-label": "Search by name", style: "max-width:22rem" }), tbody = el("tbody");
      // The list is long, so it stays hidden until someone searches: it shows only the people who match.
      var hint = el("p", { class: "help", role: "status", "aria-live": "polite" }), tableWrap;
      function draw() {
        var t = q.value.trim().toLowerCase();
        if (!t) { tbody.replaceChildren(); tableWrap.hidden = true; hint.textContent = rows.length + (rows.length === 1 ? " person has" : " people have") + " points. Type a name above to see someone's points."; return; }
        var hits = rows.filter(function (x) { return x.name.toLowerCase().indexOf(t) >= 0; });
        tbody.replaceChildren.apply(tbody, hits.map(function (x) { return el("tr", null, el("th", { scope: "row" }, x.name), el("td", null, String(x.points))); }));
        tableWrap.hidden = !hits.length; hint.textContent = hits.length ? hits.length + (hits.length === 1 ? " match." : " matches.") : "Nobody with that name has points yet.";
      }
      q.addEventListener("input", draw);
      root.replaceChildren(el("p", null, "Volunteers earn points for every session or set up and tear down they help with. Points can be spent on priority entry and discounts, and last 24 months. ", el("a", { href: "faqs#how-do-i-earn-points" }, "How points work"), "."),
        el("div", { class: "field" }, el("label", { for: "points-q" }, "Find a name"), q),
        hint,
        (tableWrap = el("div", { class: "table-wrap", hidden: "" }, el("table", { class: "data" }, el("caption", { class: "visually-hidden" }, "Volunteer points"), el("thead", null, el("tr", null, el("th", { scope: "col" }, "Name"), el("th", { scope: "col" }, "Points"))), tbody))),
        spendPoints());
      draw();
    }).catch(function (e) { fail(root, e); });
  }

  // Spend your own points: an emailed one-time code proves the address is yours, then points become a £20 discount code (4 points each).
  // Priority entry needs nothing here: it arrives by email by itself, and costs 1 point when the entry is confirmed.
  function spendPoints() {
    var CFG = window.YNEPF_CONFIG || {}, email = el("input", { type: "email", id: "sp-email", autocomplete: "email", required: true }), code = el("input", { type: "text", id: "sp-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6" });
    var msg = el("p", { role: "status", "aria-live": "polite", class: "help form-status" }), step2 = el("div", { hidden: "" }), step3 = el("div", { hidden: "" });
    function post(action, payload) {
      return fetch((CFG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey || "", Authorization: "Bearer " + (CFG.supabaseAnonKey || "") },
        body: JSON.stringify(Object.assign({ action: action, email: email.value.trim() }, payload)) }).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return { ok: false, message: "We could not reach the server. Please try again." }; });
    }
    function say(t, bad) { msg.textContent = t || ""; msg.className = (bad ? "form-error" : "help") + " form-status"; }
    var send = el("button", { type: "button", class: "btn btn-secondary" }, "Email me a code");
    send.addEventListener("click", function () {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return say("Enter the email address you volunteered with.", true);
      send.disabled = true; say("Sending…");
      post("points_start", {}).then(function (b) { send.disabled = false; if (!b.ok) return say(b.message || "We could not send a code.", true); say("If that address has points, a 6 digit code is on its way. It works for 15 minutes."); step2.hidden = false; code.focus(); });
    });
    var show = el("button", { type: "button", class: "btn btn-primary" }, "Show my points");
    show.addEventListener("click", function () {
      if (!code.value.trim()) return say("Enter the code from the email.", true);
      show.disabled = true; say("Checking…");
      post("points_options", { code: code.value }).then(function (b) {
        show.disabled = false; if (!b.ok) return say(b.message || "That code did not work.", true);
        say(""); drawOptions(b);
      });
    });
    function drawOptions(o) {
      var max = Math.min(5, Math.floor(o.available / o.points_per_step));
      var comp = el("select", { class: "control", id: "sp-comp" }, o.competitions.map(function (c) { return el("option", { value: c.id }, c.name); }));
      var steps = el("select", { class: "control", id: "sp-steps" }); for (var k = 1; k <= Math.max(max, 1); k++) steps.appendChild(el("option", { value: String(k) }, k + (k === 1 ? " discount: £" : " discounts: £") + (k * o.step_pence / 100) + " off for " + (k * o.points_per_step) + " points"));
      var go = el("button", { type: "button", class: "btn btn-primary" }, "Get my discount code");
      var lines = [el("h3", { class: "flow-step-title" }, el("span", { class: "step-num", "aria-hidden": "true" }, "3"), "Your points"), el("p", { class: "flow-hello" }, o.name ? "Hello " + o.name + "." : "Hello."),
        el("div", { class: "flow-stats" }, el("p", null, el("strong", null, String(o.balance)), o.balance === 1 ? " point" : " points"), el("p", null, el("strong", null, String(o.reserved || 0)), " set aside"), el("p", { class: "is-key" }, el("strong", null, String(o.available)), " to spend")),
        el("p", { class: "help" }, "Set aside means points already promised to a priority link or to a discount code you have not used yet. Priority entry (1 point) needs nothing from you: the link arrives by email before entry opens. A discount costs 4 points for every £20 off the entry fee. Points are only taken when your entry is confirmed.")];
      if ((o.codes || []).length) {
        lines.push(el("h3", { class: "flow-sub" }, "Your unused discount codes"), el("p", { class: "help" }, "Changed your mind? Give a code back and its points are free to spend again. A code that is never used frees its points by itself when entry closes."),
          el("ul", { class: "flow-list" }, o.codes.map(function (c) {
            var give = el("button", { type: "button", class: "btn btn-secondary btn-sm", "aria-label": "Give back " + c.code }, "Give the points back");
            give.addEventListener("click", function () {
              give.disabled = true; say("Giving the points back…");
              post("points_release", { code: code.value, code_id: c.id }).then(function (b) {
                give.disabled = false; if (!b.ok) return say(b.message || "We could not do that.", true);
                post("points_options", { code: code.value }).then(function (o2) { say("Done: " + b.points + " points are free again."); if (o2.ok) drawOptions(o2); });
              });
            });
            return el("li", { class: "flow-row" }, el("div", { class: "flow-row-main" }, el("p", { class: "flow-row-title" }, c.code), el("p", { class: "flow-row-sub" }, "£" + (c.pence / 100) + " off " + (c.competition || "a competition") + ", holding " + c.points + " points")), give);
          })));
      }
      if (!o.competitions.length) lines.push(el("p", null, "No competition is open for entry right now. Come back when entry opens."));
      else if (max < 1) lines.push(el("p", null, "You need at least 4 free points for a £20 discount."));
      else {
        go.addEventListener("click", function () {
          go.disabled = true; say("Making your code…");
          post("points_redeem", { code: code.value, competition_id: comp.value, steps: Number(steps.value) }).then(function (b) {
            go.disabled = false; if (!b.ok) return say(b.message || "We could not make a code.", true);
            say(""); step2.hidden = true; step3.hidden = false; step3.replaceChildren(el("div", { class: "success-panel", role: "status" }, el("h2", null, "Your £" + b.pounds + " discount"), el("p", { class: "lead" }, el("strong", { style: "font-size:1.5rem" }, b.code)),
              el("p", null, "It is for " + b.competition + ", for this email address, and can be used once. We have also emailed it to you. Type it into the discount box on the entry form."), el("p", null, b.available_after + (b.available_after === 1 ? " point" : " points") + " still free to spend.")));
          });
        });
        lines.push(el("div", { class: "field" }, el("label", { for: "sp-comp" }, "Which competition?"), comp), el("div", { class: "field" }, el("label", { for: "sp-steps" }, "How much?"), steps), el("div", { class: "actions" }, go));
      }
      step3.hidden = false; step3.replaceChildren.apply(step3, lines);
    }
    var s1 = el("div", { class: "flow-step" }, el("h3", { class: "flow-step-title" }, el("span", { class: "step-num", "aria-hidden": "true" }, "1"), "Get a code"),
      el("p", null, "Enter the email address you volunteered with and we will email you a code."),
      el("div", { class: "field" }, el("label", { for: "sp-email" }, "Your email address"), email), el("div", { class: "actions" }, send), msg);
    step2.className = "flow-step";
    step2.replaceChildren(el("h3", { class: "flow-step-title" }, el("span", { class: "step-num", "aria-hidden": "true" }, "2"), "Enter the code"), el("div", { class: "field" }, el("label", { for: "sp-code" }, "The code we emailed you"), code), el("div", { class: "actions" }, show));
    step3.className = "flow-step";
    return el("section", { class: "panel flow", "aria-labelledby": "sp-h" }, el("h2", { id: "sp-h" }, "Spend your points"),
      el("p", { class: "flow-intro" }, "See your points and turn them into a discount on your entry."), s1, step2, step3);
  }

  // The volunteer rota (/rota?c=<address>): who is helping in each session. Names and roles only. With ?preview=1 a signed-in entries team
  // member can see the saved rota before it is published.
  function rota(root) {
    var params = new URLSearchParams(location.search), key = params.get("c") || "", preview = params.get("preview") === "1";
    var title = document.getElementById("page-title"), lede = document.getElementById("page-lede");
    if (!key) { title.textContent = "Volunteer rota"; lede.textContent = ""; root.replaceChildren(el("p", null, "Choose a competition from the ", el("a", { href: "calendar.html" }, "calendar"), ".")); return; }
    var find = preview ? Y.db().from("competitions").select("id,name,start_date,end_date").eq("slug", key).limit(1).then(function (r) { if (r.error) throw r.error; return r.data || []; })
      : load("competitions_public", function (t) { return t.select("id,name,start_date,end_date").eq("slug", key).limit(1); });
    find.then(function (rows) {
      if (!rows.length) { title.textContent = preview ? "Preview" : "Rota not found"; lede.textContent = ""; root.replaceChildren(el("p", null, preview ? "Sign in to the admin area first, then reload this page to see the preview." : "We could not find that competition.")); return; }
      var c = rows[0];
      title.textContent = c.name + ": volunteer rota"; lede.textContent = Y.dateRange(c.start_date, c.end_date);
      return (preview ? Y.db().rpc("rota_preview", { c: c.id }) : Y.db().from("rota_public").select("*").eq("competition_id", c.id)).then(function (r) {
        if (r.error) throw r.error;
        var data = r.data || [];
        if (!data.length) { root.replaceChildren(el("p", null, preview ? "Nothing is filled in yet." : "The rota has not been published yet. Please check back later.")); return; }
        var sessions = {}, order = [];
        data.forEach(function (x) { var s = sessions[x.vol_session_id]; if (!s) { s = sessions[x.vol_session_id] = { label: x.label, when: x.when_text, n: x.session_order, roles: {}, ro: [] }; order.push(s); } var ro = s.roles[x.role]; if (!ro) { ro = s.roles[x.role] = { name: x.role, n: x.role_order, people: [] }; s.ro.push(ro); } ro.people.push({ n: x.position, name: x.name, level: x.level }); });
        order.sort(function (a, b) { return a.n - b.n; });
        var kids = [];
        if (preview) kids.push(el("div", { class: "callout", role: "status" }, el("p", { class: "callout-title" }, "Preview"), el("p", { style: "margin:0" }, "This is the saved rota. It is only visible to the entries team until it is published.")));
        order.forEach(function (s) {
          s.ro.sort(function (a, b) { return a.n - b.n; });
          kids.push(el("section", { class: "lo-session" }, el("h2", null, s.label), s.when ? el("p", { class: "lo-times" }, s.when) : null,
            el("div", { class: "table-wrap" }, el("table", { class: "data rota-table" }, el("caption", { class: "visually-hidden" }, s.label),
              el("thead", null, el("tr", null, el("th", { scope: "col" }, "Role"), el("th", { scope: "col" }, "Volunteers"))),
              el("tbody", null, s.ro.map(function (ro) { ro.people.sort(function (a, b) { return a.n - b.n; }); return el("tr", null, el("th", { scope: "row" }, ro.name), el("td", null, ro.people.map(function (p) { return p.name + (p.level ? " (" + p.level + ")" : ""); }).join(", "))); }))))));
        });
        root.replaceChildren.apply(root, kids);
      });
    }).catch(function (e) { fail(root, e); });
  }

  var routes = { points: points, rota: rota, privacy: privacy, calendar: calendar, committee: committee, news: news, post: post, faqs: faqs, records: records, lifting: lifting };
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
