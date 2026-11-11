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
  var state = { user: null, name: "", role: null, recovering: false, shownFor: null };

  // ---- small utilities --------------------------------------------------------
  function ok(res) { if (res.error) throw res.error; return res.data; }
  function friendly(err) {
    if (err && err.code === "23505") return "That value is already used somewhere else (for example a web address or an email). Change it and try again.";
    if (err && /entries_competition_id_fkey|violates foreign key constraint/i.test(err.message || ""))
      return "This competition has entries, so it cannot be deleted: we have to keep payment records. To take it off the website, open it and untick “Show on the website”. (A TEST competition can be cleared by an administrator in the database.)";
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
    return el("button", Object.assign({ type: "button", class: "btn btn-sm " + (cls || "btn-ghost"), onclick: onclick }, extra || {}), label);
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
    if (opt.intro) form.appendChild(el("p", { class: "panel-intro" }, opt.intro));
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

  // ---- pictures in posts ----------------------------------------------------------
  // "Add image": choose or drop a picture, it is shrunk in the browser, the editor describes it (alt text is
  // required), and it is uploaded to the public news-images bucket. It then sits in the post at the width of
  // the text. Pasting or dropping a picture straight into the editor opens the same step.
  var IMG_BUCKET = "news-images", IMG_MAX_WIDTH = 1600;
  function fileSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

  // Never wider than 1600px (never scaled up), re-saved as WebP (or JPEG where the browser cannot), which also
  // drops camera metadata such as the location. Resolves to { blob, width, height, ext }.
  function shrinkImage(file, maxWidth) {
    if (!/^image\//.test(file.type || "")) return Promise.reject(new Error("That file is not a picture. Try a JPG, PNG or WebP."));
    if (file.size > 30 * 1048576) return Promise.reject(new Error("That picture is very large (over 30 MB). Try a smaller one."));
    var make = window.createImageBitmap ? window.createImageBitmap(file, { imageOrientation: "from-image" }) : Promise.reject(new Error("x"));
    return make.catch(function () { throw new Error("That picture could not be read. Try saving it as a JPG or PNG first."); })
      .then(function (bmp) {
        var scale = Math.min(1, (maxWidth || IMG_MAX_WIDTH) / bmp.width);
        var w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(bmp, 0, 0, w, h);
        if (bmp.close) bmp.close();
        function toBlob(type, q) { return new Promise(function (res) { canvas.toBlob(res, type, q); }); }
        return toBlob("image/webp", 0.8).then(function (b) {
          if (b && b.type === "image/webp") return { blob: b, width: w, height: h, ext: "webp" };
          // This browser cannot write WebP: JPEG on a white background (JPEG has no transparency).
          ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
          return toBlob("image/jpeg", 0.82).then(function (j) { return { blob: j, width: w, height: h, ext: "jpg" }; });
        });
      });
  }

  // Uploads every size of one picture (opts.widths gives them, largest first) and resolves to their public addresses.
  function uploadImage(sizes, alt, opts) {
    opts = opts || {};
    var now = new Date(), rand = Math.random().toString(36).slice(2, 8), bucket = sb.storage.from(opts.bucket || IMG_BUCKET);
    var folder = (opts.folder ? opts.folder + "/" : "") + now.getUTCFullYear() + "/" + ("0" + (now.getUTCMonth() + 1)).slice(-2) + "/";
    return Promise.all(sizes.map(function (shrunk) {
      var name = (slugify(alt).slice(0, 40) || "picture") + "-" + rand + "-" + shrunk.width + "x" + shrunk.height + "." + shrunk.ext;
      return bucket.upload(folder + name, shrunk.blob, { contentType: shrunk.blob.type, cacheControl: "31536000", upsert: false }).then(function (res) {
        if (res.error) throw res.error;
        return bucket.getPublicUrl(folder + name).data.publicUrl;
      });
    }));
  }

  // Resolves to { url, alt } once the picture is uploaded (plus smallUrl when opts.widths has two sizes), or null if the
  // editor cancels. opts: title, bucket, folder, widths (default one size, 1600px), frame (preview how it crops on the home page).
  function imageDialog(initialFile, opts) {
    opts = opts || {};
    var widths = opts.widths || [IMG_MAX_WIDTH];
    return new Promise(function (resolve) {
      var dlg = el("dialog", { class: "admin-dialog img-dialog", "aria-labelledby": "img-title" });
      var shrunk = null, busy = false, token = 0;
      var err = el("p", { class: "form-error", role: "alert", hidden: true });
      var info = el("p", { class: "help", role: "status", id: "img-info" });
      var preview = el("img", { class: "img-preview" + (opts.frame ? " img-frame" : ""), alt: "", hidden: true });
      var fileInput = el("input", { type: "file", accept: "image/*", id: "img-file", class: "visually-hidden" });
      var drop = el("label", { class: "img-drop", for: "img-file" }, el("strong", null, "Choose a picture"), " or drop one here");
      var alt = el("input", { type: "text", id: "img-alt", maxlength: "200", autocomplete: "off", "aria-describedby": "img-alt-help", required: true });
      var add = el("button", { class: "btn btn-primary", type: "submit", disabled: true }, "Add image");
      var cancel = el("button", { class: "btn btn-secondary", type: "button" }, "Cancel");
      var form = el("form", { novalidate: true },
        el("h2", { id: "img-title" }, opts.title || "Add an image"),
        err,
        el("div", { class: "field" }, fileInput, drop, preview, info),
        el("div", { class: "field" }, el("label", { for: "img-alt" }, "Describe the picture"),
          el("p", { class: "help", id: "img-alt-help" }, "A few words for people who cannot see it, for example “Lifters warming up before the first flight”. Required."), alt),
        el("div", { class: "dialog-actions" }, add, cancel));
      dlg.appendChild(form);
      document.body.appendChild(dlg);

      function done(v) { if (dlg.open) dlg.close(); dlg.remove(); resolve(v); }
      function showErr(m) { err.textContent = m || ""; err.hidden = !m; }
      function refresh() { add.disabled = busy || !shrunk || !alt.value.trim(); }
      function take(file) {
        if (!file) return;
        var mine = ++token;
        shrunk = null; showErr(""); preview.hidden = true; info.textContent = "Preparing the picture…"; refresh();
        Promise.all(widths.map(function (w) { return shrinkImage(file, w); })).then(function (all) {
          if (mine !== token) return;
          var s = all[0];
          shrunk = all;
          if (preview.src) URL.revokeObjectURL(preview.src);
          preview.src = URL.createObjectURL(s.blob); preview.hidden = false;
          info.textContent = file.name + ": shrunk from " + fileSize(file.size) + " to " + fileSize(all.reduce(function (n, x) { return n + x.blob.size; }, 0)) +
            " (" + s.width + " × " + s.height + (all.length > 1 ? ", plus a smaller copy for phones" : "") + ")." +
            (opts.frame ? " The home page shows it in a nearly square frame, cropped evenly from the centre, as in the preview." : "");
          refresh(); alt.focus();
        }).catch(function (e) { if (mine !== token) return; info.textContent = ""; showErr(e.message); refresh(); });
      }
      fileInput.addEventListener("change", function () { take(fileInput.files[0]); });
      ["dragenter", "dragover"].forEach(function (n) { dlg.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
      ["dragleave", "drop"].forEach(function (n) { dlg.addEventListener(n, function () { drop.classList.remove("over"); }); });
      dlg.addEventListener("drop", function (e) { e.preventDefault(); take(e.dataTransfer && e.dataTransfer.files[0]); });
      alt.addEventListener("input", refresh);
      cancel.addEventListener("click", function () { if (!busy) done(null); });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); if (!busy) done(null); });   // Esc
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (busy || !shrunk) return;
        if (!alt.value.trim()) { showErr("Describe the picture in a few words, so people using screen readers know what it shows."); alt.focus(); return; }
        busy = true; showErr(""); add.textContent = "Uploading…"; refresh();
        uploadImage(shrunk, alt.value.trim(), opts).then(function (urls) { done({ url: urls[0], smallUrl: urls[1] || "", alt: alt.value.trim() }); })
          .catch(function (ex) { busy = false; add.textContent = "Add image"; refresh(); showErr("The picture could not be uploaded. " + friendly(ex)); });
      });
      dlg.showModal();
      if (initialFile) take(initialFile); else fileInput.focus();
    });
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
        var links = ["table", "link"], opts = {};
        if (f.images) {
          // Pictures (news posts): our own "Add image" step, from the toolbar or by pasting or dropping a picture.
          var imgBtn = el("button", { type: "button", class: "toastui-editor-toolbar-icons image", "aria-label": "Add image", style: "margin:0" });
          imgBtn.addEventListener("click", function () {
            imageDialog(null).then(function (r) { if (r) { ed.focus(); ed.exec("addImage", { imageUrl: r.url, altText: r.alt }); } });
          });
          links = ["table", "link", { name: "image", tooltip: "Add image", el: imgBtn }];
          opts.hooks = { addImageBlobHook: function (blob, callback) { imageDialog(blob).then(function (r) { if (r) callback(r.url, r.alt); }); } };
        }
        ed = new window.toastui.Editor(Object.assign({
          el: host, height: "380px", initialEditType: "wysiwyg", previewStyle: "tab",
          initialValue: value || "", usageStatistics: false, autofocus: false,
          toolbarItems: [["heading", "bold", "italic", "strike"], ["ul", "ol"], ["quote", "hr"], links, ["code"]]
        }, opts));
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
      var htmlType = { datetime: "datetime-local", url: "url", email: "email", number: "number", date: "date", time: "time" }[type] || "text";
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

  // ---- calendar: competitions, events and their entries in one place --------------------
  // The list, then a full page for each item (no pop-ups). A competition page has two tabs: Details (everything,
  // entered once) and Entries (who has entered). Routes: #competitions, #competitions/new, #competitions/new-event,
  // #competitions/<id>, #competitions/<id>/entries.
  var STATE_LABEL = { archived: "Past", open: "Entry open", closed: "Entry closed", full: "Entries full", soon: "Entry not open yet", none: "No entry set" };
  var ENTRY_ERRORS = {
    "invalid:events": "Choose at least one event.", "invalid:equipment": "Choose at least one kind of equipment.",
    "invalid:hold_minutes": "The hold must be between 5 and 30 minutes.",
    "invalid:price_full_power": "Set a full power price of more than £0.", "invalid:price_bench_only": "Set a bench only price of more than £0.",
    "invalid:price_sub_junior": "The sub-junior price must be more than £0, or left empty.", "invalid:capacity": "Set the number of spaces first.",
    forbidden: "You do not have permission to change entry settings."
  };
  function pence(v) { return v === null || v === "" || v === undefined ? null : Math.round(Number(v) * 100); }
  function poundsInput(p) { return p === null || p === undefined ? "" : (p / 100).toFixed(2); }
  function entryMoney(p) { return "£" + (p / 100).toFixed(p % 100 ? 2 : 0); }
  function canComp() { return state.role === "admin" || state.role === "editor"; }      // the competition itself
  function canEntry() { return state.role === "admin" || state.role === "entries"; }    // online entry settings and entries
  function go(hash) { location.hash = hash; }
  function backLink() { return el("p", null, el("a", { href: "#competitions" }, "← Back to the calendar")); }

  function renderCompetitions(panel, args) {
    args = args || [];
    if (!args[0]) return renderCalendarList(panel);
    if (args[0] === "new" || args[0] === "new-event") {
      if (!canComp()) return panel.replaceChildren(panelHead("Calendar"), el("p", null, "You do not have permission to add to the calendar."), backLink());
      return renderEditor(panel, null, args[0] === "new-event" ? "event" : "competition", "details");
    }
    panel.replaceChildren(el("p", null, "Loading…"));
    sb.from("competitions").select("*").eq("id", args[0]).maybeSingle().then(function (res) {
      var c = ok(res);
      if (!c) return panel.replaceChildren(panelHead("Not found"), el("p", null, "That item no longer exists."), backLink());
      renderEditor(panel, c, c.kind === "event" ? "event" : "competition", args[1] === "entries" ? "entries" : "details");
    }).catch(function (e) { panel.replaceChildren(el("p", { class: "form-error" }, friendly(e)), backLink()); });
  }

  function renderCalendarList(panel) {
    panel.replaceChildren(panelHead("Calendar", canComp() ? el("span", { class: "actions" },
        btn("Add competition", function () { go("#competitions/new"); }, "btn-primary"),
        btn("Add another event", function () { go("#competitions/new-event"); }, "btn-secondary")) : null),
      el("p", { class: "panel-intro" }, "Competitions and other events (AGMs, referee courses and so on) all show on the Calendar. Open a competition to set it up once: details, places, when entry opens and closes, prices, and who has entered."),
      el("p", null, "Loading…"));
    Promise.all([
      sb.from("competitions").select("*").order("start_date", { ascending: true }),
      sb.from("entries").select("competition_id,status,hold_expires_at").then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; })
    ]).then(function (res) {
      var rows = ok(res[0]), entries = res[1], now = Date.now();
      function taken(c) {
        return entries.filter(function (e) { return e.competition_id === c.id && (e.status === "paid" || e.status === "comped" || (e.status === "held" && new Date(e.hold_expires_at) > now)); }).length;
      }
      var current = rows.filter(function (c) { return Y.compState(c) !== "archived"; });
      var past = rows.filter(function (c) { return Y.compState(c) === "archived"; }).reverse();
      panel.lastChild.remove();
      panel.appendChild(el("h2", null, "Upcoming"));
      panel.appendChild(current.length ? compTable(current, taken) : el("p", { class: "empty" }, "Nothing upcoming."));
      if (past.length) { panel.appendChild(el("h2", null, "Past")); panel.appendChild(compTable(past, taken)); }
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }

  function compTable(rows, taken) {
    return el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
      el("thead", null, el("tr", null, ["Name", "Date", "Entry", "Actions"].map(function (h) { return el("th", { scope: "col" }, h); }))),
      el("tbody", null, rows.map(function (c) {
        var st = Y.compState(c), online = c.entry_method === "yne";
        var actions = el("span", { class: "actions" }, el("a", { class: "btn btn-secondary btn-sm", href: "#competitions/" + c.id }, "Edit", el("span", { class: "visually-hidden" }, " " + c.name)));
        if (canComp()) actions.appendChild(btn("Delete", function () { removeCompetition(c); }, "btn-danger"));
        return el("tr", null,
          el("th", { scope: "row" }, el("a", { href: "#competitions/" + c.id }, c.name), c.kind === "event" ? [" ", el("span", { class: "tag tag-event" }, "Event")] : null, !c.published ? [" ", el("span", { class: "tag tag-position" }, "Draft")] : null,
            c.venue_name ? el("small", null, c.venue_name) : null),
          el("td", null, Y.dateRange(c.start_date, c.end_date), Y.timeRange(c) ? el("small", null, Y.timeRange(c)) : null),
          el("td", null, c.kind === "event" ? "—" : STATE_LABEL[st],
            Y.entryWindow(c) ? el("small", null, Y.entryWindow(c)) : null,
            online ? el("small", null, taken(c) + " of " + (c.capacity || "?") + " places taken (online entry)") : null),
          el("td", null, actions));
      }))));
  }

  function removeCompetition(c) {
    if (!window.confirm("Delete “" + c.name + "”? This cannot be undone.")) return;
    sb.from("competitions").delete().eq("id", c.id).then(ok)
      .then(function () { toast(c.kind === "event" ? "Event deleted." : "Competition deleted."); if (/#competitions\//.test(location.hash)) go("#competitions"); else route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }

  // A form drawn straight onto the page from a list of fields. Fields may have a `heading` (a section), `show(values)`
  // (hide unless true) and `info(values)` (a line of live text). Returns accessors like openForm does.
  function pageForm(fields, values) {
    var controls = {}, editors = [], wrap = el("div"), grid = null, rules = [];
    fields.forEach(function (f) {
      if (f.heading) { grid = null; wrap.appendChild(el("h2", { class: "form-section" }, f.heading)); if (f.note) wrap.appendChild(el("p", { class: "help" }, f.note)); return; }
      var node;
      if (f.info) {
        node = el("p", { class: "help", role: "status" });
        rules.push({ f: f, node: node });
        grid = null; wrap.appendChild(node); return;
      }
      var c = makeControl(f, values[f.name], editors);
      controls[f.name] = c; node = c.wrap;
      if (f.show) rules.push({ f: f, node: node });
      if (f.half) { if (!grid || !grid.parentNode) { grid = el("div", { class: "form-grid" }); wrap.appendChild(grid); } grid.appendChild(node); }
      else { grid = null; wrap.appendChild(node); }
    });
    function get(n) { return controls[n].get(); }
    function all() { var o = {}; Object.keys(controls).forEach(function (k) { o[k] = controls[k].get(); }); return o; }
    function refresh() {
      var v = all();
      rules.forEach(function (r) {
        if (r.f.info) { var t = r.f.info(v); r.node.textContent = t || ""; r.node.hidden = !t || (r.f.show && !r.f.show(v)); }
        else r.node.hidden = !r.f.show(v);
      });
    }
    wrap.addEventListener("input", refresh); wrap.addEventListener("change", refresh);
    refresh();
    return { el: wrap, controls: controls, get: get, set: function (n, x) { controls[n].set(x); refresh(); }, input: function (n) { return controls[n].input; }, values: all, refresh: refresh };
  }

  // Entry opens/closes: "the usual", "so many days before", or an exact date and time. Stored as exact times.
  var USUAL = { open: { days: 56, time: "09:00", label: "8 weeks before, at 9am (the usual)" }, close: { days: 21, time: "12:00", label: "3 weeks before, at noon (the usual)" } };
  function windowTime(v, which) {
    var m = v[which + "_mode"], start = v.start_date;
    if (m === "date") return v["entry_" + which + "s"] || "";
    if (!start) return "";
    if (m === "usual") return Y.addDays(start, -USUAL[which].days) + "T" + USUAL[which].time;
    var n = Number(v[which + "_days"]);
    return isNaN(n) || v[which + "_days"] === null ? "" : Y.addDays(start, -n) + "T" + (v[which + "_time"] || USUAL[which].time);
  }
  function whenText(local) {
    if (!local) return "";
    return new Date(Y.fromLondonInput(local)).toLocaleString("en-GB", { timeZone: Y.TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function renderEditor(panel, c, kind, tab) {
    var isNew = !c, isEvent = kind === "event";
    c = c || {};
    var role = state.role;
    var online = c.entry_method === "yne";
    var title = isNew ? (isEvent ? "Add another event" : "Add competition") : c.name;
    var head = panelHead(title, !isNew && canComp() ? btn("Delete", function () { removeCompetition(c); }, "btn-danger") : null);
    var view = el("div");
    panel.replaceChildren(backLink(), head);
    if (!isNew && !isEvent) {
      var tabs = el("nav", { class: "admin-tabs subtabs", "aria-label": c.name }, el("a", { href: "#competitions/" + c.id, "aria-current": tab === "details" ? "page" : null }, "Details"));
      if (canEntry()) tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/entries", "aria-current": tab === "entries" ? "page" : null }, "Entries"));
      panel.appendChild(tabs);
    }
    panel.appendChild(view);
    if (tab === "entries" && !isNew && !isEvent) return renderEntriesTab(view, c);
    return isEvent ? renderEventForm(view, c, isNew) : renderCompetitionForm(view, c, isNew);
  }

  function saveBar(onSave, label) {
    var errBox = el("p", { class: "form-error", role: "alert", hidden: true });
    var save = el("button", { class: "btn btn-primary", type: "submit" }, label);
    var bar = el("div", { class: "save-bar" }, errBox, el("div", { class: "actions" }, save,
      el("a", { class: "btn btn-secondary", href: "#competitions" }, "Cancel")));
    return {
      el: bar,
      fail: function (m, focusEl) { errBox.textContent = m; errBox.hidden = false; errBox.scrollIntoView({ block: "nearest" }); if (focusEl && focusEl.focus) focusEl.focus(); },
      clear: function () { errBox.hidden = true; },
      busy: function (b) { save.disabled = b; }
    };
  }

  function renderCompetitionForm(view, c, isNew) {
    var onlyEntry = !canComp() && canEntry();
    var usualOpen = c.start_date && Y.toLondonInput(c.entry_opens) === Y.addDays(c.start_date, -56) + "T09:00";
    var usualClose = c.start_date && Y.toLondonInput(c.entry_closes) === Y.addDays(c.start_date, -21) + "T12:00";
    var rules = [];
    var settings = {}, prices = [];
    function fields() {
      var E = function (o) { return Object.assign({ owner: "entry" }, o); }, C = function (o) { return Object.assign({ owner: "comp" }, o); };
      var isOnline = function (v) { return v.method === "online"; };
      var windowFields = function (which, noun) {
        return [
          C({ name: which + "_mode", label: "Entry " + (which === "open" ? "opens" : "closes"), type: "select", options: [
            { value: "usual", label: USUAL[which].label }, { value: "days", label: "A number of days before the competition" }, { value: "date", label: "On a date and time I choose" }] }),
          C({ name: which + "_days", label: "Days before the first day", type: "number", min: "0", half: true, show: function (v) { return v[which + "_mode"] === "days"; } }),
          C({ name: which + "_time", label: "At (UK time)", type: "time", half: true, show: function (v) { return v[which + "_mode"] === "days"; } }),
          C({ name: "entry_" + which + "s", label: "Date and time (UK time)", type: "datetime", show: function (v) { return v[which + "_mode"] === "date"; } }),
          { info: function (v) { var t = windowTime(v, which); return t ? "Entry " + (which === "open" ? "opens " : "closes ") + whenText(t) + (which === "open" ? ". Priority entry opens one day earlier, on " + whenText(Y.addDays(t.slice(0, 10), -1) + t.slice(10)) + "." : ".") : "Set the first day to see the " + noun + " time."; } }
        ];
      };
      return [].concat([
        { heading: "The competition" },
        C({ name: "name", label: "Name", required: true }),
        C({ name: "label", label: "Tag (optional)", help: "A small label next to the name, for example “Sponsor TBD”.", half: true }),
        C({ name: "slug", label: "Web address ending", help: "Made from the year and name if you leave it blank. Lower case letters, numbers and hyphens only. It is also the end of the entry and lifting order addresses.", half: true }),
        C({ name: "description", label: "Description", type: "textarea", rows: 5, help: "Plain text. Start lines with “- ” for bullet points. Links look like [text](https://…)." }),
        { heading: "When and where" },
        C({ name: "start_date", label: "First day", type: "date", required: true, half: true }),
        C({ name: "end_date", label: "Last day (if more than one day)", type: "date", half: true }),
        C({ name: "venue_name", label: "Venue", help: "Shown on the page and linked to Google Maps.", half: true }),
        C({ name: "venue_address", label: "Address or postcode (optional)", help: "Makes the Maps link more accurate.", half: true }),
        C({ name: "map_url", label: "Custom map link (optional)", type: "url", help: "Only needed if the automatic Google Maps link is wrong." }),
        { heading: "Entry", note: "Set the places, when entry opens and closes, and how people enter, all here." },
        E({ name: "method", label: "How are entries taken?", type: "select", options: [
          { value: "online", label: "On this website, paid by card" }, { value: "link", label: "Somewhere else (a link)" }, { value: "none", label: "Not taking entries yet" }] }),
        C({ name: "capacity", label: "Number of spaces", type: "number", min: "0", help: "This is the stock: online entry stops when they are gone." })
      ], windowFields("open", "opening"), windowFields("close", "closing"), [
        C({ name: "entry_url", label: "Entry link", type: "url", placeholder: "https://…", show: function (v) { return v.method === "link"; }, help: "Goes live on the website when entry opens and is hidden when entry closes." }),
        { heading: "Online entry", note: "Only for entry taken on this website.", show: isOnline },
        E({ name: "ev_full", label: "Offer full power", type: "checkbox", half: true, show: isOnline }),
        E({ name: "ev_bench", label: "Offer bench only", type: "checkbox", half: true, show: isOnline }),
        E({ name: "eq_classic", label: "Offer classic", type: "checkbox", half: true, show: isOnline }),
        E({ name: "eq_equipped", label: "Offer equipped", type: "checkbox", half: true, show: isOnline }),
        E({ name: "p_full", label: "Full power price (£)", type: "number", min: "0", half: true, show: isOnline }),
        E({ name: "p_bench", label: "Bench only price (£)", type: "number", min: "0", half: true, show: isOnline }),
        E({ name: "p_sj", label: "Sub-junior price, any event (£, optional)", type: "number", min: "0", show: isOnline, help: "If set, sub-juniors pay this whatever they lift." }),
        E({ name: "openipf_required", label: "Entry needs a qualifying total (the OpenIPF link becomes mandatory)", type: "checkbox", show: isOnline }),
        E({ name: "hold_minutes", label: "Minutes a place is held while paying", type: "number", min: "5", show: isOnline, help: "Between 5 and 30. A short hold stops places being parked." }),
        { heading: "Full, closed and waiting list" },
        C({ name: "entries_full", label: "Entries full", type: "checkbox", help: "Tick when the competition fills up. The main button becomes “Join the waiting list” (if you add a link below)." }),
        E({ name: "entries_closed_manually", label: "Close entries now", type: "checkbox", show: isOnline, help: "Stops new online entries straight away. Untick to reopen." }),
        C({ name: "waitlist_url", label: "Waiting list link (Google Form)", type: "url", placeholder: "https://forms.gle/…", help: "Only shown on the website while entries are marked full." }),
        { heading: "Lifting order and results" },
        C({ name: "lifting_order_url", label: "Lifting order sheet (optional)", type: "url", placeholder: "https://docs.google.com/spreadsheets/d/e/…/pub?output=csv",
          help: "Add it a few days after entries open: a “View lifting order” button appears once it is here, and the page follows the sheet as you edit it. Use a published Google Sheet (File > Share > Publish to web > CSV), one row per lifter. Needs columns Day, Session, Flight and Name. Optional: Club, Instagram, Age class (blank = Open, otherwise J, SJ, M1, M2, M3 or M4), Class (for example M66), GLP, Total, Open IPF, and per session Weigh-in, Lift off and Session name. Only columns with something in them are shown." }),
        C({ name: "openipf_url", label: "OpenIPF results link (optional)", type: "url", placeholder: "https://www.openipf.org/…", help: "Add this after the competition, once results are on OpenIPF." }),
        { heading: "On the website" },
        C({ name: "published", label: "Show on the website", type: "checkbox", help: "Untick to keep it as a draft. A draft can still be tried by signed-in entries staff." })
      ]);
    }
    function load() {
      if (isNew) return Promise.resolve();
      return Promise.all([
        sb.from("entry_settings").select("*").eq("competition_id", c.id).maybeSingle().then(function (r) { return r.error ? null : r.data; }, function () { return null; }),
        sb.from("price_rules").select("*").eq("competition_id", c.id).then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; })
      ]).then(function (r) { settings = r[0] || {}; prices = r[1] || []; });
    }
    view.replaceChildren(el("p", null, "Loading…"));
    load().then(function () {
      function price(match) { var r = prices.filter(match)[0]; return r ? poundsInput(r.price_pence) : ""; }
      var events = settings.events || ["full_power", "bench_only"], equip = settings.equipment || ["classic", "equipped"];
      var values = Object.assign({}, c, {
        published: isNew ? false : c.published,
        method: c.entry_method === "yne" ? "online" : c.entry_url ? "link" : "none",
        open_mode: isNew || usualOpen ? "usual" : c.entry_opens ? "date" : "usual", open_days: 56, open_time: "09:00", entry_opens: Y.toLondonInput(c.entry_opens),
        close_mode: isNew || usualClose ? "usual" : c.entry_closes ? "date" : "usual", close_days: 21, close_time: "12:00", entry_closes: Y.toLondonInput(c.entry_closes),
        ev_full: events.indexOf("full_power") >= 0, ev_bench: events.indexOf("bench_only") >= 0,
        eq_classic: equip.indexOf("classic") >= 0, eq_equipped: equip.indexOf("equipped") >= 0,
        p_full: price(function (r) { return r.event === "full_power" && !r.age_category; }), p_bench: price(function (r) { return r.event === "bench_only" && !r.age_category; }),
        p_sj: price(function (r) { return r.age_category === "SJ"; }),
        openipf_required: settings.openipf_mode === "required", hold_minutes: settings.hold_minutes || 5,
        entries_closed_manually: !!c.entries_closed_manually
      });
      var F = fields();
      var form = pageForm(F, values);
      var bar = saveBar(null, isNew ? "Add competition" : "Save changes");
      // Each person can change only their part: editors the competition, the entries team the online entry settings.
      F.forEach(function (f) {
        if (!f.name || !form.controls[f.name]) return;
        var allowed = f.owner === "comp" ? canComp() : canEntry();
        if (!allowed) form.controls[f.name].input.disabled = true;
      });
      var note = null;
      if (onlyEntry) note = "You can change the online entry settings (how entries are taken, events, prices, closing entries). The rest is looked after by the editors.";
      else if (!canEntry()) note = "You can change the competition details. The online entry settings (how entries are taken, prices) are looked after by the entries team.";
      var formEl = el("form", { novalidate: true }, note ? el("p", { class: "callout" }, note) : null, form.el, bar.el);
      view.replaceChildren(formEl);

      // New competition: suggest the web address from the year and name.
      if (isNew) {
        var slugTouched = false;
        form.input("slug").addEventListener("input", function () { slugTouched = true; });
        var suggest = function () { if (slugTouched) return; var d = form.get("start_date"), n = form.get("name"); form.set("slug", n ? slugify((d ? d.slice(0, 4) + " " : "") + n) : ""); };
        form.input("name").addEventListener("input", suggest); form.input("start_date").addEventListener("change", suggest);
      }

      formEl.addEventListener("submit", function (e) {
        e.preventDefault(); bar.clear();
        var v = form.values();
        var opens = windowTime(v, "open"), closes = windowTime(v, "close");
        var problem = null;
        if (canComp()) {
          if (v.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) problem = "The web address can only use lower case letters, numbers and hyphens.";
          else if (v.end_date && v.end_date < v.start_date) problem = "The last day cannot be before the first day.";
          else if (opens && closes && closes <= opens) problem = "Entry must close after it opens.";
          else if (v.method === "link" && !v.entry_url) problem = "Add the entry link, or choose another way of taking entries.";
          else if (v.entry_url && !/^https?:\/\//i.test(v.entry_url)) problem = "The entry link must start with https://";
          else if (v.map_url && !/^https?:\/\//i.test(v.map_url)) problem = "The map link must start with https://";
          else if (v.openipf_url && !/^https:\/\//i.test(v.openipf_url)) problem = "The OpenIPF link must start with https://";
          else if (v.waitlist_url && !/^https:\/\//i.test(v.waitlist_url)) problem = "The waiting list link must start with https://";
          else if (v.lifting_order_url && !Y.sheetCsvUrl(v.lifting_order_url)) problem = "The lifting order link does not look usable. It must start with https://";
          else if (!v.name) problem = "Name is required.";
          else if (!v.start_date) problem = "The first day is required.";
        }
        if (problem) return bar.fail(problem);
        bar.busy(true);
        var row = {
          name: v.name, slug: v.slug, description: v.description, label: v.label, start_date: v.start_date, end_date: v.end_date || null,
          venue_name: v.venue_name, venue_address: v.venue_address, map_url: v.map_url, openipf_url: v.openipf_url,
          capacity: v.capacity, entry_url: v.method === "link" ? v.entry_url : "",
          entry_opens: opens ? Y.fromLondonInput(opens) : null, entry_closes: closes ? Y.fromLondonInput(closes) : null,
          entries_full: v.entries_full, waitlist_url: v.waitlist_url, lifting_order_url: v.lifting_order_url, published: v.published
        };
        var step = Promise.resolve(c.id);
        if (canComp()) {
          var q = isNew ? sb.from("competitions").insert(row).select("id").single() : sb.from("competitions").update(row).eq("id", c.id);
          step = q.then(ok).then(function (d) { return isNew ? (Array.isArray(d) ? d[0] : d).id : c.id; });
        }
        step.then(function (id) {
          if (!canEntry()) return id;
          var p = {
            entry_method: v.method === "online" ? "yne" : "external", hold_minutes: v.hold_minutes || 5, entries_closed_manually: !!v.entries_closed_manually,
            openipf_required: !!v.openipf_required,
            events: [v.ev_full && "full_power", v.ev_bench && "bench_only"].filter(Boolean), equipment: [v.eq_classic && "classic", v.eq_equipped && "equipped"].filter(Boolean),
            prices: { full_power: pence(v.p_full), bench_only: pence(v.p_bench), sub_junior: pence(v.p_sj) }
          };
          return sb.rpc("save_entry_settings", { c: id, p: p }).then(function (r) {
            if (r.error) { var m = (r.error.message || "").trim(); throw new Error(ENTRY_ERRORS[m] || friendly(r.error)); }
            return id;
          });
        }).then(function (id) {
          toast(isNew ? "Competition added." : "Saved.");
          if (v.lifting_order_url && v.lifting_order_url !== c.lifting_order_url) {
            Y.loadSheet(v.lifting_order_url).then(function (s) {
              var r = Y.parseLiftingOrder(s);
              toast("Lifting order read fine: " + r.lifters.length + " lifters in " + r.flightCount + " flights." +
                (r.warnings.length ? " Check: " + r.warnings.slice(0, 3).join("; ") + (r.warnings.length > 3 ? " (and " + (r.warnings.length - 3) + " more)" : "") + "." : ""), r.warnings.length ? "error" : undefined);
            }).catch(function (er) { toast("Saved, but the lifting order could not be read: " + er.message, "error"); });
          }
          if (isNew) go("#competitions/" + id); else route();
        }).catch(function (err) { bar.busy(false); bar.fail(friendly(err)); });
      });
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  // Other calendar events: AGMs, EGMs, referee courses... No entry, waiting list or results.
  function renderEventForm(view, c, isNew) {
    var values = Object.assign({}, c, {
      start_time: c.start_time ? String(c.start_time).slice(0, 5) : "", end_time: c.end_time ? String(c.end_time).slice(0, 5) : "", published: isNew ? false : c.published
    });
    var form = pageForm([
      { heading: "The event" },
      { name: "name", label: "Title", required: true, help: "For example “AGM 2027” or “Referee course”." },
      { name: "label", label: "Tag (optional)", help: "A small label next to the title, for example “Members only”." },
      { name: "description", label: "Description", type: "textarea", rows: 5, help: "Plain text. Start lines with “- ” for bullet points. Links look like [text](https://…)." },
      { heading: "When and where" },
      { name: "start_date", label: "Date", type: "date", required: true, half: true },
      { name: "end_date", label: "Last day (if more than one day)", type: "date", half: true },
      { name: "start_time", label: "Start time (UK time)", type: "time", half: true },
      { name: "end_time", label: "End time (optional)", type: "time", half: true, help: "Leave blank if it is open ended or the same as the start." },
      { name: "venue_name", label: "Location", help: "Shown on the page and linked to Google Maps. Use “Online” for a video call.", half: true },
      { name: "venue_address", label: "Address or postcode (optional)", help: "Makes the Maps link more accurate.", half: true },
      { name: "map_url", label: "Custom map link (optional)", type: "url", help: "Only needed if the automatic Google Maps link is wrong." },
      { heading: "On the website" },
      { name: "published", label: "Show on the website", type: "checkbox", help: "Untick to keep it as a draft." }
    ], values);
    var bar = saveBar(null, isNew ? "Add event" : "Save changes");
    var formEl = el("form", { novalidate: true }, form.el, bar.el);
    view.replaceChildren(formEl);
    formEl.addEventListener("submit", function (e) {
      e.preventDefault(); bar.clear();
      var v = form.values(), problem = null;
      if (!v.name) problem = "Title is required."; else if (!v.start_date) problem = "The date is required.";
      else if (v.end_date && v.end_date < v.start_date) problem = "The last day cannot be before the first day.";
      else if (v.end_time && !v.start_time) problem = "Add a start time as well, or clear the end time.";
      else if (v.end_time && (!v.end_date || v.end_date === v.start_date) && v.end_time <= v.start_time) problem = "The end time must be after the start time.";
      else if (v.map_url && !/^https?:\/\//i.test(v.map_url)) problem = "The map link must start with https://";
      if (problem) return bar.fail(problem);
      bar.busy(true);
      var row = { kind: "event", name: v.name, description: v.description, label: v.label, start_date: v.start_date, end_date: v.end_date || null,
        start_time: v.start_time || null, end_time: v.end_time || null, venue_name: v.venue_name, venue_address: v.venue_address, map_url: v.map_url, published: v.published };
      var q = isNew ? sb.from("competitions").insert(row).select("id").single() : sb.from("competitions").update(row).eq("id", c.id);
      q.then(ok).then(function (d) { toast(isNew ? "Event added." : "Event saved."); if (isNew) go("#competitions/" + (Array.isArray(d) ? d[0] : d).id); else route(); })
        .catch(function (err) { bar.busy(false); bar.fail(friendly(err)); });
    });
  }

  // ---- entries tab ------------------------------------------------------------------
  var ENTRY_STATUS = { held: "Paying", paid: "Paid", comped: "Free", cancelled: "Cancelled", refunded: "Refunded" };
  function renderEntriesTab(view, c) {
    view.replaceChildren(el("p", null, "Loading…"));
    sb.from("entries").select("*, weight_classes(label)").eq("competition_id", c.id).order("created_at", { ascending: true }).then(function (res) {
      var rows = ok(res);
      var live = rows.filter(function (e) { return e.status === "paid" || e.status === "comped"; });
      var total = live.reduce(function (n, e) { return n + e.price_pence; }, 0);
      view.replaceChildren(
        el("div", { class: "actions", style: "margin-bottom:var(--space-3)" },
          btn("Download CSV", function () { downloadEntries(c); }, "btn-secondary"),
          c.entry_method === "yne" ? btn("Priority entry", function () { editPriority(c); }) : null,
          c.slug ? el("a", { class: "btn btn-secondary", href: "../entries?c=" + encodeURIComponent(c.slug), target: "_blank", rel: "noopener" }, "Public list") : null),
        el("p", { class: "panel-intro" }, live.length + " entered of " + (c.capacity || "?") + " places. Entry money taken: " + entryMoney(total) + "."),
        rows.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
          el("thead", null, el("tr", null, ["Name", "Details", "Status", "Paid"].map(function (h) { return el("th", { scope: "col" }, h); }))),
          el("tbody", null, rows.map(function (e) {
            return el("tr", null,
              el("th", { scope: "row" }, e.full_name, el("small", null, e.email)),
              el("td", null, [(e.sex === "M" ? "Men's " : "Women's ") + (e.weight_classes ? e.weight_classes.label + " kg" : ""), e.event === "bench_only" ? "Bench only" : "Full power", e.equipment].join(" · "),
                el("small", null, [e.club, e.bp_number && "BP " + e.bp_number].filter(Boolean).join(" · "))),
              el("td", null, ENTRY_STATUS[e.status] || e.status),
              el("td", null, entryMoney(e.price_pence), e.paid_at ? el("small", null, new Date(e.paid_at).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" })) : null));
          })))) : el("p", { class: "empty" }, "No entries yet."));
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  function csvCell(v) { v = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
  function downloadEntries(c) {
    sb.from("entries").select("*, weight_classes(label)").eq("competition_id", c.id).in("status", ["paid", "comped"]).order("created_at").then(ok).then(function (rows) {
      var head = ["Name", "Email", "BP number", "Sex", "Weight class", "Event", "Equipment", "Club", "Instagram", "Paid (GBP)", "Paid at"];
      var lines = [head.map(csvCell).join(",")].concat(rows.map(function (e) {
        return [e.full_name, e.email, e.bp_number, e.sex, e.weight_classes && e.weight_classes.label, e.event, e.equipment, e.club, e.instagram, (e.price_pence / 100).toFixed(2), e.paid_at].map(csvCell).join(",");
      }));
      var a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" })), download: (c.slug || "entries") + "-entries.csv" });
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { toast(friendly(e), "error"); });
  }

  // Priority entry opens one day before general entry. Each email gets a personal, single-use link. Only a
  // fingerprint is stored, so the links are shown once, here.
  function editPriority(c) {
    openForm({
      title: "Priority entry: " + c.name, saveLabel: "Make links",
      intro: "Priority entry opens one day before general entry" + (c.entry_opens ? " (" + whenText(Y.toLondonInput(new Date(new Date(c.entry_opens).getTime() - 86400000).toISOString())) + ")" : " (set the opening time first)") + ". Enter one email address per line. Each person gets a personal link that only works with their own email address. Making a new link for someone replaces their old unused one.",
      fields: [{ name: "emails", label: "Email addresses (one per line)", type: "textarea", required: true }],
      onSave: function (v) {
        var list = v.emails.split(/[\s,;]+/).filter(Boolean);
        if (!list.length) return Promise.reject(new Error("Enter at least one email address."));
        return sb.rpc("create_priority_invites", { c: c.id, emails: list }).then(function (r) {
          if (r.error) { var m = (r.error.message || "").trim(); throw new Error(/^invalid:email/.test(m) ? "That does not look like an email address: " + m.replace(/^invalid:email:/, "") : friendly(r.error)); }
          setTimeout(function () { showPriorityLinks(c, r.data); }, 80);
        });
      }
    });
  }
  function showPriorityLinks(c, rows) {
    var text = rows.map(function (r) { return r.email + "  " + location.origin + "/enter?c=" + c.slug + "&invite=" + r.token; }).join("\n");
    openForm({
      title: "Priority links", saveLabel: "Done", values: { links: text },
      intro: "Copy these now. They cannot be shown again. Send each person only their own link.",
      fields: [{ name: "links", label: "One link per person", type: "textarea", rows: Math.min(14, rows.length + 2) }],
      onSave: function () { return Promise.resolve(); }
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
              el("a", { class: "btn btn-sm btn-ghost", href: "../post.html?p=" + encodeURIComponent(p.slug), target: "_blank", rel: "noopener" }, "View"),
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
        { name: "body_md", label: "Post", type: "md", images: true, help: "Use the toolbar for headings, lists, links and pictures. To add a picture, put the cursor on an empty line between paragraphs and press the picture button, or drop or paste a picture in. Switch to Markdown at the bottom if you prefer." },
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
    gSub: function (g) { return "Link to this category: faqs#" + Y.anchorSlug(g.title) + " (it changes if you rename the category)"; },
    iTitle: function (f) { return f.question; },
    iSub: function () { return ""; },
    normalise: function (v) { return v; },
    validate: function () { return null; }
  };

  // Addresses allowed in the footer: https, mailto, "#" (placeholder), or a page on this site.
  function footerUrlOk(u) {
    u = (u || "").trim();
    return u === "#" || /^https:\/\/[^\s]+$/i.test(u) || /^mailto:[^\s@]+@[^\s@]+$/i.test(u) ||
      (/^[A-Za-z0-9][A-Za-z0-9_\-.\/]*(#[\w-]*)?$/.test(u) && u.indexOf("..") < 0 && u.indexOf("//") < 0);
  }
  var PLACEMENTS = { column: "A column of links", bottom: "The bottom row", social: "Social links under the logo" };
  var FOOTER = {
    title: "Footer", slug: "footer",
    intro: "The links at the bottom of every page. Each group is either a column of links, the links in the bottom row (such as the privacy policy), or the social links under the logo. Rename groups, add links and reorder with the arrows. Changes show on the site within a minute.",
    gTable: "footer_groups", iTable: "footer_links", fk: "group_id", gWord: "group", iWord: "link", iPlural: "links",
    gFields: [
      { name: "title", label: "Heading", required: true, help: "Shown above a column of links. For the bottom row and social links it is just a name for you." },
      { name: "placement", label: "Where it appears", type: "select", options: Object.keys(PLACEMENTS).map(function (k) { return { value: k, label: PLACEMENTS[k] }; }) }
    ],
    iFields: [
      { name: "label", label: "Link text", required: true },
      { name: "url", label: "Address", required: true, help: "A full address starting https://, a page on this site such as faqs.html, or # as a placeholder until you have the real address." }
    ],
    gSub: function (g) { return PLACEMENTS[g.placement] || ""; },
    iTitle: function (l) { return l.label; },
    iSub: function (l) { return l.url === "#" ? "# (placeholder: add the real address)" : l.url; },
    normalise: function (v) { v.url = v.url.trim(); v.label = v.label.trim(); return v; },
    validate: function (v) { return footerUrlOk(v.url) ? null : "The address must start with https://, or be a page on this site (like faqs.html), or be # for now."; }
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
      var up = btn("↑", function () { move(list, index, -1, table, key + "u"); }, "btn-ghost icon-btn", { "aria-label": "Move " + label + " up", "data-key": key + "u" });
      var down = btn("↓", function () { move(list, index, 1, table, key + "d"); }, "btn-ghost icon-btn", { "aria-label": "Move " + label + " down", "data-key": key + "d" });
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

  // ---- records (links to published Google Sheets) -----------------------------------
  function renderRecords(panel) {
    panel.replaceChildren(panelHead("Records", btn("Add record sheet", function () { editSource(); }, "btn-primary")),
      el("div", { class: "panel-intro" },
        el("p", null, "Each entry below becomes a section on the Records page, read live from a Google Sheet (the divisional records layout is shown as a grid for each weight class). To get a link: in the sheet choose ",
          el("strong", null, "File > Share > Publish to web"), ", pick the tab, choose ", el("strong", null, "Comma-separated values (.csv)"),
          ", press Publish and paste the link here. Changes in the sheet appear on the site within a few minutes."),
        el("p", null, "To move the records somewhere else later, edit the entry and paste the new link. Entries with no link are hidden from the public page.")),
      el("p", null, "Loading…"));
    var settingQ = sb.from("site_settings").select("*").eq("key", SUBMIT_KEY).then(function (r) { return r; }, function (e) { return { error: e }; });
    Promise.all([sb.from("record_sources").select("*").order("sort_order"), settingQ]).then(function (both) {
      var res = both[0], rows = ok(res);
      panel.lastChild.remove();
      panel.appendChild(submitCard(both[1]));
      if (!rows.length) { panel.appendChild(el("p", { class: "empty" }, "No record sheets yet.")); return; }
      var list = el("ul", { class: "item-list card", style: "padding:0 var(--space-5);" });
      rows.forEach(function (r, i) {
        var up = btn("↑", function () { moveSource(rows, i, -1); }, "btn-ghost icon-btn", { "aria-label": "Move " + r.title + " up" });
        var down = btn("↓", function () { moveSource(rows, i, 1); }, "btn-ghost icon-btn", { "aria-label": "Move " + r.title + " down" });
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

  // The "Submit a record" button on the Records page: a link to a Google Form, kept as a site setting.
  var SUBMIT_KEY = "records_submit_url";
  function submitCard(res) {
    var missingTable = !!res.error;                        // settings table not created yet (schema.sql not re-run)
    var row = !missingTable && res.data && res.data[0];
    var current = row ? (row.value || "") : Y.RECORDS_FORM_DEFAULT;
    return el("div", { class: "card", style: "margin-bottom:var(--space-6);" },
      el("div", { class: "setting-row" },
        el("div", { class: "item-main" },
          el("p", { class: "item-title" }, "“Submit a record” form"),
          el("p", { class: "item-sub", style: "overflow-wrap:anywhere;" }, current || "No link (the button is hidden on the Records page)"),
          missingTable ? el("p", { class: "item-sub" }, "To change this link, run the latest supabase/schema.sql in Supabase first. Until then the standard form is used.") : null),
        el("span", { class: "actions" }, missingTable ? null : btn("Edit", function () { editSubmitLink(current, !!row); }))));
  }
  function editSubmitLink(current, exists) {
    openForm({
      title: "“Submit a record” form",
      values: { url: current },
      saveLabel: "Save",
      fields: [{ name: "url", label: "Form link", type: "url", placeholder: "https://docs.google.com/forms/d/e/…/viewform",
        help: "Where the “Submit a record” button at the top of the Records page goes. It opens in a new tab. Leave blank to hide the button." }],
      validate: function (v) { return v.url && !/^https:\/\//i.test(v.url) ? "The link must start with https://" : null; },
      onSave: function (v) {
        var q = exists ? sb.from("site_settings").update({ value: v.url }).eq("key", SUBMIT_KEY) : sb.from("site_settings").insert({ key: SUBMIT_KEY, value: v.url });
        return q.then(ok).then(function () { toast(v.url ? "Saved." : "Saved. The button is now hidden."); route(); });
      }
    });
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
          el("strong", null, "Admins"), " can do everything, including adding and removing users. ",
          el("strong", null, "Entries team"), " run entries: settings, entries, refunds and reports. ",
          el("strong", null, "Editors"), " manage competitions, news, records, the organisation page and FAQs. ",
          el("strong", null, "Contributors"), " can write news posts only."),
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
            btn("Change role", function () { setRole(u); }),
            btn("Remove", function () { removeUser(u); }, "btn-danger"));
          return el("tr", null,
            el("th", { scope: "row" }, u.email, self ? el("span", { class: "tag tag-open tag-you" }, "You") : null,
              u.added_by ? el("small", null, "Added by " + u.added_by) : null),
            el("td", null, u.display_name || "—"),
            el("td", null, ROLE_NAMES[u.role] || u.role),
            el("td", null, actions));
        })))));
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }
  var ROLE_NAMES = { admin: "Admin", entries: "Entries team", editor: "Editor", contributor: "Contributor" };
  var ROLE_OPTIONS = [
    { value: "editor", label: "Editor: can edit the website" },
    { value: "entries", label: "Entries team: runs entries, refunds and reports" },
    { value: "contributor", label: "Contributor: can write news posts only" },
    { value: "admin", label: "Admin: can do everything, including users" }
  ];
  function setRole(u) {
    openForm({
      title: "Change role: " + u.email, saveLabel: "Change role", values: { role: u.role },
      fields: [{ name: "role", label: "Role", type: "select", options: ROLE_OPTIONS }],
      onSave: function (v) {
        return sb.from("editors").update({ role: v.role }).eq("id", u.id).then(ok).then(function () { toast("Role changed."); route(); });
      }
    });
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
        { name: "role", label: "Role", type: "select", options: ROLE_OPTIONS }
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

  // ---- home page ------------------------------------------------------------------------
  // The wording of each block is one row in site_settings (key home.<block>, the value is JSON); no row means
  // "the standard wording" (the defaults in home.js, which is also what index.html says). The hero photos are
  // rows in hero_images. See assets/js/home.js for how the page uses them.
  var HOME = window.YNEPF_HOME;
  var HOME_MAX = { resources: 8, cards: 6 };

  function homeCurrent(name, saved) {
    var d = HOME.DEFAULTS[name], sv = saved && saved[name];
    if (!sv || typeof sv !== "object") return JSON.parse(JSON.stringify(d));
    var out = {};
    Object.keys(d).forEach(function (k) {
      if (k === "items") out.items = Array.isArray(sv.items) ? sv.items : JSON.parse(JSON.stringify(d.items));
      else out[k] = typeof sv[k] === "string" ? sv[k] : d[k];
    });
    return out;
  }
  function homeLoadSaved() {
    return sb.from("site_settings").select("key,value").like("key", "home.%").then(function (res) {
      var rows = ok(res), saved = {};
      rows.forEach(function (r) { try { saved[r.key.slice(5)] = JSON.parse(r.value); } catch (e) { /* ignore a damaged row */ } });
      return saved;
    });
  }
  // Write a whole block: update its row if there is one, otherwise add it.
  function homeWrite(name, value) {
    var key = "home." + name, text = JSON.stringify(value);
    return sb.from("site_settings").select("key").eq("key", key).then(ok).then(function (rows) {
      return (rows.length ? sb.from("site_settings").update({ value: text }).eq("key", key) : sb.from("site_settings").insert({ key: key, value: text })).then(ok);
    });
  }
  // Change a block from its freshest saved state (so two editors do not overwrite each other's other blocks or items).
  function homeChange(name, fn) {
    return homeLoadSaved().then(function (saved) {
      var cur = homeCurrent(name, saved), next = fn(cur);
      return next === false ? null : homeWrite(name, next);
    });
  }
  function homeReset(name, what) {
    if (!window.confirm("Go back to the standard " + what + "? Your changes to it will be lost.")) return;
    sb.from("site_settings").delete().eq("key", "home." + name).then(ok)
      .then(function () { toast("Back to the standard wording."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }
  function homeUrlCheck(v, fields) {
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (v[f[0]] && !HOME.urlOk(v[f[0]])) return f[1] + " must start with https://, be a page on this site (like faqs.html), or be # for now.";
    }
    return null;
  }
  var LINK_HELP = "A full address starting https://, a page on this site such as faqs.html, or # for now.";

  function homeCard(title, summary, actions, body) {
    return el("section", { class: "card home-card" },
      el("div", { class: "home-card-head" }, el("h2", null, title), el("span", { class: "actions" }, actions)),
      summary ? el("div", { class: "home-summary" }, summary) : null, body || null);
  }
  function homeLine(label, text) { return el("p", { class: "home-line" }, el("span", null, label + ": "), el("strong", null, text)); }

  function renderHome(panel) {
    panel.replaceChildren(panelHead("Home page"),
      el("p", { class: "panel-intro" }, "Change the wording and photos on the home page. “Upcoming events” and “Latest news” fill themselves from the Calendar and News tabs, so you only edit their headings and buttons here. Changes reach visitors within a minute or so, and a photo you add joins the rotation straight away for new visitors."),
      el("p", null, "Loading…"));
    Promise.all([
      sb.from("site_settings").select("key,value").like("key", "home.%"),
      sb.from("hero_images").select("*").order("sort_order").order("created_at")
    ]).then(function (both) {
      panel.lastChild.remove();
      if (both[0].error) {
        panel.appendChild(el("div", { class: "callout" }, el("p", { class: "callout-title" }, "One step first"),
          el("p", { style: "margin:0;" }, "The home page settings need the latest supabase/schema.sql to be run in Supabase. Until then the home page shows its standard wording and photos.")));
        return;
      }
      var saved = {};
      ok(both[0]).forEach(function (r) { try { saved[r.key.slice(5)] = JSON.parse(r.value); } catch (e) { /* ignore */ } });
      var cur = function (n) { return homeCurrent(n, saved); };
      var custom = function (n) { return !!saved[n]; };
      var resetBtn = function (n, what) { return custom(n) ? btn("Use the standard " + what, function () { homeReset(n, what); }) : null; };

      // ---- headline and buttons
      var hero = cur("hero");
      panel.appendChild(homeCard("Headline and buttons",
        [homeLine("Headline", hero.title), homeLine("Button 1", hero.primaryLabel + "  (" + hero.primaryUrl + ")"), homeLine("Button 2", hero.secondaryLabel + "  (" + hero.secondaryUrl + ")")],
        [btn("Edit", function () { editHomeHero(hero); }, "btn-primary"), resetBtn("hero", "wording")]));

      // ---- hero photos
      panel.appendChild(heroPhotosCard(both[1]));

      // ---- upcoming events, resources, cards, news, call to action
      var ev = cur("events");
      panel.appendChild(homeCard("Upcoming events",
        [homeLine("Heading", ev.heading), homeLine("Button", ev.buttonLabel), el("p", { class: "help" }, "The events themselves come from the Calendar tab.")],
        [btn("Edit", function () { editHomeSimple("events", "Upcoming events", ev, [{ name: "heading", label: "Heading", required: true }, { name: "buttonLabel", label: "Button text", required: true }]); }, "btn-primary"), resetBtn("events", "wording")]));
      panel.appendChild(homeListCard("resources", "Resources", cur("resources"), custom("resources")));
      panel.appendChild(homeListCard("cards", "Find your place", cur("cards"), custom("cards")));
      var nw = cur("news");
      panel.appendChild(homeCard("Latest news",
        [homeLine("Heading", nw.heading), homeLine("Button", nw.buttonLabel), el("p", { class: "help" }, "The posts themselves come from the News tab.")],
        [btn("Edit", function () { editHomeSimple("news", "Latest news", nw, [{ name: "heading", label: "Heading", required: true }, { name: "buttonLabel", label: "Button text", required: true }]); }, "btn-primary"), resetBtn("news", "wording")]));
      var cta = cur("cta");
      panel.appendChild(homeCard("Question band (bottom of the page)",
        [homeLine("Heading", cta.heading), homeLine("Text", cta.text), homeLine("Button", cta.buttonLabel + "  (" + cta.url + ")")],
        [btn("Edit", function () {
          editHomeSimple("cta", "Question band", cta, [{ name: "heading", label: "Heading", required: true },
            { name: "text", label: "Text", type: "textarea", rows: 3 }, { name: "buttonLabel", label: "Button text", required: true, half: true },
            { name: "url", label: "Button link", required: true, half: true, help: LINK_HELP }], [["url", "The button link"]]);
        }, "btn-primary"), resetBtn("cta", "wording")]));
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }

  function editHomeHero(hero) {
    openForm({
      title: "Headline and buttons", values: hero, saveLabel: "Save",
      fields: [
        { name: "title", label: "Headline", type: "textarea", rows: 3, required: true, help: "Put *stars* around words to highlight them in orange, like: The home of *drug tested* powerlifting." },
        { name: "primaryLabel", label: "Button 1 text", required: true, half: true },
        { name: "primaryUrl", label: "Button 1 link", required: true, half: true, help: LINK_HELP },
        { name: "secondaryLabel", label: "Button 2 text", required: true, half: true },
        { name: "secondaryUrl", label: "Button 2 link", required: true, half: true, help: LINK_HELP }
      ],
      validate: function (v) { return homeUrlCheck(v, [["primaryUrl", "Button 1's link"], ["secondaryUrl", "Button 2's link"]]); },
      onSave: function (v) { return homeChange("hero", function () { return v; }).then(function () { toast("Saved."); route(); }); }
    });
  }
  function editHomeSimple(name, title, current, fields, urlFields) {
    openForm({
      title: title, values: current, saveLabel: "Save", fields: fields,
      validate: function (v) { return homeUrlCheck(v, urlFields || []); },
      onSave: function (v) { return homeChange(name, function (c) { return Object.assign({}, c, v); }).then(function () { toast("Saved."); route(); }); }
    });
  }

  // A block that is a heading plus a list of items (Resources, Find your place cards)
  var HOME_ITEMS = {
    resources: { word: "resource", fields: function () { return [
      { name: "title", label: "Title", required: true }, { name: "text", label: "Short description", type: "textarea", rows: 2 },
      { name: "url", label: "Link", required: true, help: LINK_HELP },
      { name: "icon", label: "Icon", type: "select", half: true, options: Object.keys(HOME.ICON_NAMES).map(function (k) { return { value: k, label: HOME.ICON_NAMES[k] }; }) },
      { name: "colour", label: "Icon colour", type: "select", half: true, options: Object.keys(HOME.COLOUR_NAMES).map(function (k) { return { value: k, label: HOME.COLOUR_NAMES[k] }; }) }]; },
      blank: { title: "", text: "", url: "", icon: "link", colour: "navy" },
      sub: function (i) { return i.text; } },
    cards: { word: "card", fields: function () { return [
      { name: "title", label: "Title", required: true }, { name: "text", label: "Short description", type: "textarea", rows: 2 },
      { name: "linkLabel", label: "Link text", required: true, half: true }, { name: "url", label: "Link address", required: true, half: true, help: LINK_HELP },
      { name: "style", label: "Style", type: "select", options: [{ value: "plain", label: "Plain (white)" }, { value: "inverse", label: "Highlighted (dark blue)" }] }]; },
      blank: { title: "", text: "", linkLabel: "", url: "", style: "plain" },
      sub: function (i) { return i.text; } }
  };
  function homeListCard(name, title, block, isCustom) {
    var cfg = HOME_ITEMS[name], list = el("ul", { class: "item-list", style: "padding:0;margin:0 0 var(--space-3);" });
    block.items.forEach(function (it, i) {
      var up = btn("↑", function () { moveHomeItem(name, i, -1); }, "btn-ghost icon-btn", { "aria-label": "Move " + it.title + " up" });
      var down = btn("↓", function () { moveHomeItem(name, i, 1); }, "btn-ghost icon-btn", { "aria-label": "Move " + it.title + " down" });
      up.disabled = i === 0; down.disabled = i === block.items.length - 1;
      var lead = null;
      if (name === "resources") { lead = el("span", { class: "resource-icon " + (HOME.COLOUR_NAMES[it.colour] ? it.colour : "navy"), "aria-hidden": "true", style: "margin-right:var(--space-3);" });
        var sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("fill", "none"); sv.innerHTML = HOME.ICONS[it.icon] || HOME.ICONS.link; lead.appendChild(sv); }
      list.appendChild(el("li", { class: "item-row" }, lead,
        el("div", { class: "item-main" }, el("p", { class: "item-title" }, it.title + (it.style === "inverse" ? "  (highlighted)" : "")),
          el("p", { class: "item-sub", style: "overflow-wrap:anywhere;" }, [cfg.sub(it), it.url].filter(Boolean).join(" · "))),
        el("span", { class: "actions" }, up, down, btn("Edit", function () { editHomeItem(name, i); }),
          btn("Delete", function () { deleteHomeItem(name, i); }, "btn-danger"))));
    });
    var add = btn("Add " + cfg.word, function () { editHomeItem(name, -1); });
    if (block.items.length >= HOME_MAX[name]) { add.disabled = true; add.title = "At most " + HOME_MAX[name] + "."; }
    return homeCard(title, [homeLine("Heading", block.heading)],
      [btn("Edit heading", function () { editHomeSimple(name, title + ": heading", block, [{ name: "heading", label: "Heading", required: true }]); }),
        isCustom ? btn("Use the standard wording", function () { homeReset(name, "wording and list"); }) : null],
      el("div", { class: "home-list" }, list, add));
  }
  function editHomeItem(name, index) {
    var cfg = HOME_ITEMS[name];
    homeLoadSaved().then(function (saved) {
      var block = homeCurrent(name, saved), it = index >= 0 ? block.items[index] : Object.assign({}, cfg.blank);
      if (!it) return;
      openForm({
        title: (index >= 0 ? "Edit " : "Add ") + cfg.word, values: it, saveLabel: index >= 0 ? "Save" : "Add " + cfg.word, fields: cfg.fields(),
        validate: function (v) { return homeUrlCheck(v, [["url", "The link"]]); },
        onSave: function (v) {
          return homeChange(name, function (c) {
            var items = c.items.slice();
            if (index >= 0) items[index] = Object.assign({}, items[index], v); else if (items.length < HOME_MAX[name]) items.push(v);
            return Object.assign({}, c, { items: items });
          }).then(function () { toast(index >= 0 ? "Saved." : "Added."); route(); });
        }
      });
    }).catch(function (e) { toast(friendly(e), "error"); });
  }
  function moveHomeItem(name, index, dir) {
    homeChange(name, function (c) {
      var items = c.items.slice(), j = index + dir;
      if (j < 0 || j >= items.length) return false;
      var t = items[index]; items[index] = items[j]; items[j] = t;
      return Object.assign({}, c, { items: items });
    }).then(route).catch(function (e) { toast(friendly(e), "error"); });
  }
  function deleteHomeItem(name, index) {
    homeLoadSaved().then(function (saved) {
      var block = homeCurrent(name, saved), it = block.items[index];
      if (!it) return;
      if (block.items.length <= 1) { toast("Keep at least one " + HOME_ITEMS[name].word + ". You can edit it instead.", "error"); return; }
      if (!window.confirm("Delete “" + it.title + "”?")) return;
      return homeChange(name, function (c) { var items = c.items.slice(); items.splice(index, 1); return Object.assign({}, c, { items: items }); })
        .then(function () { toast("Deleted."); route(); });
    }).catch(function (e) { toast(friendly(e), "error"); });
  }

  // ---- hero photos
  function heroSrc(u) { return /^assets\//.test(u) ? "../" + u : u; }   // the editor lives one folder down
  function heroPhotosCard(res) {
    if (res.error) {
      return homeCard("Hero photos", null, null, el("p", null, "The photo pool needs the latest supabase/schema.sql to be run in Supabase. Until then the home page rotates the two photos that come with the site."));
    }
    var rows = ok(res), active = rows.filter(function (r) { return r.active; });
    var grid = el("ul", { class: "photo-grid" }, rows.map(function (r) {
      return el("li", { class: "photo-card" + (r.active ? "" : " is-off") },
        el("img", { src: heroSrc(r.small_url || r.url), alt: "", loading: "lazy" }),
        el("p", { class: "item-sub" }, r.alt),
        el("span", { class: "tag " + (r.active ? "tag-open" : "tag-closed") }, r.active ? "In the rotation" : "Hidden"),
        el("span", { class: "actions" },
          btn(r.active ? "Hide" : "Show", function () { setHeroActive(r, !r.active); }),
          btn("Edit description", function () { editHeroAlt(r); }),
          btn("Delete", function () { deleteHero(r); }, "btn-danger")));
    }));
    var note = !rows.length ? "No photos yet, so the home page uses the two that come with the site."
      : !active.length ? "Every photo is hidden, so the home page uses the two that come with the site."
      : active.length === 1 ? "Only one photo is in the rotation, so it will not change from visit to visit. Add another to get a different one each time."
      : active.length + " photos are in the rotation. Each visit shows one of them at random, never the same one twice in a row.";
    return homeCard("Hero photos", [el("p", { style: "margin:0;" }, note),
        el("p", { class: "help" }, "Tall (portrait) photos work best. The home page frame is nearly square and crops evenly from the centre, so keep the action in the middle.")],
      [btn("Add photo", addHeroPhoto, "btn-primary")], rows.length ? grid : null);
  }
  function addHeroPhoto() {
    imageDialog(null, { title: "Add a hero photo", bucket: "site-images", folder: "hero", widths: [1000, 640], frame: true }).then(function (r) {
      if (!r) return;
      return sb.from("hero_images").select("sort_order").order("sort_order", { ascending: false }).limit(1).then(ok).then(function (top) {
        return sb.from("hero_images").insert({ url: r.url, small_url: r.smallUrl, alt: r.alt, active: true, sort_order: (top[0] ? top[0].sort_order : 0) + 10 }).then(ok);
      }).then(function () { toast("Photo added to the rotation."); route(); });
    }).catch(function (e) { toast(friendly(e), "error"); });
  }
  function setHeroActive(r, on) {
    sb.from("hero_images").update({ active: on }).eq("id", r.id).then(ok)
      .then(function () { toast(on ? "Back in the rotation." : "Hidden from the rotation."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }
  function editHeroAlt(r) {
    openForm({
      title: "Describe the photo", values: { alt: r.alt }, saveLabel: "Save",
      fields: [{ name: "alt", label: "Description", required: true, help: "A few words for people who cannot see it, for example “A lifter pulling a deadlift, with a spotter behind the bar”." }],
      onSave: function (v) { return sb.from("hero_images").update({ alt: v.alt }).eq("id", r.id).then(ok).then(function () { toast("Saved."); route(); }); }
    });
  }
  function deleteHero(r) {
    if (!window.confirm("Remove this photo from the rotation? The picture file itself stays in storage.")) return;
    sb.from("hero_images").delete().eq("id", r.id).then(ok)
      .then(function () { toast("Photo removed."); route(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }

  // ---- shell, routing, auth ---------------------------------------------------------
  function panelHead(title, action) {
    return el("div", { class: "panel-head" }, el("h1", null, title), action || null);
  }

  var TABS = {
    competitions: renderCompetitions,
    news: renderNews,
    home: renderHome,
    organisation: function (p) { renderGrouped(p, ORG); },
    records: renderRecords,
    users: renderUsers,
    faqs: function (p) { renderGrouped(p, FAQ); },
    footer: function (p) { renderGrouped(p, FOOTER); },
    account: renderAccount
  };

  // Which roles see which tab. contributor: news only. entries: the entries desk. editor: site content.
  var TAB_ROLES = {
    competitions: ["admin", "editor", "entries"], news: ["admin", "editor", "contributor"], home: ["admin", "editor"],
    organisation: ["admin", "editor"], records: ["admin", "editor"], faqs: ["admin", "editor"], footer: ["admin", "editor"], users: ["admin"],
    account: ["admin", "entries", "editor", "contributor"]
  };
  function canSee(tab) { return (TAB_ROLES[tab] || []).indexOf(state.role) >= 0; }
  function route() {
    var parts = (location.hash || "").replace("#", "").split("/");
    var tab = parts[0];
    if (!TABS[tab] || !canSee(tab)) { tab = state.role === "contributor" ? "news" : "competitions"; parts = [tab]; }
    Array.prototype.forEach.call(document.querySelectorAll(".admin-tabs a"), function (a) {
      if (a.getAttribute("data-tab") === tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    // Each draw works on its own fresh surface that is swapped into the page whole. A slower,
    // older draw (for example from a second sign-in event) can then only ever write into a
    // surface that is no longer on the page, so sections can never appear twice.
    var view = el("div");
    $("panel").replaceChildren(view);
    TABS[tab](view, parts.slice(1));
  }
  window.addEventListener("hashchange", function () { if (state.user && state.role) route(); });

  var TITLES = { login: "Sign in", signup: "Create your login", reset: "Set a new password" };
  function showAuth(mode) {
    state.recovering = mode === "reset";
    state.role = null;
    state.shownFor = null;
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
    // The sign-in service can report the same session more than once (on load, when the tab
    // regains focus). Only the first report does any work.
    if (state.shownFor === user.id) return Promise.resolve();
    state.shownFor = user.id;
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
        Array.prototype.forEach.call(document.querySelectorAll(".admin-tabs a"), function (t) { show(t, canSee(t.getAttribute("data-tab"))); });
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
