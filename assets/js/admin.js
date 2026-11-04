/* ==========================================================================
   admin.js — the site editor. Sign in with a Supabase email + password, then
   manage competitions, news, the organisation page and FAQs.
   All data access goes through the Supabase client; what a signed-in user
   may do is enforced by row level security (see supabase/schema.sql).
   ========================================================================== */
(function () {
  "use strict";

  var Y = window.YNEPF;
  var el = Y.el;
  var sb = Y.db();
  var $ = function (id) { return document.getElementById(id); };
  var state = { user: null, name: "", role: null, recovering: false };

  // ---- small utilities --------------------------------------------------------
  function ok(res) { if (res.error) throw res.error; return res.data; }
  function friendly(err) {
    if (err && err.code === "23505") return "That value is already used somewhere else (for example a web address or an email). Change it and try again.";
    if (err && /row-level security|permission denied/i.test(err.message || "")) return "You do not have permission to do that. Try signing out and in again.";
    return (err && err.message) || "Something went wrong. Please try again.";
  }
  function toast(msg, kind) {
    var t = el("div", { class: kind === "error" ? "toast-error" : "" }, msg);
    $("toast").appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "error" ? 7000 : 3500);
  }
  function slugify(s) {
    return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }
  function btn(label, onclick, cls, extra) {
    return el("button", Object.assign({ type: "button", class: "btn btn-sm " + (cls || "btn-secondary"), onclick: onclick }, extra || {}), label);
  }
  function show(node, visible) { node.hidden = !visible; }
  function nowLocalInput() { return Y.toLondonInput(new Date().toISOString()); }

  // ---- dialog form builder ------------------------------------------------------
  // fields: {name,label,type,required,help,half,options,placeholder}
  // types: text url email number textarea date datetime select checkbox md
  function openForm(opt) {
    var dlg = $("dlg");
    var controls = {};   // name -> {get,set,input}
    var editors = [];
    var errBox = el("p", { class: "form-error", role: "alert", hidden: true });
    var form = el("form", { novalidate: true });
    var vals = opt.values || {};
    var grid = null;

    form.appendChild(el("h2", { id: "dlg-title" }, opt.title));
    form.appendChild(errBox);

    opt.fields.forEach(function (f) {
      var c = makeControl(f, vals[f.name], editors);
      controls[f.name] = c;
      if (f.half) {
        if (!grid) { grid = el("div", { class: "form-grid" }); form.appendChild(grid); }
        grid.appendChild(c.wrap);
      } else {
        grid = null;
        form.appendChild(c.wrap);
      }
    });

    var save = el("button", { class: "btn btn-primary", type: "submit" }, opt.saveLabel || "Save");
    form.appendChild(el("div", { class: "dialog-actions" }, save,
      el("button", { class: "btn btn-secondary", type: "button", onclick: function () { dlg.close(); } }, "Cancel")));

    var api = {
      get: function (n) { return controls[n].get(); },
      set: function (n, v) { controls[n].set(v); },
      input: function (n) { return controls[n].input; }
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errBox.hidden = true;
      var out = {};
      for (var i = 0; i < opt.fields.length; i++) {
        var f = opt.fields[i];
        out[f.name] = controls[f.name].get();
        var empty = out[f.name] === "" || out[f.name] === null;
        if (f.required && empty) return fail(f.label + " is required.", controls[f.name].input);
      }
      var problem = opt.validate && opt.validate(out);
      if (problem) return fail(problem);
      save.disabled = true;
      Promise.resolve(opt.onSave(out)).then(function () { dlg.close(); })
        .catch(function (err) { fail(friendly(err)); })
        .then(function () { save.disabled = false; });
    });
    function fail(msg, focusEl) {
      errBox.textContent = msg;
      errBox.hidden = false;
      errBox.scrollIntoView({ block: "nearest" });
      if (focusEl && focusEl.focus) focusEl.focus();
    }

    dlg.replaceChildren(form);
    dlg.addEventListener("close", function onClose() {
      dlg.removeEventListener("close", onClose);
      editors.forEach(function (ed) { try { ed.destroy(); } catch (e) { /* already gone */ } });
      dlg.replaceChildren();
    });
    dlg.showModal();
    // Rich editors need to be laid out before they are created.
    editors.pending.forEach(function (fn) { fn(); });
    var first = form.querySelector("input:not([type=checkbox]), textarea, select");
    if (first) first.focus();
    return api;
  }

  function makeControl(f, value, editors) {
    editors.pending = editors.pending || [];
    var id = "f-" + f.name;
    var help = f.help ? el("p", { class: "help", id: id + "-help" }, f.help) : null;
    var describedBy = help ? { "aria-describedby": id + "-help" } : {};
    var input, wrap;
    var type = f.type || "text";

    if (type === "checkbox") {
      input = el("input", Object.assign({ type: "checkbox", id: id }, describedBy));
      input.checked = value === undefined ? !!f.default : !!value;
      wrap = el("div", { class: "field field-check" }, input,
        el("div", null, el("label", { for: id }, f.label), help));
      return { wrap: wrap, input: input, get: function () { return input.checked; }, set: function (v) { input.checked = !!v; } };
    }

    if (type === "md") {
      var host = el("div", { id: id, class: "md-host" });
      var ed = null;
      var pendingSet = null;
      wrap = el("div", { class: "field" }, el("span", { class: "label", id: id + "-label" }, f.label), help, host);
      editors.pending.push(function () {
        ed = new window.toastui.Editor({
          el: host, height: "380px", initialEditType: "wysiwyg", previewStyle: "tab",
          initialValue: value || "", usageStatistics: false, autofocus: false,
          toolbarItems: [["heading", "bold", "italic", "strike"], ["ul", "ol"], ["quote", "hr"], ["table", "link"], ["code"]]
        });
        editors.push(ed);
        if (pendingSet !== null) ed.setMarkdown(pendingSet);
      });
      return {
        wrap: wrap, input: host,
        get: function () { return ed ? ed.getMarkdown().trim() : (value || ""); },
        set: function (v) { if (ed) ed.setMarkdown(v); else pendingSet = v; }
      };
    }

    if (type === "textarea") {
      input = el("textarea", Object.assign({ id: id, rows: f.rows || 5, placeholder: f.placeholder }, describedBy));
      input.value = value || "";
    } else if (type === "select") {
      input = el("select", Object.assign({ id: id }, describedBy),
        f.options.map(function (o) { return el("option", { value: o.value }, o.label); }));
      input.value = value || (f.options[0] && f.options[0].value) || "";
    } else {
      var htmlType = { datetime: "datetime-local", url: "url", email: "email", number: "number", date: "date" }[type] || "text";
      input = el("input", Object.assign({ id: id, type: htmlType, placeholder: f.placeholder, min: f.min }, describedBy));
      input.value = value === null || value === undefined ? "" : value;
    }
    wrap = el("div", { class: "field" }, el("label", { for: id }, f.label), help, input);
    return {
      wrap: wrap, input: input,
      get: function () {
        var v = input.value.trim();
        if (type === "number") return v === "" ? null : Number(v);
        return v;
      },
      set: function (v) { input.value = v === null || v === undefined ? "" : v; }
    };
  }

  // ---- competitions ---------------------------------------------------------------
  var STATE_LABEL = { archived: "Past", open: "Entry open", closed: "Entry closed", full: "Entries full", soon: "Entry not open yet", none: "No entry set" };

  function renderCompetitions(panel) {
    panel.replaceChildren(panelHead("Competitions", btn("Add competition", function () { editCompetition(); }, "btn-primary")),
      el("p", { class: "panel-intro" }, "Entry opens and closes at the UK times you set (GMT in winter, BST in summer). The entry link only appears on the website while entry is open."),
      el("p", null, "Loading…"));
    sb.from("competitions").select("*").order("start_date", { ascending: true }).then(function (res) {
      var rows = ok(res);
      var current = rows.filter(function (c) { return Y.compState(c) !== "archived"; });
      var past = rows.filter(function (c) { return Y.compState(c) === "archived"; }).reverse();
      panel.lastChild.remove();
      panel.appendChild(el("h2", null, "Upcoming"));
      panel.appendChild(current.length ? compTable(current) : el("p", { class: "empty" }, "No upcoming competitions."));
      if (past.length) {
        panel.appendChild(el("h2", null, "Past"));
        panel.appendChild(compTable(past));
      }
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }

  function compTable(rows) {
    return el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
      el("thead", null, el("tr", null, ["Competition", "Date", "Entry", "Actions"].map(function (h) { return el("th", { scope: "col" }, h); }))),
      el("tbody", null, rows.map(function (c) {
        var st = Y.compState(c);
        var actions = el("span", { class: "actions" }, btn("Edit", function () { editCompetition(c); }));
        if (st === "open" || st === "soon" || st === "none") {
          actions.appendChild(btn("Mark entries full", function () { setFull(c, true); }));
        } else if (c.entries_full && st !== "archived") {
          actions.appendChild(btn("Entries not full", function () { setFull(c, false); }));
        }
        actions.appendChild(btn("Delete", function () { removeCompetition(c); }, "btn-danger"));
        return el("tr", null,
          el("th", { scope: "row" }, c.name, !c.published ? [" ", el("span", { class: "tag tag-position" }, "Draft")] : null,
            c.venue_name ? el("small", null, c.venue_name) : null),
          el("td", null, Y.dateRange(c.start_date, c.end_date)),
          el("td", null, STATE_LABEL[st],
            Y.entryLine(c) ? el("small", null, Y.entryLine(c)) : null),
          el("td", null, actions));
      }))));
  }

  function setFull(c, full) {
    sb.from("competitions").update({ entries_full: full }).eq("id", c.id)
      .then(ok).then(function () { toast(full ? "Marked as full." + (c.waitlist_url ? "" : " Add a waiting list link by editing it, if you have one.") : "Entries reopened."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }
  function removeCompetition(c) {
    if (!window.confirm("Delete “" + c.name + "”? This cannot be undone.")) return;
    sb.from("competitions").delete().eq("id", c.id).then(ok)
      .then(function () { toast("Competition deleted."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }

  function editCompetition(c) {
    var isNew = !c;
    c = c || {};
    var values = Object.assign({}, c, {
      entry_opens: Y.toLondonInput(c.entry_opens),
      entry_closes: Y.toLondonInput(c.entry_closes),
      published: isNew ? true : c.published
    });
    var api = openForm({
      title: isNew ? "Add competition" : "Edit competition",
      values: values,
      saveLabel: isNew ? "Add competition" : "Save changes",
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "slug", label: "Web address ending", help: "Used for the lifting order link: /lifting-order/… Made from the year and name if you leave it blank. Lower case letters, numbers and hyphens only." },
        { name: "label", label: "Tag (optional)", help: "A small label next to the name, for example “Sponsor TBD”.", half: true },
        { name: "capacity", label: "Number of spaces (optional)", type: "number", min: "0", half: true },
        { name: "description", label: "Description", type: "textarea", rows: 5, help: "Plain text. Start lines with “- ” for bullet points. Links look like [text](https://…)." },
        { name: "start_date", label: "First day", type: "date", required: true, half: true },
        { name: "end_date", label: "Last day (if more than one day)", type: "date", half: true },
        { name: "venue_name", label: "Venue", help: "Shown on the page and linked to Google Maps.", half: true },
        { name: "venue_address", label: "Address or postcode (optional)", help: "Makes the Maps link more accurate.", half: true },
        { name: "map_url", label: "Custom map link (optional)", type: "url", help: "Only needed if the automatic Google Maps link is wrong." },
        { name: "openipf_url", label: "OpenIPF results link (optional)", type: "url", placeholder: "https://www.openipf.org/…",
          help: "Add this after the competition, once results are on OpenIPF. It shows as a link on the Calendar that opens in a new tab." },
        { name: "entry_url", label: "Entry link", type: "url", placeholder: "https://…", help: "Goes live on the website at the time entry opens, and is hidden when entry closes." },
        { name: "entry_opens", label: "Entry opens (UK time)", type: "datetime", half: true, help: "Filled in as 8 weeks before, at 9am. Change it if you need to." },
        { name: "entry_closes", label: "Entry closes (UK time)", type: "datetime", half: true, help: "Filled in as 3 weeks before, at noon." },
        { name: "entries_full", label: "Entries full", type: "checkbox", help: "Tick this when the competition fills up before entry closes. The entry link is replaced by a “Join the waiting list” link (if you add one below)." },
        { name: "waitlist_url", label: "Waiting list link (Google Form)", type: "url", placeholder: "https://forms.gle/…", help: "Only shown on the website while entries are marked full." },
        { name: "lifting_order_url", label: "Lifting order sheet (optional)", type: "url", placeholder: "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv",
          help: "Add it a few days after entries open: a “View lifting order” button appears next to “Enter now” once it is here, and the page follows the sheet as you edit it. Use a published Google Sheet (File > Share > Publish to web > CSV), one row per lifter. Needs columns Day, Session, Flight and Name. Optional: Club, Instagram, Age, Class, Best total, GLP, Open IPF, and per session Weigh-in, Lift off and Session name. Only columns with something in them are shown." },
        { name: "published", label: "Show on the website", type: "checkbox", help: "Untick to keep it as a draft." }
      ],
      validate: function (v) {
        if (v.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) return "The web address can only use lower case letters, numbers and hyphens.";
        if (v.end_date && v.end_date < v.start_date) return "The last day cannot be before the first day.";
        if (v.entry_opens && v.entry_closes && v.entry_closes <= v.entry_opens) return "Entry must close after it opens.";
        if (v.entry_url && !/^https?:\/\//i.test(v.entry_url)) return "The entry link must start with https://";
        if (v.map_url && !/^https?:\/\//i.test(v.map_url)) return "The map link must start with https://";
        if (v.openipf_url && !/^https:\/\//i.test(v.openipf_url)) return "The OpenIPF link must start with https://";
        if (v.waitlist_url && !/^https:\/\//i.test(v.waitlist_url)) return "The waiting list link must start with https://";
        if (v.lifting_order_url && !Y.sheetCsvUrl(v.lifting_order_url)) return "The lifting order link does not look usable. It must start with https://";
        return null;
      },
      onSave: function (v) {
        var row = {
          name: v.name, slug: v.slug, description: v.description, label: v.label,
          start_date: v.start_date, end_date: v.end_date || null,
          venue_name: v.venue_name, venue_address: v.venue_address, map_url: v.map_url, openipf_url: v.openipf_url,
          capacity: v.capacity, entry_url: v.entry_url,
          entry_opens: Y.fromLondonInput(v.entry_opens), entry_closes: Y.fromLondonInput(v.entry_closes),
          entries_full: v.entries_full, waitlist_url: v.waitlist_url, lifting_order_url: v.lifting_order_url, published: v.published
        };
        var q = isNew ? sb.from("competitions").insert(row) : sb.from("competitions").update(row).eq("id", c.id);
        return q.then(ok).then(function () {
          toast(isNew ? "Competition added." : "Competition saved.");
          route();
          if (v.lifting_order_url && v.lifting_order_url !== c.lifting_order_url) {
            // Check the sheet really works, and say so straight away.
            Y.loadSheet(v.lifting_order_url).then(function (s) {
              var r = Y.parseLiftingOrder(s);
              toast("Lifting order read fine: " + r.lifters.length + " lifters in " + r.flightCount + " flights.");
            }).catch(function (e) { toast("Saved, but the lifting order could not be read: " + e.message, "error"); });
          }
        });
      }
    });

    // For a new competition, suggest the web address from the year and name.
    if (isNew) {
      var slugTouched = false;
      api.input("slug").addEventListener("input", function () { slugTouched = true; });
      var suggest = function () {
        if (slugTouched) return;
        var d = api.get("start_date"), n = api.get("name");
        api.set("slug", n ? slugify((d ? d.slice(0, 4) + " " : "") + n) : "");
      };
      api.input("name").addEventListener("input", suggest);
      api.input("start_date").addEventListener("change", suggest);
    }

    // Suggest the standard entry window from the competition date, unless the
    // editor has typed their own times.
    var touched = { entry_opens: !!values.entry_opens, entry_closes: !!values.entry_closes };
    ["entry_opens", "entry_closes"].forEach(function (n) {
      api.input(n).addEventListener("input", function () { touched[n] = true; });
    });
    api.input("start_date").addEventListener("change", function () {
      var d = api.get("start_date");
      if (!d) return;
      if (!touched.entry_opens) api.set("entry_opens", Y.addDays(d, -56) + "T09:00");
      if (!touched.entry_closes) api.set("entry_closes", Y.addDays(d, -21) + "T12:00");
    });
  }

  // ---- news -----------------------------------------------------------------------
  function renderNews(panel) {
    panel.replaceChildren(panelHead("News", btn("New post", function () { editPost(); }, "btn-primary")),
      el("p", { class: "panel-intro" }, "Posts show on the News page, newest first. A post dated in the future appears automatically on that date."),
      el("p", null, "Loading…"));
    sb.from("posts").select("*").order("post_date", { ascending: false }).then(function (res) {
      var rows = ok(res);
      panel.lastChild.remove();
      if (!rows.length) { panel.appendChild(el("p", { class: "empty" }, "No posts yet.")); return; }
      panel.appendChild(el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
        el("thead", null, el("tr", null, ["Title", "Date", "Author", "Status", "Actions"].map(function (h) { return el("th", { scope: "col" }, h); }))),
        el("tbody", null, rows.map(function (p) {
          var status = !p.published ? "Draft" : (new Date(p.post_date) > new Date() ? "Scheduled" : "Published");
          return el("tr", null,
            el("th", { scope: "row" }, p.title),
            el("td", null, Y.longDate(p.post_date)),
            el("td", null, p.author_name || "—"),
            el("td", null, status),
            el("td", null, el("span", { class: "actions" },
              btn("Edit", function () { editPost(p); }),
              el("a", { class: "btn btn-sm btn-secondary", href: "../post.html?p=" + encodeURIComponent(p.slug), target: "_blank", rel: "noopener" }, "View"),
              btn("Delete", function () { removePost(p); }, "btn-danger"))));
        })))));
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }

  function removePost(p) {
    if (!window.confirm("Delete “" + p.title + "”? This cannot be undone.")) return;
    sb.from("posts").delete().eq("id", p.id).then(ok)
      .then(function () { toast("Post deleted."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }

  function editPost(p) {
    var isNew = !p;
    p = p || {};
    var api = openForm({
      title: isNew ? "New post" : "Edit post",
      saveLabel: isNew ? "Publish post" : "Save changes",
      values: { title: p.title, slug: p.slug, post_date: p.post_date ? Y.toLondonInput(p.post_date) : nowLocalInput(), published: isNew ? true : p.published, body_md: p.body_md },
      fields: [
        { name: "title", label: "Title", required: true },
        { name: "post_date", label: "Post date (UK time)", type: "datetime", required: true, half: true },
        { name: "slug", label: "Web address ending", required: true, half: true, help: "Made from the title. Letters, numbers and hyphens only." },
        { name: "body_md", label: "Post", type: "md", help: "Use the toolbar for headings, lists and links. Switch to Markdown at the bottom if you prefer." },
        { name: "published", label: "Published", type: "checkbox", help: "Untick to save as a draft that only editors can see." }
      ],
      validate: function (v) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) return "The web address can only use lower case letters, numbers and hyphens.";
        return null;
      },
      onSave: function (v) {
        var row = { title: v.title, slug: v.slug, post_date: Y.fromLondonInput(v.post_date), body_md: v.body_md, published: v.published };
        if (isNew) { row.author_id = state.user.id; row.author_name = state.name; }
        var q = isNew ? sb.from("posts").insert(row) : sb.from("posts").update(row).eq("id", p.id);
        return q.then(ok).then(function () { toast(isNew ? "Post saved." : "Post updated."); route(); });
      }
    });
    if (isNew) {
      var slugTouched = false;
      api.input("slug").addEventListener("input", function () { slugTouched = true; });
      api.input("title").addEventListener("input", function () {
        if (!slugTouched) api.set("slug", slugify(api.get("title")));
      });
    }
  }

  // ---- groups with ordered items (organisation + FAQs) ----------------------------------
  function igHandle(s) {
    return (s || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  }

  var ORG = {
    title: "Organisation", slug: "organisation",
    intro: "Everyone listed on the Committee page. Sections run top to bottom; people run left to right.",
    gTable: "org_sections", iTable: "people", fk: "section_id", gWord: "section", iWord: "person", iPlural: "people",
    gFields: [
      { name: "title", label: "Section title", required: true },
      { name: "description", label: "Short description (optional)", type: "textarea", rows: 3 }
    ],
    iFields: [
      { name: "name", label: "Name", required: true, half: true },
      { name: "role", label: "Role", required: true, half: true, help: "For example “Finance Director” or “IPF Category I”." },
      { name: "instagram", label: "Instagram (optional)", half: true, help: "A handle or a profile link." },
      { name: "blurb", label: "What they do (optional)", type: "textarea", rows: 3 }
    ],
    gSub: function (g) { return g.description; },
    iTitle: function (p) { return p.name; },
    iSub: function (p) { return [p.role, p.instagram && "@" + p.instagram].filter(Boolean).join(" · "); },
    normalise: function (v) { v.instagram = igHandle(v.instagram); return v; },
    validate: function (v) {
      if (v.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(v.instagram)) return "That does not look like an Instagram handle.";
      return null;
    }
  };

  var FAQ = {
    title: "FAQs", slug: "faqs",
    intro: "Questions are grouped under category headings. The page shows categories top to bottom.",
    gTable: "faq_categories", iTable: "faqs", fk: "category_id", gWord: "category", iWord: "FAQ", iPlural: "FAQs",
    gFields: [{ name: "title", label: "Category title", required: true }],
    iFields: [
      { name: "question", label: "Question", required: true },
      { name: "answer_md", label: "Answer", type: "md", required: true, help: "Links, lists and tables are all fine." }
    ],
    gSub: function () { return ""; },
    iTitle: function (f) { return f.question; },
    iSub: function () { return ""; },
    normalise: function (v) { return v; },
    validate: function () { return null; }
  };

  function renderGrouped(panel, cfg) {
    var cap = cfg.gWord.charAt(0).toUpperCase() + cfg.gWord.slice(1);
    var focusKey = renderGrouped.focusKey;
    renderGrouped.focusKey = null;

    panel.replaceChildren(panelHead(cfg.title, btn("Add " + cfg.gWord, function () { editGroup(); }, "btn-primary")),
      el("p", { class: "panel-intro" }, cfg.intro), el("p", null, "Loading…"));

    Promise.all([
      sb.from(cfg.gTable).select("*").order("sort_order"),
      sb.from(cfg.iTable).select("*").order("sort_order")
    ]).then(function (r) {
      var groups = ok(r[0]), items = ok(r[1]);
      panel.lastChild.remove();
      if (!groups.length) panel.appendChild(el("p", { class: "empty" }, "Nothing here yet. Add a " + cfg.gWord + " to get started."));

      groups.forEach(function (g, gi) {
        var mine = items.filter(function (i) { return i[cfg.fk] === g.id; });
        var card = el("section", { class: "card", "aria-label": g.title },
          el("div", { class: "card-head" },
            el("div", null, el("h2", null, g.title), cfg.gSub(g) ? el("p", null, cfg.gSub(g)) : null),
            el("span", { class: "actions" },
              moveBtns(groups, gi, cfg.gTable, "g" + g.id, g.title),
              btn("Edit " + cfg.gWord, function () { editGroup(g); }),
              btn("Delete " + cfg.gWord, function () { removeGroup(g, mine.length); }, "btn-danger"))));
        var list = el("ul", { class: "item-list" });
        mine.forEach(function (it, ii) {
          list.appendChild(el("li", { class: "item-row" },
            el("div", { class: "item-main" }, el("p", { class: "item-title" }, cfg.iTitle(it)),
              cfg.iSub(it) ? el("p", { class: "item-sub" }, cfg.iSub(it)) : null),
            el("span", { class: "actions" },
              moveBtns(mine, ii, cfg.iTable, "i" + it.id, cfg.iTitle(it)),
              btn("Edit", function () { editItem(it, g, groups); }),
              btn("Delete", function () { removeItem(it); }, "btn-danger"))));
        });
        if (!mine.length) list.appendChild(el("li", { class: "item-row" }, el("p", { class: "empty", style: "margin:0;" }, "No " + cfg.iPlural + " in this " + cfg.gWord + " yet.")));
        card.appendChild(list);
        card.appendChild(el("p", { style: "margin:var(--space-3) 0 0;" }, btn("Add " + cfg.iWord, function () { editItem(null, g, groups); })));
        panel.appendChild(card);
      });

      if (focusKey) {
        var target = panel.querySelector('[data-key="' + focusKey + '"]');
        if (target && !target.disabled) target.focus();
        else { var alt = panel.querySelector('[data-key="' + focusKey.replace(/[ud]$/, function (m) { return m === "u" ? "d" : "u"; }) + '"]'); if (alt) alt.focus(); }
      }
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });

    function moveBtns(list, index, table, key, label) {
      var up = btn("↑", function () { move(list, index, -1, table, key + "u"); }, "btn-secondary icon-btn", { "aria-label": "Move " + label + " up", "data-key": key + "u" });
      var down = btn("↓", function () { move(list, index, 1, table, key + "d"); }, "btn-secondary icon-btn", { "aria-label": "Move " + label + " down", "data-key": key + "d" });
      up.disabled = index === 0;
      down.disabled = index === list.length - 1;
      return [up, down];
    }

    function move(list, index, dir, table, key) {
      var a = list.slice(), j = index + dir;
      var t = a[index]; a[index] = a[j]; a[j] = t;
      var jobs = [];
      a.forEach(function (x, i) {
        var want = (i + 1) * 10;
        if (x.sort_order !== want) jobs.push(sb.from(table).update({ sort_order: want }).eq("id", x.id).then(ok));
      });
      Promise.all(jobs).then(function () { renderGrouped.focusKey = key; route(); })
        .catch(function (e) { toast(friendly(e), "error"); });
    }

    function nextOrder(table, filterCol, filterVal) {
      var q = sb.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
      if (filterCol) q = q.eq(filterCol, filterVal);
      return q.then(ok).then(function (rows) { return (rows[0] ? rows[0].sort_order : 0) + 10; });
    }

    function editGroup(g) {
      var isNew = !g;
      openForm({
        title: isNew ? "Add " + cfg.gWord : "Edit " + cfg.gWord,
        values: g || {}, fields: cfg.gFields,
        saveLabel: isNew ? "Add " + cfg.gWord : "Save changes",
        onSave: function (v) {
          var write = isNew
            ? nextOrder(cfg.gTable).then(function (n) { return sb.from(cfg.gTable).insert(Object.assign({}, v, { sort_order: n })); })
            : sb.from(cfg.gTable).update(v).eq("id", g.id);
          return write.then(ok).then(function () { toast(cap + " saved."); route(); });
        }
      });
    }
    function removeGroup(g, count) {
      var msg = "Delete the " + cfg.gWord + " “" + g.title + "”" + (count ? " and its " + count + " " + (count === 1 ? cfg.iWord : cfg.iPlural) : "") + "? This cannot be undone.";
      if (!window.confirm(msg)) return;
      sb.from(cfg.gTable).delete().eq("id", g.id).then(ok)
        .then(function () { toast(cap + " deleted."); route(); })
        .catch(function (e) { toast(friendly(e), "error"); });
    }

    function editItem(it, group, groups) {
      var isNew = !it;
      var fields = cfg.iFields.slice();
      fields.unshift({
        name: cfg.fk, label: cap, type: "select",
        options: groups.map(function (g) { return { value: g.id, label: g.title }; })
      });
      var values = Object.assign({}, it || {});
      values[cfg.fk] = it ? it[cfg.fk] : group.id;
      openForm({
        title: isNew ? "Add " + cfg.iWord : "Edit " + cfg.iWord,
        values: values, fields: fields,
        saveLabel: isNew ? "Add " + cfg.iWord : "Save changes",
        validate: function (v) { return cfg.validate(cfg.normalise(Object.assign({}, v))); },
        onSave: function (v) {
          v = cfg.normalise(v);
          var moved = !isNew && it[cfg.fk] !== v[cfg.fk];
          var write = (isNew || moved)
            ? nextOrder(cfg.iTable, cfg.fk, v[cfg.fk]).then(function (n) {
                var row = Object.assign({}, v, { sort_order: n });
                return isNew ? sb.from(cfg.iTable).insert(row) : sb.from(cfg.iTable).update(row).eq("id", it.id);
              })
            : sb.from(cfg.iTable).update(v).eq("id", it.id);
          return write.then(ok).then(function () { toast("Saved."); route(); });
        }
      });
    }
    function removeItem(it) {
      if (!window.confirm("Delete “" + cfg.iTitle(it) + "”? This cannot be undone.")) return;
      sb.from(cfg.iTable).delete().eq("id", it.id).then(ok)
        .then(function () { toast("Deleted."); route(); })
        .catch(function (e) { toast(friendly(e), "error"); });
    }
  }

  // ---- messages (from the website's contact form) -------------------------------------
  function renderMessages(panel) {
    panel.replaceChildren(panelHead("Messages"),
      el("p", { class: "panel-intro" }, "Messages sent through the Contact page. Reply by email, then mark each one as handled so the team can see what is still waiting."),
      el("p", null, "Loading…"));
    sb.from("contact_messages").select("*").order("created_at", { ascending: false }).then(function (res) {
      var rows = ok(res);
      panel.lastChild.remove();
      var open = rows.filter(function (m) { return !m.handled; });
      var done = rows.filter(function (m) { return m.handled; });
      panel.appendChild(el("h2", null, "Waiting (" + open.length + ")"));
      panel.appendChild(open.length ? el("div", null, open.map(messageCard)) : el("p", { class: "empty" }, "Nothing waiting. Nice."));
      if (done.length) {
        panel.appendChild(el("h2", null, "Handled (" + done.length + ")"));
        panel.appendChild(el("details", null, el("summary", { style: "cursor:pointer;font-weight:600;margin-bottom:var(--space-3);" }, "Show handled messages"), el("div", null, done.map(messageCard))));
      }
      setMessageBadge(open.length);
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }
  function messageCard(m) {
    var when = new Date(m.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: Y.TZ });
    return el("section", { class: "card", "aria-label": m.subject },
      el("div", { class: "card-head" },
        el("div", null, el("h2", null, m.subject),
          el("p", null, m.name + " · ", el("a", { href: "mailto:" + m.email }, m.email), " · " + when))),
      el("p", { style: "white-space:pre-wrap;margin:var(--space-3) 0;max-width:none;" }, m.message),
      el("span", { class: "actions" },
        el("a", { class: "btn btn-sm btn-primary", href: "mailto:" + m.email + "?subject=" + encodeURIComponent("Re: " + m.subject) }, "Reply by email"),
        btn(m.handled ? "Mark as waiting" : "Mark as handled", function () { setHandled(m, !m.handled); }),
        btn("Delete", function () { removeMessage(m); }, "btn-danger")));
  }
  function setHandled(m, handled) {
    sb.from("contact_messages").update({ handled: handled }).eq("id", m.id).then(ok)
      .then(function () { route(); }).catch(function (e) { toast(friendly(e), "error"); });
  }
  function removeMessage(m) {
    if (!window.confirm("Delete this message from " + m.name + "? This cannot be undone.")) return;
    sb.from("contact_messages").delete().eq("id", m.id).then(ok)
      .then(function () { toast("Message deleted."); route(); }).catch(function (e) { toast(friendly(e), "error"); });
  }
  function setMessageBadge(n) {
    var tab = $("tab-messages");
    if (tab) tab.textContent = n ? "Messages (" + n + ")" : "Messages";
  }
  function refreshMessageBadge() {
    sb.from("contact_messages").select("id").eq("handled", false).then(function (res) {
      if (!res.error) setMessageBadge((res.data || []).length);
    });
  }

  // ---- records (links to published Google Sheets) -----------------------------------
  function renderRecords(panel) {
    panel.replaceChildren(panelHead("Records", btn("Add record sheet", function () { editSource(); }, "btn-primary")),
      el("div", { class: "panel-intro" },
        el("p", null, "Each entry below becomes a table on the Records page, read live from a Google Sheet. To get a link: in the sheet choose ",
          el("strong", null, "File > Share > Publish to web"), ", pick the tab, choose ", el("strong", null, "Comma-separated values (.csv)"),
          ", press Publish and paste the link here. Changes in the sheet appear on the site within a few minutes."),
        el("p", null, "To move the records somewhere else later, edit the entry and paste the new link. Entries with no link are hidden from the public page.")),
      el("p", null, "Loading…"));
    sb.from("record_sources").select("*").order("sort_order").then(function (res) {
      var rows = ok(res);
      panel.lastChild.remove();
      if (!rows.length) { panel.appendChild(el("p", { class: "empty" }, "No record sheets yet.")); return; }
      var list = el("ul", { class: "item-list card", style: "padding:0 var(--space-5);" });
      rows.forEach(function (r, i) {
        var up = btn("↑", function () { moveSource(rows, i, -1); }, "btn-secondary icon-btn", { "aria-label": "Move " + r.title + " up" });
        var down = btn("↓", function () { moveSource(rows, i, 1); }, "btn-secondary icon-btn", { "aria-label": "Move " + r.title + " down" });
        up.disabled = i === 0; down.disabled = i === rows.length - 1;
        list.appendChild(el("li", { class: "item-row" },
          el("div", { class: "item-main" }, el("p", { class: "item-title" }, r.title),
            el("p", { class: "item-sub", style: "overflow-wrap:anywhere;" }, r.url || "No link yet (hidden on the site)")),
          el("span", { class: "actions" }, up, down,
            btn("Edit", function () { editSource(r); }),
            btn("Delete", function () { removeSource(r); }, "btn-danger"))));
      });
      panel.appendChild(list);
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }

  function moveSource(rows, index, dir) {
    var a = rows.slice(), j = index + dir, t = a[index]; a[index] = a[j]; a[j] = t;
    var jobs = [];
    a.forEach(function (x, i) {
      if (x.sort_order !== (i + 1) * 10) jobs.push(sb.from("record_sources").update({ sort_order: (i + 1) * 10 }).eq("id", x.id).then(ok));
    });
    Promise.all(jobs).then(route).catch(function (e) { toast(friendly(e), "error"); });
  }
  function removeSource(r) {
    if (!window.confirm("Remove “" + r.title + "” from the Records page? The Google Sheet itself is not touched.")) return;
    sb.from("record_sources").delete().eq("id", r.id).then(ok)
      .then(function () { toast("Removed."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }
  function editSource(r) {
    var isNew = !r;
    openForm({
      title: isNew ? "Add record sheet" : "Edit record sheet",
      values: r || {},
      saveLabel: isNew ? "Add" : "Save changes",
      fields: [
        { name: "title", label: "Heading on the page", required: true, placeholder: "Men's classic" },
        { name: "url", label: "Google Sheets link", type: "url", placeholder: "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv",
          help: "A Publish to web link (CSV) is best. A normal share link also works if the sheet is shared with “anyone with the link”. Leave blank to hide this table." }
      ],
      validate: function (v) {
        if (v.url && !Y.sheetCsvUrl(v.url)) return "That does not look like a usable link. It must start with https://";
        return null;
      },
      onSave: function (v) {
        var write = isNew
          ? sb.from("record_sources").select("sort_order").order("sort_order", { ascending: false }).limit(1).then(ok).then(function (x) {
              return sb.from("record_sources").insert({ title: v.title, url: v.url, sort_order: (x[0] ? x[0].sort_order : 0) + 10 });
            })
          : sb.from("record_sources").update({ title: v.title, url: v.url }).eq("id", r.id);
        return write.then(ok).then(function () {
          route();
          if (!v.url) return toast("Saved. With no link, this table stays hidden.");
          // Check the link really works, and say so straight away.
          Y.loadSheet(v.url).then(function (s) { toast("Saved. Read the sheet fine: " + s.rows.length + " rows."); })
            .catch(function (e) { toast("Saved, but the sheet could not be read: " + e.message, "error"); });
        });
      }
    });
  }

  // ---- users (admin only): the allow-list of people who can edit ----------------------
  function renderUsers(panel) {
    panel.replaceChildren(panelHead("Users", btn("Add user", function () { editUser(); }, "btn-primary")),
      el("div", { class: "panel-intro" },
        el("p", null, "Only the people listed here can change the website. ",
          el("strong", null, "Editors"), " can manage competitions, news, records, the organisation page and FAQs. ",
          el("strong", null, "Admins"), " can also add and remove users."),
        el("p", null, "To give someone access, add their email address here. They then go to this page and either continue with Google or choose “Create your login”, using that same email. Removing someone takes their access away straight away.")),
      el("p", null, "Loading…"));
    sb.from("editors").select("*").order("created_at", { ascending: true }).then(function (res) {
      var rows = ok(res);
      panel.lastChild.remove();
      var me = (state.user.email || "").toLowerCase();
      panel.appendChild(el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
        el("thead", null, el("tr", null, ["Email", "Name", "Role", "Actions"].map(function (h) { return el("th", { scope: "col" }, h); }))),
        el("tbody", null, rows.map(function (u) {
          var self = u.email === me;
          var actions = self ? el("span", { class: "empty" }, "This is you") : el("span", { class: "actions" },
            btn(u.role === "admin" ? "Make editor" : "Make admin", function () { setRole(u); }),
            btn("Remove", function () { removeUser(u); }, "btn-danger"));
          return el("tr", null,
            el("th", { scope: "row" }, u.email, self ? el("span", { class: "tag tag-open tag-you" }, "You") : null,
              u.added_by ? el("small", null, "Added by " + u.added_by) : null),
            el("td", null, u.display_name || "—"),
            el("td", null, u.role === "admin" ? "Admin" : "Editor"),
            el("td", null, actions));
        })))));
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }
  function setRole(u) {
    var next = u.role === "admin" ? "editor" : "admin";
    if (!window.confirm("Make " + u.email + " " + (next === "admin" ? "an admin? They will be able to add and remove users." : "an editor? They will no longer be able to manage users."))) return;
    sb.from("editors").update({ role: next }).eq("id", u.id).then(ok)
      .then(function () { toast("Role changed."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }
  function removeUser(u) {
    if (!window.confirm("Remove " + u.email + "? They will lose access straight away.")) return;
    sb.from("editors").delete().eq("id", u.id).then(ok)
      .then(function () { toast("User removed."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }
  function editUser() {
    openForm({
      title: "Add user", saveLabel: "Add user", values: { role: "editor" },
      fields: [
        { name: "email", label: "Email address", type: "email", required: true, help: "Must match the email they sign in with (their Google account, or the one they create a login with)." },
        { name: "display_name", label: "Name (optional)", help: "Shown as the author on their news posts." },
        { name: "role", label: "Role", type: "select", options: [{ value: "editor", label: "Editor: can edit the website" }, { value: "admin", label: "Admin: can also add and remove users" }] }
      ],
      validate: function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email) ? null : "Enter a valid email address."; },
      onSave: function (v) {
        return sb.from("editors").insert({ email: v.email.toLowerCase(), display_name: v.display_name, role: v.role, added_by: state.user.email || "" })
          .then(ok).then(function () { toast("Added. Ask them to sign in at this page with " + v.email.toLowerCase() + "."); route(); });
      }
    });
  }

  // ---- account --------------------------------------------------------------------
  function renderAccount(panel) {
    var nameErr = el("p", { class: "form-error", role: "alert", hidden: true });
    var name = el("input", { id: "acc-name", type: "text", value: state.name });
    var nameForm = el("form", { novalidate: true, class: "card" },
      el("h2", { style: "margin-top:0;" }, "Your details"),
      el("p", null, "Signed in as ", el("strong", null, state.user.email), "."),
      nameErr,
      el("div", { class: "field" }, el("label", { for: "acc-name" }, "Display name"),
        el("p", { class: "help" }, "Shown as the author on news posts you write."), name),
      el("button", { class: "btn btn-primary", type: "submit" }, "Save name"));
    nameForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = name.value.trim();
      nameErr.hidden = true;
      if (!v) { nameErr.textContent = "Display name is required."; nameErr.hidden = false; return; }
      sb.from("profiles").update({ display_name: v }).eq("id", state.user.id).select().then(ok).then(function (rows) {
        if (!rows.length) throw new Error("Your profile could not be found. Ask an administrator to check your account.");
        state.name = v; $("user-name").textContent = v; toast("Name saved.");
      }).catch(function (err) { nameErr.textContent = friendly(err); nameErr.hidden = false; });
    });

    var pErr = el("p", { class: "form-error", role: "alert", hidden: true });
    var p1 = el("input", { id: "acc-p1", type: "password", autocomplete: "new-password", minlength: "8" });
    var p2 = el("input", { id: "acc-p2", type: "password", autocomplete: "new-password", minlength: "8" });
    var passForm = el("form", { novalidate: true, class: "card" },
      el("h2", { style: "margin-top:0;" }, "Change password"), pErr,
      el("div", { class: "field" }, el("label", { for: "acc-p1" }, "New password"), el("p", { class: "help" }, "At least 8 characters."), p1),
      el("div", { class: "field" }, el("label", { for: "acc-p2" }, "Repeat new password"), p2),
      el("button", { class: "btn btn-primary", type: "submit" }, "Change password"));
    passForm.addEventListener("submit", function (e) {
      e.preventDefault();
      pErr.hidden = true;
      if (p1.value.length < 8) { pErr.textContent = "Use at least 8 characters."; pErr.hidden = false; return; }
      if (p1.value !== p2.value) { pErr.textContent = "The two passwords do not match."; pErr.hidden = false; return; }
      sb.auth.updateUser({ password: p1.value }).then(ok).then(function () {
        p1.value = ""; p2.value = ""; toast("Password changed.");
      }).catch(function (err) { pErr.textContent = friendly(err); pErr.hidden = false; });
    });

    panel.replaceChildren(panelHead("Account"), el("div", { style: "max-width:32rem;" }, nameForm, passForm));
  }

  // ---- shell, routing, auth ---------------------------------------------------------
  function panelHead(title, action) {
    return el("div", { class: "panel-head" }, el("h1", null, title), action || null);
  }

  var TABS = {
    competitions: renderCompetitions,
    news: renderNews,
    organisation: function (p) { renderGrouped(p, ORG); },
    messages: renderMessages,
    records: renderRecords,
    users: renderUsers,
    faqs: function (p) { renderGrouped(p, FAQ); },
    account: renderAccount
  };

  function route() {
    var tab = (location.hash || "").replace("#", "");
    if (!TABS[tab] || (tab === "users" && state.role !== "admin")) tab = "competitions";
    Array.prototype.forEach.call(document.querySelectorAll(".admin-tabs a"), function (a) {
      if (a.getAttribute("data-tab") === tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    TABS[tab]($("panel"));
    if (tab !== "messages") refreshMessageBadge();
  }
  window.addEventListener("hashchange", function () { if (state.user && state.role) route(); });

  var TITLES = { login: "Sign in", signup: "Create your login", reset: "Set a new password" };
  function showAuth(mode) {
    state.recovering = mode === "reset";
    state.role = null;
    show($("app"), false);
    show($("user-box"), false);
    show($("noaccess"), false);
    show($("auth"), true);
    show($("login-form"), mode === "login");
    show($("signup-form"), mode === "signup");
    show($("reset-form"), mode === "reset");
    show($("social"), mode !== "reset" && $("social").children.length > 0);
    $("auth-title").textContent = TITLES[mode];
  }

  function showApp(user) {
    if (state.recovering) return Promise.resolve();
    state.user = user;
    return sb.rpc("my_role").then(function (r) {
      state.role = r.error ? null : r.data;
      if (!state.role) {
        show($("auth"), false); show($("app"), false);
        $("noaccess-email").textContent = user.email || "";
        show($("noaccess"), true);
        show($("user-box"), true);
        $("user-name").textContent = user.email || "";
        return;
      }
      return sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle().then(function (res) {
        var fallback = (user.email || "").split("@")[0];
        state.name = (res.data && res.data.display_name) || fallback;
        $("user-name").textContent = state.name;
        show($("auth"), false); show($("noaccess"), false);
        show($("app"), true);
        show($("user-box"), true);
        show($("tab-users"), state.role === "admin");
        route();
      });
    });
  }

  function formError(id, msg) {
    var box = $(id);
    box.textContent = msg || "";
    box.hidden = !msg;
  }

  function boot() {
    if (!sb) {
      var w = $("setup-warning");
      w.hidden = false;
      w.appendChild(el("div", { class: "callout", role: "alert" },
        el("p", { class: "callout-title" }, "The editor is not connected yet"),
        el("p", { style: "margin:0;" }, "Add your Supabase project URL and anon key to assets/js/config.js, then reload this page.")));
      return;
    }

    var LABELS = { google: "Continue with Google", apple: "Continue with Apple" };
    ((window.YNEPF_CONFIG || {}).authProviders || []).forEach(function (p) {
      if (!LABELS[p]) return;
      $("social").appendChild(el("button", { type: "button", class: "btn btn-secondary", onclick: function () {
        sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.origin + location.pathname } }).then(function (res) {
          if (res.error) formError("auth-error", friendly(res.error));
        });
      } }, LABELS[p]));
    });
    if ($("social").children.length) $("social").appendChild(el("div", { class: "divider", "aria-hidden": "true" }, "or use your email"));

    $("to-signup").addEventListener("click", function () { formError("signup-error", ""); showAuth("signup"); $("su-email").value = $("email").value; });
    $("to-login").addEventListener("click", function () { showAuth("login"); });
    $("noaccess-out").addEventListener("click", function () { sb.auth.signOut(); });
    $("signup-form").addEventListener("submit", function (e) {
      e.preventDefault();
      formError("signup-error", ""); $("signup-info").hidden = true;
      var name = $("su-name").value.trim(), email = $("su-email").value.trim(), pass = $("su-pass").value;
      if (!email) return formError("signup-error", "Enter your email address.");
      if (pass.length < 8) return formError("signup-error", "Use at least 8 characters for your password.");
      sb.auth.signUp({ email: email, password: pass, options: { data: { display_name: name }, emailRedirectTo: location.origin + location.pathname } })
        .then(function (res) {
          if (res.error) return formError("signup-error", friendly(res.error));
          if (res.data && res.data.session) return; // confirmed already: the auth listener takes over
          var info = $("signup-info");
          info.textContent = "Nearly there. We have emailed you a link: open it to confirm your address, then sign in. If you already had a login, use “Forgotten your password?” instead.";
          info.hidden = false;
        });
    });

    $("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      formError("auth-error", "");
      var email = $("email").value.trim(), pass = $("password").value;
      if (!email || !pass) return formError("auth-error", "Enter your email and password.");
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        if (res.error) formError("auth-error", "That email and password do not match.");
      });
    });
    $("forgot").addEventListener("click", function () {
      formError("auth-error", "");
      var email = $("email").value.trim();
      if (!email) return formError("auth-error", "Enter your email above first, then choose “Forgotten your password?”.");
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (res) {
        if (res.error) formError("auth-error", friendly(res.error));
        else toast("If that email has an account, a reset link is on its way.");
      });
    });
    $("reset-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var p = $("new-pass").value;
      if (p.length < 8) return formError("reset-error", "Use at least 8 characters.");
      sb.auth.updateUser({ password: p }).then(function (res) {
        if (res.error) return formError("reset-error", friendly(res.error));
        $("new-pass").value = "";
        history.replaceState(null, "", location.pathname);
        state.recovering = false;
        sb.auth.getSession().then(function (r) { if (r.data.session) showApp(r.data.session.user); });
        toast("Password saved.");
      });
    });
    $("signout").addEventListener("click", function () {
      sb.auth.signOut().then(function () { location.hash = ""; });
    });

    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "PASSWORD_RECOVERY") { state.user = null; return showAuth("reset"); }
      if (event === "SIGNED_OUT" || !session) { state.user = null; return showAuth("login"); }
      // Defer: the client must not be called from inside this callback.
      if (!state.recovering && (!state.user || state.user.id !== session.user.id)) setTimeout(function () { showApp(session.user); }, 0);
    });
    sb.auth.getSession().then(function (res) {
      if (!res.data.session && !state.user) showAuth("login");
    });
  }

  boot();
})();
