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
      if (f.sub) { grid = null; form.appendChild(el("h3", { class: "form-sub" }, f.sub)); return; }          // a small heading between groups of fields
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

    var save = el("button", { class: "btn " + (opt.danger ? "btn-danger-solid" : "btn-primary"), type: "submit" }, opt.saveLabel || "Save");
    form.appendChild(el("div", { class: "dialog-actions" }, save,
      el("button", { class: "btn btn-secondary", type: "button", onclick: function () { dlg.close(); } }, "Cancel"),
      (opt.extra || []).map(function (x) { return el("button", { class: "btn btn-ghost", type: "button", onclick: function () { dlg.addEventListener("close", function after() { dlg.removeEventListener("close", after); x.onclick(); }); dlg.close(); } }, x.label); })));         // run it once this dialog has finished closing, so a dialog it opens is not wiped by the close

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
        if (f.sub) continue;
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
    (editors.pending || []).forEach(function (fn) { fn(); });
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
          el: host, height: f.height || "380px", initialEditType: "wysiwyg", previewStyle: "tab",
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
    "invalid:hold_minutes": "The hold must be between 5 and 30 minutes.", "invalid:offer_window_hours": "A waiting list offer must last between 1 and 168 hours.", "invalid:qualification_glp": "Enter the minimum GL points, a number above 0.", "invalid:qualifying_class": "One of the qualifying total lines uses a weight class we do not have. Check the classes, like M 83 or F 63.", "invalid:qualifying_total": "Each qualifying total must be a number of kg above 0.", "invalid:priority_hours": "Priority entry must start between 1 and 336 hours before general entry.", "invalid:guest_delay_days": "Guest entry delay must be between 0 and 90 days.",
    "invalid:price_full_power": "Set a full power price of more than £0.", "invalid:price_bench_only": "Set a bench only price of more than £0.",
    "invalid:price_sub_junior": "The sub-junior price must be more than £0, or left empty.", "invalid:capacity": "Set the number of spaces first.",
    forbidden: "You do not have permission to change entry settings."
  };
  function pence(v) { return v === null || v === "" || v === undefined ? null : Math.round(Number(v) * 100); }
  function poundsInput(p) { return p === null || p === undefined ? "" : (p / 100).toFixed(2); }
  var CAT_LABEL = { SJ: "Sub-junior", J: "Junior", "": "Open", M1: "M1", M2: "M2", M3: "M3", M4: "M4" };
  // The category for a competition: the year they turn the age (calendar-year rule), the same as the database.
  function catFor(dob, compStart) {
    var d = +String(compStart).slice(0, 4) - +String(dob).slice(0, 4);
    return d < 14 ? "" : d <= 18 ? "SJ" : d <= 23 ? "J" : d <= 39 ? "" : d <= 49 ? "M1" : d <= 59 ? "M2" : d <= 69 ? "M3" : "M4";
  }
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
      renderEditor(panel, c, c.kind === "event" ? "event" : "competition", args[1] === "entries" ? "entries" : args[1] === "volunteers" ? "volunteers" : args[1] === "lifting" ? "lifting" : args[1] === "discounts" ? "discounts" : args[1] === "money" ? "money" : args[1] === "extras" ? "extras" : args[1] === "waiting" ? "waiting" : args[1] === "results" ? "results" : "details");
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
      if (canEntry()) panel.appendChild(feesPanel());
      if (canEntry()) { panel.appendChild(clubsPanel()); panel.appendChild(universitiesPanel()); }
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }

  // The universities lifters choose from at a university competition, in place of a club. The entries team keeps this list.
  function universitiesPanel() {
    var box = el("div", { class: "panel", style: "margin-top:var(--space-6)" }, el("h2", { style: "margin-top:0" }, "Universities"), el("p", null, "Loading…"));
    function draw() {
      sb.from("universities").select("*").order("name").then(ok).then(function (rows) {
        var live = rows.filter(function (r) { return r.active; }).length;
        box.replaceChildren(el("div", { class: "section-head is-first", style: "margin-top:0" }, el("h2", null, "Universities"), btn("Add a university", addUni, "btn-secondary")),
          el("p", { class: "panel-intro" }, "For a university competition (tick the box on its Details tab), lifters choose the university they represent from this list, instead of a club. " + live + (live === 1 ? " university is" : " universities are") + " on the list. Switching one off hides it from new entries and keeps it on past ones."),
          rows.length ? el("ul", { class: "item-list" }, rows.map(function (r) {
            return el("li", { class: "item-row" }, el("div", { class: "item-main" }, el("p", { class: "item-title" }, r.name, r.active ? null : el("span", { class: "tag tag-closed", style: "margin-left:var(--space-2)" }, "Switched off"))),
              el("span", { class: "actions" }, btn(r.active ? "Switch off" : "Switch on", function () { sb.from("universities").update({ active: !r.active }).eq("id", r.id).then(ok).then(draw).catch(function (e) { toast(friendly(e), "error"); }); }, r.active ? "btn-ghost" : "btn-secondary", { "aria-label": (r.active ? "Switch off " : "Switch on ") + r.name })));
          })) : el("div", { class: "empty-state" }, el("p", null, "No universities yet.")));
      }).catch(function (e) { box.replaceChildren(el("h2", { style: "margin-top:0" }, "Universities"), el("p", { class: "form-error" }, friendly(e))); });
    }
    function addUni() {
      openForm({ title: "Add a university", saveLabel: "Add it", values: {}, fields: [{ name: "name", label: "Name", required: true, help: "As lifters should see it on the entry form and the lifting order, for example Bradford University." }],
        onSave: function (v) {
          var name = String(v.name).trim();
          return sb.from("universities").insert({ name: name, active: true }).then(function (r) {
            if (r.error) throw new Error(/duplicate|unique/i.test(String(r.error.message)) ? "That university is already on the list." : friendly(r.error));
            toast("Added."); draw();
          });
        } });
    }
    draw();
    return box;
  }
  // The list of clubs people choose from on the entry form, imported from the EPA and British Powerlifting websites.
  function clubsPanel() {
    var box = el("div", { class: "panel", style: "margin-top:var(--space-6)" }, el("h2", { style: "margin-top:0" }, "Club list"), el("p", null, "Loading…"));
    Promise.all([
      sb.from("clubs").select("id", { count: "exact", head: true }).eq("active", true).then(function (r) { return r.error ? null : r; }, function () { return null; }),
      sb.from("site_settings").select("value").eq("key", "clubs_sync").maybeSingle().then(function (r) { return r.error ? null : r.data; }, function () { return null; })
    ]).then(function (r) {
      var n = r[0] && typeof r[0].count === "number" ? r[0].count : null, last = r[1] && r[1].value;
      var when = last && last.at ? new Date(last.at).toLocaleDateString("en-GB", { timeZone: Y.TZ, dateStyle: "long" }) : "never";
      var line = (n !== null ? n + " clubs. " : "") + "Last checked: " + when + (last && last.ok === false ? ". The last check did not work: " + (last.message || "see the function logs") : "") + ".";
      var button = btn("Refresh club list", function () {
        button.disabled = true;
        fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/sync-clubs", { method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "" }, body: "{}" })
          .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, b: b }; }); })
          .then(function (x) {
            if (!x.ok) throw new Error("The club list could not be refreshed.");
            toast(x.b.skipped ? "The list was refreshed in the last 12 hours, so nothing was done." : x.b.ok ? "Club list refreshed: " + x.b.total + " clubs." : (x.b.message || "A website looks different, so the list was left alone."), x.b.ok || x.b.skipped ? undefined : "error");
            route();
          }).catch(function (e) { toast(friendly(e), "error"); }).then(function () { button.disabled = false; });
      }, "btn-secondary");
      box.replaceChildren(el("h2", { style: "margin-top:0" }, "Club list"),
        el("p", null, "Lifters in English divisions can choose their club from this list, which is copied from the English Powerlifting Association\u2019s list of approved clubs every few weeks. A club that is not on the EPA list cannot be chosen. Press the button after the EPA website has been updated."),
        el("p", null, line), el("p", null, button));
    });
    return box;
  }

  function compTable(rows, taken) {
    return el("div", { class: "table-scroll" }, el("table", { class: "admin-table cal-table" },
      el("thead", null, el("tr", null, ["Name", "Date", "Entry", "Actions"].map(function (h) { return el("th", { scope: "col", class: h === "Actions" ? "col-actions" : null }, h); }))),
      el("tbody", null, rows.map(function (c) {
        var st = Y.compState(c), online = c.entry_method === "yne";
        var actions = el("span", { class: "actions" }, el("a", { class: "btn btn-ghost btn-sm", href: "#competitions/" + c.id }, "Edit", el("span", { class: "visually-hidden" }, " " + c.name)));
        return el("tr", null,
          el("th", { scope: "row" }, el("a", { href: "#competitions/" + c.id }, c.name), c.kind === "event" ? [" ", el("span", { class: "tag tag-event" }, "Event")] : null, !c.published ? [" ", el("span", { class: "tag tag-position" }, "Draft")] : null,
            c.venue_name ? el("small", null, c.venue_name) : null),
          el("td", null, Y.dateRange(c.start_date, c.end_date), Y.timeRange(c) ? el("small", null, Y.timeRange(c)) : null),
          el("td", null, c.kind === "event" ? "—" : STATE_LABEL[st],
            Y.entryWindow(c) ? el("small", null, Y.entryWindow(c)) : null,
            online ? el("small", null, taken(c) + " of " + (c.capacity || "?") + " places taken (online entry)") : null),
          el("td", { class: "col-actions" }, actions));
      }))));
  }

  // Deleting a competition lives at the bottom of its Details page. One that has entries (or money sent to a host) cannot be
  // deleted: entries and payments are financial records. It can be hidden from the website instead.
  function hideInstead(c, why) {
    openForm({
      title: "“" + c.name + "” cannot be deleted", saveLabel: "Hide it from the website", fields: [],
      intro: why + " Entries and payments are records we need to keep, so this competition stays. You can hide it from the website instead: it keeps everything, but it disappears from the calendar and its entry page closes.",
      onSave: function () {
        return sb.from("competitions").update({ published: false }).eq("id", c.id).then(ok).then(function () { c.published = false; toast("Hidden from the website."); route(); });
      }
    });
  }
  function removeCompetition(c) {
    var counts = canEntry() ? sb.from("entries").select("id,status").eq("competition_id", c.id).then(function (r) { return r.error ? null : r.data || []; }, function () { return null; }) : Promise.resolve(null);
    counts.then(function (rows) {
      if (rows && rows.length) {
        var live = rows.filter(function (e) { return e.status === "paid" || e.status === "comped" || e.status === "held"; }).length;
        return hideInstead(c, "It has " + rows.length + (rows.length === 1 ? " entry" : " entries") + (live ? " (" + live + " still entered or paying)" : " (all cancelled or refunded)") + ".");
      }
      var what = c.kind === "event" ? "event" : "competition";
      openForm({
        title: "Delete “" + c.name + "”?", saveLabel: "Delete this " + what, danger: true, fields: [],
        intro: "This cannot be undone." + (c.kind === "event" ? "" : " It deletes the " + what + " and everything set up for it: its entry settings and prices, extras, discount codes and waiting list. It has no entries, so no entrant is affected."),
        onSave: function () {
          return sb.from("competitions").delete().eq("id", c.id).then(function (r) {
            if (r.error) {
              if (r.error.code === "23503" || /foreign key|violates/i.test(r.error.message || "")) { throw new Error("This " + what + " has entries or payments recorded against it, so it cannot be deleted. Hide it from the website instead (untick “Show on the website”)."); }
              throw r.error;
            }
            toast(c.kind === "event" ? "Event deleted." : "Competition deleted."); go("#competitions");
          });
        }
      });
    });
  }
  // The red zone at the foot of a competition's Details page.
  function deleteZone(c) {
    var what = c.kind === "event" ? "event" : "competition";
    return el("section", { class: "danger-zone", "aria-labelledby": "dz-title" },
      el("h2", { id: "dz-title" }, "Delete this " + what),
      el("p", null, c.kind === "event" ? "Deleting cannot be undone." : "Deleting cannot be undone. A competition that has entries cannot be deleted, because entries and payments are records we keep: you can hide it from the website instead."),
      el("button", { class: "btn btn-danger-solid", type: "button", onclick: function () { removeCompetition(c); } }, "Delete this " + what));
  }

  // A form drawn straight onto the page from a list of fields. Fields may have a `heading` (a section), `show(values)`
  // (hide unless true) and `info(values)` (a line of live text). Returns accessors like openForm does.
  function pageForm(fields, values) {
    var controls = {}, editors = [], wrap = el("div"), grid = null, rules = [];
    fields.forEach(function (f) {
      if (f.heading) { grid = null; wrap.appendChild(el("h2", { class: "form-section" }, f.heading)); if (f.note) wrap.appendChild(el("p", { class: "help" }, f.note)); return; }
      if (f.sub) { grid = null; var subNode = el("h3", { class: "form-sub" }, f.sub); wrap.appendChild(subNode); if (f.show) rules.push({ f: f, node: subNode }); return; }
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
    // The entries team can click through the entry form at any time, whatever the dates say, with nothing saved or charged.
    var previewLink = !isNew && !isEvent && canEntry() && c.slug ? el("a", { class: "btn btn-sm btn-secondary", href: new URL("../enter?c=" + encodeURIComponent(c.slug) + "&preview=1", location.href).href, target: "_blank", rel: "noopener" }, "Preview entry form ", el("span", { class: "visually-hidden" }, "(opens in a new tab)")) : null;
    var head = panelHead(title, previewLink);
    var view = el("div");
    panel.replaceChildren(backLink(), head);
    if (!isNew && !isEvent) {
      var tabs = el("nav", { class: "admin-tabs subtabs", "aria-label": c.name }, el("a", { href: "#competitions/" + c.id, "aria-current": tab === "details" ? "page" : null }, "Details"));
      if (canEntry()) tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/entries", "aria-current": tab === "entries" ? "page" : null }, "Entries"));
      if (canEntry() && c.entry_method === "yne") tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/lifting", "aria-current": tab === "lifting" ? "page" : null }, "Lifting order"));
      if (canEntry() && c.entry_method === "yne") tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/waiting", "aria-current": tab === "waiting" ? "page" : null }, "Waiting list"));
      if (canEntry() && c.entry_method === "yne") tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/volunteers", "aria-current": tab === "volunteers" ? "page" : null }, "Volunteers"));
      if (canEntry()) tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/discounts", "aria-current": tab === "discounts" ? "page" : null }, "Codes and links"));
      if (canEntry()) tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/extras", "aria-current": tab === "extras" ? "page" : null }, "Extras"));
      if (canEntry()) tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/money", "aria-current": tab === "money" ? "page" : null }, "Money"));
      if (canComp()) tabs.appendChild(el("a", { href: "#competitions/" + c.id + "/results", "aria-current": tab === "results" ? "page" : null }, "Results"));
      panel.appendChild(tabs);
    }
    panel.appendChild(view);
    if (tab === "entries" && !isNew && !isEvent) return renderEntriesTab(view, c);
    if (tab === "waiting" && !isNew && !isEvent) return renderWaitingTab(view, c);
    if (tab === "volunteers" && !isNew && !isEvent) return renderVolunteersTab(view, c);
    if (tab === "lifting" && !isNew && !isEvent) return renderLiftingTab(view, c);
    if (tab === "discounts" && !isNew && !isEvent) return renderDiscountsTab(view, c);
    if (tab === "extras" && !isNew && !isEvent) return renderExtrasTab(view, c);
    if (tab === "money" && !isNew && !isEvent) return renderMoneyTab(view, c);
    if (tab === "results" && !isNew && !isEvent) return renderResultsTab(view, c);
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

  // Qualifying totals are typed one per line ("M 83: 450") and kept per weight class.
  function parseTotals(text) {
    var list = [], bad = null;
    String(text || "").split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line || bad) return;
      var m = line.match(/^([MFmf])\s*([0-9]+\+?)\s*[:=,\s]\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kg)?$/);
      if (!m) { bad = line; return; }
      list.push({ sex: m[1].toUpperCase(), label: m[2], total_kg: Number(m[3]) });
    });
    return { list: list, bad: bad };
  }
  function totalsText(rows) {
    return (rows || []).map(function (r) { var w = r.weight_classes || {}; return { sex: w.sex || "", label: w.label || "", order: w.sort_order || 0, kg: Number(r.total_kg) }; })
      .sort(function (p, q) { return p.sex < q.sex ? 1 : p.sex > q.sex ? -1 : p.order - q.order; })      // men first, light to heavy
      .map(function (r) { return r.sex + " " + r.label + ": " + r.kg; }).join("\n");
  }

  function renderCompetitionForm(view, c, isNew) {
    var onlyEntry = !canComp() && canEntry();
    var usualOpen = c.start_date && Y.toLondonInput(c.entry_opens) === Y.addDays(c.start_date, -56) + "T09:00";
    var usualClose = c.start_date && Y.toLondonInput(c.entry_closes) === Y.addDays(c.start_date, -21) + "T12:00";
    var rules = [];
    var settings = {}, prices = [], qtotals = [];
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
        C({ name: "is_university", label: "University competition", type: "checkbox", help: "Lifters choose the university they represent instead of a club, and it shows in place of the club on the entries and the lifting order. The list of universities is on the Calendar page." }),
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
        { sub: "Events", show: isOnline },
        E({ name: "ev_full", label: "Offer full power", type: "checkbox", half: true, show: isOnline }),
        E({ name: "ev_bench", label: "Offer bench only", type: "checkbox", half: true, show: isOnline }),
        { sub: "Equipment", show: isOnline },
        E({ name: "eq_classic", label: "Offer classic", type: "checkbox", half: true, show: isOnline }),
        E({ name: "eq_equipped", label: "Offer equipped", type: "checkbox", half: true, show: isOnline }),
        { sub: "Prices", show: isOnline },
        E({ name: "p_full", label: "Full power price (£)", type: "number", min: "0", half: true, show: isOnline }),
        E({ name: "p_bench", label: "Bench only price (£)", type: "number", min: "0", half: true, show: isOnline }),
        E({ name: "p_sj", label: "Sub-junior price, any event (£, optional)", type: "number", min: "0", show: isOnline, help: "If set, sub-juniors pay this whatever they lift." }),
        { sub: "Franchise and qualifying", show: isOnline },
        E({ name: "is_franchise", label: "This is a franchise competition (run by a host)", type: "checkbox", show: isOnline, help: "Tick it when a host runs the competition: they receive the entry fee less the federation's fixed amount for each entry. Leave it unticked for a competition the federation runs itself: the federation keeps the whole entry fee." }),
        E({ name: "qualification", label: "Qualifying standard", type: "select", show: isOnline, options: [
          { value: "none", label: "None: the OpenIPF link is optional" }, { value: "link", label: "OpenIPF link required, nothing checked" },
          { value: "glp", label: "A minimum GL score" }, { value: "totals", label: "A qualifying total for each weight class" }],
          help: "With a minimum GL score or a qualifying total, the OpenIPF link is required on the entry form, and the form explains that we use it to check their GL points or total. Lifters give their OpenIPF link when they enter. Once they have paid, the site reads their results from OpenIPF (their best total and GL points in the 12 months before the competition, for the same event and kit) and checks them against this. You see the result on each entry." }),
        E({ name: "qualification_glp", label: "Minimum GL points", type: "number", min: "1", show: function (v) { return isOnline(v) && v.qualification === "glp"; } }),
        E({ name: "qualifying_totals_text", label: "Qualifying totals", type: "textarea", rows: 8, show: function (v) { return isOnline(v) && v.qualification === "totals"; },
          help: "One per line: M or F, the weight class, then the total in kg. For example M 83: 450 or F 63: 300. Classes you leave out are not checked." }),
        { sub: "Entry rules", show: isOnline },
        E({ name: "hold_minutes", label: "Minutes a place is held while paying", type: "number", min: "5", show: isOnline, help: "Between 5 and 30. A short hold stops places being parked." }),
        E({ name: "guest_delay_days", label: "Guests can enter this many days after entry opens", type: "number", min: "0", show: isOnline, help: "A guest is anyone outside the Yorkshire & North East division. Usually 14 (two weeks). They are told the date on the entry form." }),
        { sub: "Priority and the waiting list", show: isOnline },
        E({ name: "priority_hours", label: "Priority entry starts this many hours before general entry", type: "number", min: "1", show: isOnline, help: "People on the Codes and links priority list are emailed their personal link when this window opens, and can enter from then until general entry opens. 24 is one day." }),
        E({ name: "priority_from_points", label: "Priority links for volunteers", type: "checkbox", show: isOnline, help: "Everyone with at least one volunteer point is emailed a personal priority link when the priority window opens. Using it costs 1 point, taken only once their entry is confirmed. Untick for a competition where volunteers should not get priority." }),
        E({ name: "offer_window_hours", label: "Hours an offered place is held for the waiting list", type: "number", min: "1", show: isOnline, help: "When the competition is full, the waiting list opens by itself. When a place frees up, the person who has waited longest is emailed a personal link and has this long to use it (up to 168 hours). Then it passes to the next person." }),
        { heading: "Full, closed and waiting list" },
        C({ name: "entries_full", label: "Entries full", type: "checkbox", show: function (v) { return v.method !== "online"; }, help: "Tick when a competition that is entered somewhere else fills up. Online entry marks itself full when the places run out, and the waiting list opens by itself." }),
        E({ name: "entries_closed_manually", label: "Close entries now", type: "checkbox", show: isOnline, help: "Stops new online entries straight away. Untick to reopen." }),
        { heading: "On the website" },
        C({ name: "published", label: "Show on the website", type: "checkbox", help: "Untick to keep it as a draft. A draft can still be tried by signed-in entries staff." })
      ]);
    }
    function load() {
      if (isNew) return Promise.resolve();
      return Promise.all([
        sb.from("entry_settings").select("*").eq("competition_id", c.id).maybeSingle().then(function (r) { return r.error ? null : r.data; }, function () { return null; }),
        sb.from("price_rules").select("*").eq("competition_id", c.id).then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; }),
        sb.from("qualifying_totals").select("total_kg, weight_classes(sex,label,sort_order)").eq("competition_id", c.id).then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; })
      ]).then(function (r) { settings = r[0] || {}; prices = r[1] || []; qtotals = r[2] || []; });
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
        qualification: settings.qualification_mode === "glp" || settings.qualification_mode === "totals" ? settings.qualification_mode : settings.openipf_mode === "required" ? "link" : "none", qualification_glp: settings.qualification_glp === undefined || settings.qualification_glp === null ? "" : Number(settings.qualification_glp), qualifying_totals_text: totalsText(qtotals), hold_minutes: settings.hold_minutes || 5, offer_window_hours: settings.offer_window_hours || 48, priority_hours: settings.priority_hours || 24, guest_delay_days: settings.guest_delay_days === undefined || settings.guest_delay_days === null ? 14 : settings.guest_delay_days,
        entries_closed_manually: !!c.entries_closed_manually, priority_from_points: settings.priority_from_points !== false, is_franchise: isNew ? true : c.is_franchise !== false
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
      if (!isNew && canComp()) view.appendChild(deleteZone(c));

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
          else if (!v.name) problem = "Name is required.";
          else if (!v.start_date) problem = "The first day is required.";
        }
        var totals = v.qualification === "totals" ? parseTotals(v.qualifying_totals_text) : { list: [] };
        if (!problem && canEntry() && totals.bad) problem = "Qualifying totals: this line does not look right: “" + totals.bad + "”. Write M or F, the weight class and the total, like M 83: 450.";
        if (problem) return bar.fail(problem);
        bar.busy(true);
        var row = {
          name: v.name, slug: v.slug, description: v.description, label: v.label, start_date: v.start_date, end_date: v.end_date || null,
          venue_name: v.venue_name, venue_address: v.venue_address, map_url: v.map_url,
          capacity: v.capacity, entry_url: v.method === "link" ? v.entry_url : "",
          entry_opens: opens ? Y.fromLondonInput(opens) : null, entry_closes: closes ? Y.fromLondonInput(closes) : null,
          entries_full: v.entries_full, published: v.published
        };
        if (!!v.is_university !== !!c.is_university) row.is_university = !!v.is_university;          // only sent when it changes, so saving a competition never depends on it
        var step = Promise.resolve(c.id);
        if (canComp()) {
          var q = isNew ? sb.from("competitions").insert(row).select("id").single() : sb.from("competitions").update(row).eq("id", c.id);
          step = q.then(ok).then(function (d) { return isNew ? (Array.isArray(d) ? d[0] : d).id : c.id; });
        }
        step.then(function (id) {
          if (!canEntry()) return id;
          var p = {
            entry_method: v.method === "online" ? "yne" : "external", hold_minutes: v.hold_minutes || 5, guest_delay_days: v.guest_delay_days === null ? 14 : v.guest_delay_days, offer_window_hours: v.offer_window_hours || 48, priority_hours: v.priority_hours || 24, priority_from_points: !!v.priority_from_points, entries_closed_manually: !!v.entries_closed_manually, is_franchise: !!v.is_franchise,
            qualification: v.qualification || "none", qualification_glp: v.qualification === "glp" && v.qualification_glp !== null && v.qualification_glp !== "" ? Number(v.qualification_glp) : null, qualifying_totals: v.qualification === "totals" ? totals.list : undefined,
            events: [v.ev_full && "full_power", v.ev_bench && "bench_only"].filter(Boolean), equipment: [v.eq_classic && "classic", v.eq_equipped && "equipped"].filter(Boolean),
            prices: { full_power: pence(v.p_full), bench_only: pence(v.p_bench), sub_junior: pence(v.p_sj) }
          };
          return sb.rpc("save_entry_settings", { c: id, p: p }).then(function (r) {
            if (r.error) { var m = (r.error.message || "").trim(); throw new Error(ENTRY_ERRORS[m] || friendly(r.error)); }
            return id;
          });
        }).then(function (id) {
          toast(isNew ? "Competition added." : "Saved.");
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
    if (!isNew && canComp()) view.appendChild(deleteZone(c));
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
  // ---- entries desk ------------------------------------------------------------------
  // A list you can search, filter and sort. Each entry is a summary line that opens into the full record, with the
  // actions the entries team needs. Every change is written to the audit log by the database.
  var ENTRY_STATUS = { held: "Paying", paid: "Paid", comped: "Free", cancelled: "Cancelled", refunded: "Refunded" };
  var STATUS_TAG = { held: "tag tag-closed", paid: "tag tag-open", comped: "tag tag-open", cancelled: "tag tag-full", refunded: "tag tag-full" };
  var PLACEHOLDER_BP = /^(tbc|tbd|n\/?a|none|unknown|pending|\?+|-+|x+|0+)$/i;
  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function photoWord(e) { return e.photo_opt_out ? "Do not photograph or film" : e.photo_ok ? "Consents to promotional use" : "Does not consent to promotional use"; }
  function isLive(e, now) { return e.status === "paid" || e.status === "comped" || (e.status === "held" && new Date(e.hold_expires_at) > now); }
  function when(iso) { return iso ? new Date(iso).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" }) : ""; }

  // Entries that share an email or a real membership number with another live entry.
  function duplicateIds(rows) {
    var now = new Date(), byKey = {}, out = {};
    rows.filter(function (e) { return isLive(e, now); }).forEach(function (e) {
      var keys = ["e:" + String(e.email).toLowerCase()];
      var bp = String(e.bp_number || "").trim().toLowerCase();
      if (bp && !PLACEHOLDER_BP.test(bp)) keys.push("b:" + bp);
      keys.forEach(function (k) { (byKey[k] = byKey[k] || []).push(e.id); });
    });
    Object.keys(byKey).forEach(function (k) { if (byKey[k].length > 1) byKey[k].forEach(function (id) { out[id] = true; }); });
    return out;
  }

  function renderEntriesTab(view, c) {
    view.replaceChildren(el("p", null, "Loading…"));
    Promise.all([
      sb.from("entries").select("*, weight_classes(label), divisions(name,is_home), entry_private(*), entry_addons(price_pence, addons(name), addon_options(label)), payments(*, refunds(*))").eq("competition_id", c.id).order("created_at", { ascending: true }),
      sb.from("divisions").select("id,name").order("sort_order"),
      sb.from("weight_classes").select("id,sex,label,sort_order").order("sort_order"),
      sb.from(c.is_university ? "universities" : "clubs").select("name").eq("active", true).order("name")          // a university competition picks universities instead of clubs
    ]).then(function (res) {
      var ids = (res[0].data || []).map(function (x) { return x.id; });
      if (!ids.length) { res.push({ data: [] }); return res; }
      return sb.from("entry_requests").select("*").in("entry_id", ids).order("created_at", { ascending: true }).then(function (rr) { res.push(rr); return res; }, function () { res.push({ data: [] }); return res; });
    }).then(function (res) {
      var rows = ok(res[0]), refs = { divisions: res[1].data || [], classes: res[2].data || [], clubs: res[3].data || [], clubLabel: c.is_university ? "University" : "Club" };
      var reqs = ((res[4] && !res[4].error && res[4].data) || []).filter(function (r) { return r.kind !== "update"; }), pendingReqs = reqs.filter(function (r) { return r.status === "pending"; }), pendByEntry = {};
      pendingReqs.forEach(function (r) { pendByEntry[r.entry_id] = r; });
      var dup = duplicateIds(rows), now = new Date();
      var S = { q: "", status: "entered", guests: false, dupes: false, sort: "newest" };
      var live = rows.filter(function (e) { return e.status === "paid" || e.status === "comped"; });
      var total = live.reduce(function (n, e) { return n + e.price_pence; }, 0);
      var belowStd = rows.filter(function (e) { return e.qualification === "not_met" && isLive(e, now); }).length;
      var toCheck = rows.filter(function (e) { return e.is_guest && !e.membership_checked && isLive(e, now); }).length;
      var list = el("div", { class: "entry-list" }), count = el("p", { class: "help", role: "status" });

      function reload() { renderEntriesTab(view, c); }
      // ---- requests from lifters: approve or decline (a different weight class or equipment, or cancelling) ----------------------------
      function callWaitlist(body) {
        return sb.auth.getSession().then(function (g) {
          var token = g.data && g.data.session && g.data.session.access_token;
          return fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", { method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "", Authorization: "Bearer " + (token || "") }, body: JSON.stringify(body) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (r.status === 401) throw new Error("You do not have permission to do that."); if (!r.ok || b.ok === false) throw new Error(b.message || "That did not work. Please try again."); return b; }); });
      }
      function afterDialog(fn) { var d = $("dlg"); d.addEventListener("close", function once() { d.removeEventListener("close", once); fn(); }); }
      function reqWords(r) { return Object.keys(r.after || {}).map(function (k) { return k + ": " + (r.before && r.before[k] ? r.before[k] + " to " + r.after[k] : r.after[k]); }).join("; "); }
      function reviewRequest(r) {
        var e = rows.filter(function (x) { return x.id === r.entry_id; })[0]; if (!e) return;
        var cancel = r.kind === "cancel", closed = c.entry_closes && new Date(c.entry_closes) <= new Date();
        sb.from("lo_assignments").select("flight_id, lo_flights(letter, lo_sessions(session_no, day))").eq("entry_id", e.id).maybeSingle().then(function (lo) {
          var fl = lo && lo.data && one(lo.data.lo_flights), ss = fl && one(fl.lo_sessions), where = fl ? "session " + (ss ? ss.session_no : "?") + ", flight " + fl.letter : "";
          openForm({
            title: (cancel ? "Cancellation request: " : "Change request: ") + e.full_name, saveLabel: cancel ? "Approve and cancel the entry…" : "Approve", fields: [],
            intro: reqWords(r) + "." + (r.note ? " Their note: “" + r.note + "”." : "") + (cancel ? (closed || (r.changes && r.changes.refund_possible === false) ? " Entries have closed, so no refund is due." : " Approving opens Cancel or refund so you can choose what to refund.") : " Approving makes the change and emails them.") + (where ? " They are in the lifting order (" + where + "), so it will need updating." : ""),
            extra: [{ label: "Decline…", onclick: function () { declineRequest(r, e); } }],
            onSave: function () {
              if (cancel) { afterDialog(function () { cancelOrRefund(e, c, reload, { reason: r.note || "Cancellation requested by the lifter", onDone: function () { return callWaitlist({ action: "entry_request_decide", request_id: r.id, approve: true }).then(function () { toast("Request approved."); }); } }); }); return Promise.resolve(); }
              return callWaitlist({ action: "entry_request_decide", request_id: r.id, approve: true }).then(function (b) {
                var notes = []; if (b.lifting_order) notes.push(e.full_name + " is in the lifting order (session " + b.lifting_order.session_no + ", flight " + b.lifting_order.flight + "). The change is made, but the lifting order has not moved them: please update it.");
                if (b.qualification === "not_met") notes.push("They are now below the qualifying standard for this competition.");
                toast("Request approved. They have been emailed.");
                afterDialog(function () { reload(); if (notes.length) openForm({ title: "Remember the lifting order", fields: [], saveLabel: b.lifting_order ? "Open the lifting order" : "Close", intro: notes.join(" "), onSave: function () { if (b.lifting_order) location.hash = "#competitions/" + c.id + "/lifting"; return Promise.resolve(); } }); });
              });
            }
          });
        });
      }
      function declineRequest(r, e) {
        openForm({ title: "Decline: " + e.full_name, saveLabel: "Decline request", danger: true, intro: "They are emailed the reason. Their entry stays as it is.",
          fields: [{ name: "reason", label: "Reason", type: "textarea", rows: 3, required: true }],
          onSave: function (v) { return callWaitlist({ action: "entry_request_decide", request_id: r.id, approve: false, reason: v.reason }).then(function () { toast("Request declined. They have been emailed."); reload(); }); } });
      }
      var reqBox = pendingReqs.length ? el("section", { class: "card", "aria-labelledby": "req-h", style: "margin-bottom:var(--space-5)" }, el("h2", { id: "req-h" }, "Requests (" + pendingReqs.length + ")"),
        el("p", { class: "help" }, "Lifters ask for a different weight class or equipment, or to cancel. Nothing changes until you approve it."),
        el("ul", { class: "item-list" }, pendingReqs.map(function (r) {
          var e = rows.filter(function (x) { return x.id === r.entry_id; })[0] || {};
          return el("li", { class: "item-row" }, el("div", { class: "item-main" }, el("p", { class: "item-title" }, (e.full_name || "A lifter") + ": " + (r.kind === "cancel" ? "wants to cancel" : "change requested")),
            el("p", { class: "item-sub" }, reqWords(r) + (r.note ? " · “" + r.note + "”" : "") + " · asked " + new Date(r.created_at).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" }))),
            el("span", { class: "actions" }, el("button", { type: "button", class: "btn btn-sm btn-primary", onclick: function () { reviewRequest(r); } }, "Review", el("span", { class: "visually-hidden" }, " " + (e.full_name || "request")))));
        }))) : null;
      function matches(e) {
        if (S.status === "entered" && !(e.status === "paid" || e.status === "comped")) return false;
        if (S.status === "paying" && !(e.status === "held")) return false;
        if (S.status === "gone" && !(e.status === "cancelled" || e.status === "refunded")) return false;
        if (S.guests && !(e.is_guest && isLive(e, now))) return false;
        if (S.dupes && !dup[e.id]) return false;
        if (S.q) {
          var hay = [e.full_name, e.display_name, e.email, e.club, e.bp_number, e.instagram].join(" ").toLowerCase();
          if (S.q.toLowerCase().split(/\s+/).some(function (w) { return w && hay.indexOf(w) < 0; })) return false;
        }
        return true;
      }
      var SORTS = {
        newest: function (a, b) { return new Date(b.created_at) - new Date(a.created_at); },
        name: function (a, b) { return String(a.full_name).localeCompare(String(b.full_name)); },
        class: function (a, b) { return (a.sex === b.sex ? 0 : a.sex === "F" ? -1 : 1) || (parseFloat(one(a.weight_classes) && one(a.weight_classes).label) || 999) - (parseFloat(one(b.weight_classes) && one(b.weight_classes).label) || 999) || String(a.full_name).localeCompare(String(b.full_name)); },
        category: function (a, b) { return String(catFor(a.date_of_birth, c.start_date)).localeCompare(String(catFor(b.date_of_birth, c.start_date))) || String(a.full_name).localeCompare(String(b.full_name)); }
      };
      function draw() {
        var shown = rows.filter(matches).sort(SORTS[S.sort]);
        count.textContent = shown.length + " shown of " + rows.length + " records.";
        list.replaceChildren.apply(list, shown.length ? shown.map(entryRow) : [el("p", { class: "empty" }, rows.length ? "Nothing matches those filters." : "No entries yet.")]);
      }

      function entryRow(e) {
        var wc = one(e.weight_classes), dv = one(e.divisions), cat = CAT_LABEL[catFor(e.date_of_birth, c.start_date)];
        var summary = el("summary", null,
          el("span", { class: "entry-name" }, el("strong", null, e.full_name), el("small", null, e.email)),
          el("span", { class: "entry-lift" }, [(e.sex === "M" ? "Men's " : "Women's ") + (wc ? wc.label + " kg" : ""), cat, e.event === "bench_only" ? "Bench only" : "Full power", e.equipment === "equipped" ? "Equipped" : "Classic"].filter(Boolean).join(" · ")),
          el("span", { class: "entry-flags" }, el("span", { class: STATUS_TAG[e.status] || "tag" }, ENTRY_STATUS[e.status] || e.status),
            e.is_guest && !e.membership_checked ? [" ", el("span", { class: "tag tag-position" }, "Guest: check")] : null,
            pendByEntry[e.id] ? [" ", el("span", { class: "tag tag-position" }, pendByEntry[e.id].kind === "cancel" ? "Cancel request" : "Change request")] : null,
            dup[e.id] ? [" ", el("span", { class: "tag tag-full" }, "Possible duplicate")] : null,
            e.qualification === "not_met" && (e.status === "paid" || e.status === "comped") ? [" ", el("span", { class: "tag tag-full" }, "Below qualifying standard")] : null),
          el("span", { class: "entry-money" }, entryMoney(e.price_pence)));
        var body = el("div", { class: "entry-body" });
        var d = el("details", { class: "entry-row" }, summary, body);
        var filled = false;
        d.addEventListener("toggle", function () { if (d.open && !filled) { filled = true; fillBody(body, e, d); } });
        return d;
      }

      // What the OpenIPF lookup found for an entry (see the waitlist function).
      function openipfPairs(e) {
        var link = e.openipf_url ? el("a", { href: e.openipf_url, target: "_blank", rel: "noopener" }, e.openipf_url) : "";
        var pairs = [["OpenIPF profile", link]];
        if (!e.openipf_url) return pairs;
        var st = e.openipf_status, text;
        if (st === "found") text = (e.openipf_name ? "Profile: " + e.openipf_name + ". " : "") + (e.best_total_kg !== null && e.best_total_kg !== undefined ? "Best total in the 12 months before the competition: " + Number(e.best_total_kg) + " kg, best GL points " + Number(e.best_glp) + "." : "No result found for this event and kit in the last 12 months.");
        else if (st === "pending") text = "Waiting to be checked (it happens within a few minutes of the entry being confirmed).";
        else if (st === "not_found") text = "No OpenIPF profile found at that address.";
        else if (st === "error") text = "Could not be checked yet; it is tried again automatically.";
        else text = "Not checked.";
        pairs.push(["OpenIPF check", text + (e.openipf_note ? " " + e.openipf_note : "")]);
        if (e.qualification === "met") pairs.push(["Qualifying standard", "Meets the standard"]);
        if (e.qualification === "not_met") pairs.push(["Qualifying standard", el("strong", null, "Below the standard")]);
        return pairs;
      }
      function recheckOpenipf(e) {
        sb.rpc("openipf_recheck", { eid: e.id }).then(function (r) { if (r.error) throw r.error; return sb.auth.getSession(); }).then(function (s) {
          var token = s.data && s.data.session && s.data.session.access_token;
          return fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", { method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "", Authorization: "Bearer " + token }, body: JSON.stringify({ action: "openipf_run" }) });
        }).then(function (r) { if (!r.ok) throw new Error("It is queued, and the timer will check it within a few minutes."); toast("Checked."); reload(); })
          .catch(function (er) { toast(friendly(er), er && /queued/.test(er.message || "") ? undefined : "error"); reload(); });
      }

      function dlRows(pairs) {
        return el("dl", { class: "entry-dl" }, pairs.filter(Boolean).map(function (p) { return [el("dt", null, p[0]), el("dd", null, p[1] === "" || p[1] === null || p[1] === undefined ? "Not given" : p[1])]; }));
      }
      function fillBody(body, e, d) {
        var wc = one(e.weight_classes), dv = one(e.divisions), priv = one(e.entry_private), pays = (e.payments || []).filter(function (p) { return p.status === "succeeded"; });
        var pay = pays[0];
        var age = (function () { var b = new Date(e.date_of_birth), s = new Date(c.start_date), a = s.getUTCFullYear() - b.getUTCFullYear(); if (s.getUTCMonth() < b.getUTCMonth() || (s.getUTCMonth() === b.getUTCMonth() && s.getUTCDate() < b.getUTCDate())) a--; return a; })();
        body.replaceChildren.apply(body, [
          el("h3", null, "Lifter"),
          dlRows([["Name on public lists", e.display_name || e.full_name], ["Email", el("a", { href: "mailto:" + e.email }, e.email)],
            ["Date of birth", e.date_of_birth + " (age " + age + " on the day)"], ["Age category", CAT_LABEL[catFor(e.date_of_birth, c.start_date)]],
            ["Instagram", e.instagram ? "@" + e.instagram : ""], ["Photos", photoWord(e)]]),
          el("h3", null, "Lifting"),
          dlRows([["Category", e.sex === "M" ? "Men's" : "Women's"], ["Weight class", wc ? wc.label + " kg" : ""], ["Event", e.event === "bench_only" ? "Bench only" : "Full power"], ["Equipment", e.equipment === "equipped" ? "Equipped" : "Classic"]
            ].concat(openipfPairs(e), [["Can break records", e.can_break_records ? "Yes" : "No"]])),
          el("h3", null, "Federation and membership"),
          dlRows([["Federation or division", dv ? dv.name + (dv.is_home ? "" : " (guest)") : ""], [refs.clubLabel, e.club], ["Membership number", e.bp_number],
            e.is_guest ? ["Membership checked", e.membership_checked ? "Yes" : "Not yet"] : null]),
          priv && priv.guardian_name ? el("div", null, el("h3", null, "Parent or guardian"), dlRows([["Name", priv.guardian_name], ["Phone", priv.guardian_phone], ["Email", priv.guardian_email], ["Consent given", priv.guardian_consent ? "Yes" : "No"]])) : null,
          el("h3", null, "Payment"),
          dlRows([["Status", ENTRY_STATUS[e.status] || e.status], ["Amount", entryMoney(e.price_pence)], (e.entry_addons || []).length ? ["Extras", e.entry_addons.map(function (x) { return (x.addons ? x.addons.name : "Extra") + (x.addon_options ? " (" + x.addon_options.label + ")" : "") + " " + money(x.price_pence); }).join(", ")] : null, ["Entered", when(e.created_at)], ["Paid", when(e.paid_at)],
            pay ? ["Card", (pay.card_brand || "card") + (pay.card_last4 ? " ending " + pay.card_last4 : "")] : null,
            pay && pay.receipt_url ? ["Receipt", el("a", { href: pay.receipt_url, target: "_blank", rel: "noopener" }, "Open the Stripe receipt")] : null,
            pay ? ["Stripe fee", entryMoney(pay.stripe_fee_pence)] : null,
            e.status === "cancelled" || e.status === "refunded" ? ["Cancelled", when(e.cancelled_at) + (e.cancel_reason ? ": " + e.cancel_reason : "")] : null]),
          pay && (pay.refunds || []).length ? el("ul", { class: "history-list" }, pay.refunds.map(function (r) { return el("li", null, el("strong", null, entryMoney(r.amount_pence) + " refunded"), " · " + when(r.created_at) + " · " + (r.created_by || "") + (r.reason ? " · " + r.reason : "")); })) : null,
          e.entry_note ? el("div", null, el("h3", null, "Private note"), el("p", null, e.entry_note)) : null,
          el("div", { class: "actions", style: "margin-top:var(--space-4)" },
            btn("Edit", function () { editEntry(e, c, refs, reload); }, "btn-secondary"),
            e.openipf_url && (e.status === "paid" || e.status === "comped") ? btn("Check OpenIPF again", function () { recheckOpenipf(e); }) : null,
            e.is_guest ? btn(e.membership_checked ? "Mark membership unchecked" : "Mark membership checked", function () {
              sb.from("entries").update({ membership_checked: !e.membership_checked }).eq("id", e.id).then(ok).then(function () { toast("Updated."); reload(); }).catch(function (er) { toast(friendly(er), "error"); });
            }) : null,
            e.status === "paid" || e.status === "comped" || e.status === "held" ? btn("Cancel or refund…", function () { cancelOrRefund(e, c, reload); }, "btn-danger") : null,
            btn("Show history", function () { showHistory(body, e); }))].filter(Boolean));
          showRequestHistory(body, e);
      }

      // Toolbar
      var q = el("input", { class: "control", type: "search", id: "entry-search", placeholder: "Search name, email or " + refs.clubLabel.toLowerCase(), "aria-label": "Search entries", oninput: function (ev) { S.q = ev.target.value.trim(); draw(); } });
      var st = el("select", { class: "control", id: "entry-status", "aria-label": "Show", onchange: function (ev) { S.status = ev.target.value; draw(); } },
        [["entered", "Entered (paid and free)"], ["paying", "Paying now"], ["gone", "Cancelled and refunded"], ["all", "Everything"]].map(function (o) { return el("option", { value: o[0] }, o[1]); }));
      var so = el("select", { class: "control", id: "entry-sort", "aria-label": "Sort by", onchange: function (ev) { S.sort = ev.target.value; draw(); } },
        [["newest", "Newest first"], ["name", "Name A to Z"], ["class", "Weight class"], ["category", "Age category"]].map(function (o) { return el("option", { value: o[0] }, o[1]); }));
      var g = el("div", { class: "field-check" }, el("input", { type: "checkbox", id: "entry-guests", onchange: function (ev) { S.guests = ev.target.checked; draw(); } }), el("label", { for: "entry-guests" }, "Guests to check"));
      var dp = el("div", { class: "field-check" }, el("input", { type: "checkbox", id: "entry-dupes", onchange: function (ev) { S.dupes = ev.target.checked; draw(); } }), el("label", { for: "entry-dupes" }, "Possible duplicates"));

      view.replaceChildren(
        reqBox,
        el("div", { class: "actions", style: "margin-bottom:var(--space-3)" },
          btn("Add entry", function () { addEntry(c, refs, reload); }, "btn-primary"),
          c.slug ? el("a", { class: "btn btn-sm btn-secondary", href: "../entries?c=" + encodeURIComponent(c.slug), target: "_blank", rel: "noopener" }, "Public list") : null,
          btn("Download CSV", function () { downloadEntries(c); }, "btn-ghost")),
        el("p", { class: "panel-intro" }, live.length + " entered of " + (c.capacity || "?") + " places. Entry money taken: " + entryMoney(total) + "." +
          (toCheck ? " " + toCheck + (toCheck === 1 ? " guest" : " guests") + " to check." : "") + (belowStd ? " " + belowStd + " below the qualifying standard." : "") + (pendingReqs.length ? " " + pendingReqs.length + (pendingReqs.length === 1 ? " request" : " requests") + " waiting." : "") + (Object.keys(dup).length ? " " + Object.keys(dup).length + " entries share an email or membership number with another." : "")),
        el("div", { class: "control-row" }, q, st, so), el("div", { class: "control-row checks" }, g, dp), count, list);
      draw();
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  // ---- money --------------------------------------------------------------------------------------
  // How the takings are split (host, federation, photographer) and what is left to send to each, once Stripe's fees are taken
  // out. The figures come from the database (competition_settlement), which always adds up to the penny.
  var MONEY_ERRORS = { forbidden: "You do not have permission to change who gets paid.", "invalid:host_name": "Enter the name of the host (the gym or venue).", "invalid:percent": "Percentages must be between 0 and 100.",
    "invalid:payee_kind": "That name is already used for a different kind of payee. Use a different name." };
  var CATEGORY_NAMES = { entry: "Entry money", merch: "Merchandise", photo: "Photo packages" };
  function money(p) { return (p < 0 ? "−" : "") + "£" + (Math.abs(p) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }




  // ---- Results: the link to this competition's meet on OpenIPF, shown on the calendar as "View results" ---------
  function renderResultsTab(view, c) {
    var form = pageForm([
      { name: "openipf_url", label: "OpenIPF meet results link", type: "url", placeholder: "https://www.openipf.org/meet/…",
        help: "Paste the link to this competition's results page on OpenIPF once the results are up. A “View results” button then appears on the calendar. Clear the box to take it off." }
    ], { openipf_url: c.openipf_url || "" });
    var bar = saveBar(null, "Save");
    var f = el("form", { novalidate: true }, form.el, bar.el);
    view.replaceChildren(f);
    f.addEventListener("submit", function (e) {
      e.preventDefault(); bar.clear();
      var url = String(form.get("openipf_url") || "").trim();
      if (url && !/^https:\/\//i.test(url)) return bar.fail("The link must start with https://", form.input("openipf_url"));
      bar.busy(true);
      sb.from("competitions").update({ openipf_url: url }).eq("id", c.id).then(ok).then(function () { c.openipf_url = url; toast(url ? "Results link saved." : "Results link removed."); bar.busy(false); })
        .catch(function (err) { bar.busy(false); bar.fail(friendly(err)); });
    });
  }


  // ---- Lifting order: sort the entered lifters into days, sessions and flights, then adjust by hand -------------------------------
  // The auto sort is in assets/js/lifting-sort.js. This screen runs it on the competition's real entries, lets the team move lifters
  // between flights (a "Move to" menu, and up and down), and saves the arrangement. Nothing here is public yet.
  function renderLiftingTab(view, c) {
    var LSo = window.LiftingSort;
    view.replaceChildren(el("p", null, "Loading…"));
    Promise.all([
      sb.from("entries").select("id,full_name,sex,event,equipment,date_of_birth,best_total_kg,best_glp,status,bp_number,club,instagram,is_guest,can_break_records,weight_classes(label),divisions(name)").eq("competition_id", c.id).in("status", ["paid", "comped"]),
      sb.from("lifting_orders").select("*").eq("competition_id", c.id).maybeSingle(),
      sb.from("lo_sessions").select("*, lo_flights(id,letter,locked, lo_assignments(entry_id,position,locked,lot_number,reason))").eq("competition_id", c.id).order("day").order("session_no"),
      sb.from("site_settings").select("value").eq("key", "openlifter.settings").maybeSingle().then(function (r) { return r; }, function () { return {}; })
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      var ent = {}, list = [];
      (res[0].data || []).forEach(function (e) {
        var wc = one(e.weight_classes);
        var x = { id: e.id, name: e.full_name, sex: e.sex, classLabel: wc ? wc.label : "", ageClass: e.date_of_birth ? CAT_LABEL[catFor(e.date_of_birth, c.start_date)] : "", ageCat: e.date_of_birth ? catFor(e.date_of_birth, c.start_date) : "", dob: e.date_of_birth, equipment: e.equipment, bp: e.bp_number, club: e.club, instagram: e.instagram, guest: !!e.is_guest, divisionName: (one(e.divisions) || {}).name || "", canBreakRecords: e.can_break_records !== false, event: e.event, total: e.best_total_kg === null || e.best_total_kg === undefined ? null : Number(e.best_total_kg), glp: e.best_glp === null || e.best_glp === undefined ? null : Number(e.best_glp) };
        ent[e.id] = x; list.push(x);
      });
      var row = (res[1] && !res[1].error && res[1].data) || {};
      var settings = { days: row.days || "", sessions: row.sessions || "",         prime_time: !!row.prime_time_enabled, prime_women: row.prime_time_women || 14, prime_men: row.prime_time_men || 14, women_first: row.women_first !== false, seconds_per_attempt: row.seconds_per_attempt || 45, show_glp: row.show_glp !== false, show_total: row.show_total !== false };
      var S = { sessions: [], dirty: false, warnings: [], dropped: 0, showLots: false };
      // the saved arrangement (lifters who have cancelled since are dropped)
      ((res[2] && !res[2].error && res[2].data) || []).forEach(function (s) {
        var flights = (s.lo_flights || []).slice().sort(function (p, q) { return p.letter.length - q.letter.length || (p.letter < q.letter ? -1 : 1); }).map(function (f) {
          var lifters = (f.lo_assignments || []).slice().sort(function (p, q) { return p.position - q.position; }).filter(function (a) { if (ent[a.entry_id]) return true; S.dropped++; return false; })
            .map(function (a) { return { id: a.entry_id, reason: a.reason || "", locked: !!a.locked, lot: a.lot_number }; });
          return { letter: f.letter, locked: !!f.locked, lifters: lifters };
        });
        S.sessions.push({ day: s.day, sessionNo: s.session_no, prime: !!s.is_prime_time, name: s.name || "", liftOff: s.lift_off_at || null, weighIn: s.weigh_in_at || null, awards: s.awards_at || null, flights: flights });
      });
      if (S.dropped) S.dirty = true;

      var form = pageForm([
        { name: "days", label: "Days", type: "number", min: "1", half: true, placeholder: "Worked out for you" },
        { name: "sessions", label: "Sessions", type: "number", min: "1", half: true, placeholder: "Worked out for you" },
        { name: "prime_time", label: "Prime time", type: "checkbox", help: "Makes the last session prime time, for the top lifters by GL points." },
        { name: "prime_women", label: "Women in prime time", type: "number", min: "1", max: "14", half: true, show: function (v) { return v.prime_time; } },
        { name: "prime_men", label: "Men in prime time", type: "number", min: "1", max: "14", half: true, show: function (v) { return v.prime_time; } },
        { name: "women_first", label: "Put the women's flight first in each session", type: "checkbox" }
      ], settings);
      var secForm = pageForm([{ name: "seconds_per_attempt", label: "Seconds per attempt", type: "number", min: "15", max: "180", half: true, help: "Used to estimate when each session finishes. 45 is the usual: about 3.5 hours for two full flights." },
        { name: "show_glp", label: "Show GL points on the public lifting order", type: "checkbox" },
        { name: "show_total", label: "Show best totals on the public lifting order", type: "checkbox" }], { seconds_per_attempt: settings.seconds_per_attempt, show_glp: settings.show_glp, show_total: settings.show_total });
      secForm.el.addEventListener("change", function () { S.dirty = true; status(); draw(); });
      form.el.addEventListener("input", function () { S.dirty = true; status(); });
      form.el.addEventListener("change", function () { S.dirty = true; status(); });

      var area = el("div"), statusNode = el("span", { class: "help", id: "lo-status", role: "status", style: "margin-left:var(--space-3)" });
      function settingsNow() {
        var v = form.values();
        return { days: v.days ? Math.round(v.days) : null, sessions: v.sessions ? Math.round(v.sessions) : null, maxFullPower: 14, maxPerFlight: 20,         // the federation's rules: not a setting
          womenFirst: !!v.women_first, secondsPerAttempt: Math.round(secForm.values().seconds_per_attempt) || 45, showGlp: !!secForm.values().show_glp, showTotal: !!secForm.values().show_total, primeTime: { enabled: !!v.prime_time, women: Math.round(v.prime_women) || 14, men: Math.round(v.prime_men) || 14 } };
      }
      function status() { statusNode.textContent = S.dirty ? "Not saved yet" : (S.sessions.length ? "Saved" : ""); window.onbeforeunload = S.dirty ? function () { return ""; } : null; }
      function flightsList() { var out = []; S.sessions.forEach(function (s) { s.flights.forEach(function (f) { out.push({ s: s, f: f, key: s.day + ":" + f.letter }); }); }); return out; }
      function placed() { var m = {}; flightsList().forEach(function (x) { x.f.lifters.forEach(function (l) { m[l.id] = true; }); }); return m; }
      function sexOf(f) { var a = {}; f.lifters.forEach(function (l) { a[(ent[l.id] || {}).sex === "F" ? "F" : "M"] = 1; }); var k = Object.keys(a); return k.length > 1 ? "mixed" : k[0] === "F" ? "women" : k[0] === "M" ? "men" : ""; }

      // Lot numbers are a draw: one block of consecutive numbers per flight, women then men, shuffled inside. They are not public.
      function lotsState() {
        var any = false, ok = true, next = 1, missing = 0;
        flightsList().forEach(function (x) {
          var lots = x.f.lifters.map(function (l) { return l.lot; });
          if (lots.some(function (n) { return n; })) any = true;
          if (lots.some(function (n) { return !n; })) missing++;
          var sorted = lots.filter(Boolean).sort(function (a, b) { return a - b; });
          if (x.f.lifters.length && (sorted.length !== lots.length || sorted[0] !== next || sorted[sorted.length - 1] !== next + lots.length - 1)) ok = false;
          next += lots.length;
        });
        return { any: any, ok: ok };
      }
      function drawLots() {
        var ls = lotsState();
        if (!flightsList().length) return;
        if (ls.any && !window.confirm("Lot numbers have already been drawn. Drawing again gives everyone a new number. Only do this if the old ones have not been used or sent out. Carry on?")) return;
        var lots = LSo.assignLots(flightsList().map(function (x) { return { lifters: x.f.lifters.map(function (l) { return { id: l.id, sex: ent[l.id].sex }; }) }; }));
        flightsList().forEach(function (x) { x.f.lifters.forEach(function (l) { l.lot = lots[l.id]; }); });
        S.showLots = true; S.dirty = true; status(); say("Lot numbers drawn. Save to keep them."); draw();
      }
      function removeLots() {
        if (!window.confirm("Remove all lot numbers? You can draw them again afterwards, but they will be different numbers.")) return;
        flightsList().forEach(function (x) { x.f.lifters.forEach(function (l) { l.lot = null; }); });
        S.showLots = false; S.dirty = true; status(); say("Lot numbers removed. Save to keep that."); draw();
      }
      function runSort() {
        if (S.sessions.length) return;           // the sort is run once; after that the order is arranged by hand
        var out = LSo.build(list, settingsNow());
        var oldTimes = {}; S.sessions.forEach(function (o) { oldTimes[o.day + ":" + o.sessionNo] = o; });
        S.showLots = false; S.sessions = out.sessions.map(function (s) { var ot = oldTimes[s.day + ":" + s.sessionNo] || {}; return { day: s.day, sessionNo: s.sessionNo, prime: s.prime, name: s.name, liftOff: ot.liftOff || null, weighIn: ot.weighIn || null, awards: ot.awards || null, flights: s.flights.map(function (f) { return { letter: f.letter, locked: false, lifters: f.lifters.map(function (l) { return { id: l.id, reason: l.reason, locked: false, lot: null }; }) }; }) }; });
        S.warnings = out.warnings; S.dirty = true; S.dropped = 0; status(); draw();
      }
      function clearOrder() {
        if (!window.confirm("Clear the whole lifting order? Everyone goes back to Not in the lifting order, and you can sort the entries again. Times and lot numbers for these flights are lost.")) return;
        S.sessions = []; S.warnings = []; S.showLots = false; S.dirty = true; status(); say("The lifting order has been cleared."); draw();
      }
      // letters run A, B, C through each day and start again the next day; sessions are numbered from 1 each day
      function relabel() {
        var perDay = {}, lastDay = {};
        S.sessions.forEach(function (x) { perDay[x.day] = (perDay[x.day] || 0) + 1; x.sessionNo = perDay[x.day]; });
        var li = {}; S.sessions.forEach(function (x) { x.flights.forEach(function (f) { li[x.day] = li[x.day] || 0; f.letter = LSo.letter(li[x.day]++); }); });
      }
      function removeFlight(s, f) {
        s.flights = s.flights.filter(function (x) { return x !== f; }); relabel(); S.dirty = true; status();
        say("Flight removed." + (f.lifters.length ? " " + f.lifters.length + " lifters are now not in the lifting order." : "")); draw();
      }
      function removeSession(s) {
        S.sessions = S.sessions.filter(function (x) { return x !== s; }); relabel(); S.dirty = true; status();
        say("Session removed. Its lifters are now not in the lifting order."); draw();
      }
      function addFlight(s) { s.flights.push({ letter: "", locked: false, lifters: [] }); relabel(); S.dirty = true; status(); say("Flight added."); draw(); }
      function addSession() {
        var day = S.sessions.length ? S.sessions[S.sessions.length - 1].day : 1;
        S.sessions.push({ day: day, sessionNo: 0, prime: false, name: "", liftOff: null, weighIn: null, awards: null, flights: [{ letter: "", locked: false, lifters: [] }] }); relabel(); S.dirty = true; status(); say("Session added."); draw();
      }
      function remove(id) { flightsList().forEach(function (x) { x.f.lifters = x.f.lifters.filter(function (l) { return l.id !== id; }); }); }
      function find(id) { var out = null; flightsList().forEach(function (x, fi) { x.f.lifters.forEach(function (l, i) { if (l.id === id) out = { f: fi, i: i, flight: x.f, item: l }; }); }); return out; }
      // Put a lifter in a flight at a place (or take them out with letter "out"). beside = the lifter they were dropped next to.
      function placeAt(id, letter, besideId, before) {
        if (besideId === id) return false;
        var was = find(id), item = was ? was.item : { id: id, reason: "", locked: false, lot: null }, fromLetter = was ? was.flight.letter : "out";
        remove(id);
        if (letter === "out") { S.dirty = true; status(); return fromLetter !== "out"; }
        var target = flightsList().filter(function (x) { return x.key === letter; })[0]; if (!target) return false;
        var at = besideId ? target.f.lifters.findIndex(function (l) { return l.id === besideId; }) + (before ? 0 : 1) : target.f.lifters.length;
        if (besideId && at < (before ? 0 : 1)) at = target.f.lifters.length;
        item.reason = "Moved here by hand"; target.f.lifters.splice(at, 0, item); S.dirty = true; status(); return true;
      }
      // Keyboard: one step through the whole order. Down goes later in the flight, then into the next flight; up the other way, and out of the first flight takes them out.
      function stepBy(id, dir) {
        var cur = find(id), fl = flightsList(); if (!fl.length) return "";
        if (!cur) { if (dir > 0) { var t = fl[0].f; t.lifters.unshift({ id: id, reason: "Moved here by hand", locked: false, lot: null }); S.dirty = true; status(); return "Flight " + t.letter + ", place 1 of " + t.lifters.length; } return "Not in the lifting order"; }
        var ls = cur.flight.lifters, j = cur.i + dir;
        if (j >= 0 && j < ls.length) { var tmp = ls[cur.i]; ls[cur.i] = ls[j]; ls[j] = tmp; S.dirty = true; status(); return "Flight " + cur.flight.letter + ", place " + (j + 1) + " of " + ls.length; }
        var nf = cur.f + dir;
        if (nf < 0) { remove(id); S.dirty = true; status(); return "Taken out of the lifting order"; }
        if (nf >= fl.length) return "Flight " + cur.flight.letter + ", place " + (cur.i + 1) + " of " + ls.length + ", the last place";
        remove(id); var dest = fl[nf].f, it = cur.item; it.reason = "Moved here by hand";
        if (dir > 0) dest.lifters.unshift(it); else dest.lifters.push(it);
        S.dirty = true; status(); return "Flight " + dest.letter + ", place " + (dir > 0 ? 1 : dest.lifters.length) + " of " + dest.lifters.length;
      }

      var kb = null;                       // keyboard: the lifter picked up, and the order as it was
      var live = el("div", { class: "visually-hidden", role: "status", "aria-live": "polite", id: "lo-live" });
      function say(t) { live.textContent = ""; window.setTimeout(function () { live.textContent = t; }, 30); }

      // ---- dragging with a mouse or a finger (pointer events)
      function startDrag(e, id) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        var handle = e.currentTarget, rowEl = handle.closest("tr"), ghost = el("div", { class: "drag-ghost", "aria-hidden": "true" }, ent[id].name + "  ·  " + (ent[id].sex === "F" ? "W " : "M ") + ent[id].classLabel);
        document.body.appendChild(ghost); document.body.classList.add("dragging-lifter"); rowEl.classList.add("is-dragging");
        try { handle.setPointerCapture(e.pointerId); } catch (x) { /* fine without */ }
        var drop = null, scroller = null, lastY = e.clientY;
        function clear() { Array.prototype.forEach.call(area.querySelectorAll(".drop-before,.drop-after,.drop-here"), function (n) { n.classList.remove("drop-before", "drop-after", "drop-here"); }); }
        function position(ev) { ghost.style.left = ev.clientX + 14 + "px"; ghost.style.top = ev.clientY + 8 + "px"; }
        function target(ev) {
          var under = document.elementFromPoint(ev.clientX, ev.clientY); if (!under) return null;
          var row = under.closest("tr[data-id]");
          if (row && row.dataset.id !== id) { var r = row.getBoundingClientRect(), fl = row.closest("[data-flight]"); return { letter: fl ? fl.dataset.flight : "out", beside: row.dataset.id, before: ev.clientY < r.top + r.height / 2, row: row }; }
          if (row) return null;
          var f = under.closest("[data-flight]"); if (f) return { letter: f.dataset.flight, box: f };
          var z = under.closest("#lo-unplaced-zone"); if (z) return { letter: "out", box: z };
          return null;
        }
        function move(ev) {
          position(ev); lastY = ev.clientY; clear(); drop = target(ev);
          if (drop) { if (drop.row) drop.row.classList.add(drop.before ? "drop-before" : "drop-after"); else if (drop.box) drop.box.classList.add("drop-here"); if (drop.row && drop.letter === "out") drop.row.closest("#lo-unplaced-zone") && drop.row.closest("#lo-unplaced-zone").classList.add("drop-here"); }
        }
        function scroll() { if (lastY < 90) window.scrollBy(0, -14); else if (lastY > window.innerHeight - 90) window.scrollBy(0, 14); scroller = window.requestAnimationFrame(scroll); }
        function finish(commit) {
          handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", esc);
          window.cancelAnimationFrame(scroller); ghost.remove(); document.body.classList.remove("dragging-lifter"); rowEl.classList.remove("is-dragging"); clear();
          var moved = commit && drop ? placeAt(id, drop.letter, drop.beside, drop.before) : false;
          if (moved) { say(drop.letter === "out" ? ent[id].name + " taken out of the lifting order." : ent[id].name + " moved to flight " + String(drop.letter).split(":")[1] + "."); draw("grip:" + id, id); }
        }
        function up() { finish(true); } function cancel() { finish(false); } function esc(ev) { if (ev.key === "Escape") finish(false); }
        handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", cancel); document.addEventListener("keydown", esc);
        position(e); scroller = window.requestAnimationFrame(scroll);
      }
      function gripKey(ev, id) {
        var k = ev.key;
        if (k === " " || k === "Enter") {
          ev.preventDefault();
          if (!kb) { kb = { id: id, snap: JSON.stringify(S.sessions) }; var c = find(id); say("Picked up " + ent[id].name + (c ? ", flight " + c.flight.letter + ", place " + (c.i + 1) + " of " + c.flight.lifters.length : ", not in the order") + ". Use the up and down arrow keys to move, space to drop, delete to take out, escape to cancel."); }
          else { var d = find(id); kb = null; say("Dropped " + ent[id].name + (d ? " in flight " + d.flight.letter + ", place " + (d.i + 1) + "." : ", not in the order.")); }
          draw("grip:" + id); return;
        }
        if (!kb || kb.id !== id) return;
        if (k === "Escape") { ev.preventDefault(); S.sessions = JSON.parse(kb.snap); kb = null; say("Cancelled. " + ent[id].name + " is back where they were."); draw("grip:" + id); }
        else if (k === "ArrowDown" || k === "ArrowUp") { ev.preventDefault(); say(ent[id].name + ": " + stepBy(id, k === "ArrowDown" ? 1 : -1)); draw("grip:" + id); }
        else if (k === "Delete" || k === "Backspace") { ev.preventDefault(); remove(id); S.dirty = true; status(); say(ent[id].name + " taken out of the lifting order."); draw("grip:" + id); }
      }
      var gripSvg = function () { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 12 18"); s.setAttribute("width", "12"); s.setAttribute("height", "18"); s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
        [[3, 3], [9, 3], [3, 9], [9, 9], [3, 15], [9, 15]].forEach(function (p) { var c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", "1.7"); c.setAttribute("fill", "currentColor"); s.appendChild(c); }); return s; };
      function grip(id) {
        var b = el("button", { class: "grip", type: "button", "data-fk": "grip:" + id, "aria-pressed": kb && kb.id === id ? "true" : "false", "aria-describedby": "lo-grip-help", "aria-label": "Move " + ent[id].name }, gripSvg());
        b.addEventListener("pointerdown", function (e) { startDrag(e, id); }); b.addEventListener("mousedown", function (e) { e.preventDefault(); });      // no text gets selected while dragging
        b.addEventListener("keydown", function (e) { gripKey(e, id); });
        return b;
      }
      function lifterRow(l, f, i) {
        var e = ent[l.id];
        return el("tr", { "data-id": l.id, class: l.id === justMoved ? "just-moved" : null }, el("td", { class: "grip-cell" }, grip(l.id)), el("td", null, String(i + 1)), el("th", { scope: "row" }, e.name), el("td", null, (e.sex === "F" ? "W " : "M ") + e.classLabel), el("td", null, e.ageClass), el("td", null, e.event === "bench_only" ? "Bench only" : "Full power"),
          el("td", null, e.total === null ? "none yet" : e.total + " kg"), el("td", null, e.glp === null ? "–" : String(e.glp)),
          S.showLots ? el("td", { class: "lot-cell" }, l.lot ? String(l.lot) : "–") : null);
      }
      // ---- session times: lift-off is typed, weigh-in defaults to 2 hours before, the finish is estimated from the attempts
      function hm(ms) { return ms === null || ms === undefined ? "" : Y.toLondonInput(new Date(ms).toISOString()).slice(11, 16); }
      function msOf(iso) { return iso ? new Date(iso).getTime() : null; }
      function timesOf(s) { return LSo.sessionTimes({ liftOff: msOf(s.liftOff), weighIn: msOf(s.weighIn), awards: msOf(s.awards), defaultWeighIn: defaultWeighIn(s), flights: s.flights.map(function (f) { return { lifters: f.lifters.filter(function (l) { return ent[l.id]; }).map(function (l) { return { event: ent[l.id].event }; }) }; }) }, settingsNow().secondsPerAttempt); }
      function defaultWeighIn(s) { var hmDefault = LSo.DEFAULT_WEIGH_IN[s.sessionNo]; return hmDefault ? msOf(Y.fromLondonInput(Y.addDays(c.start_date, s.day - 1) + "T" + hmDefault)) : null; }
      function parseTime(v, s) {
        v = String(v || "").trim().replace(".", ":"); if (v === "") return null;
        var m = /^(\d{1,2})(?::?(\d{2}))$/.exec(v); if (!m || +m[1] > 23 || +m[2] > 59) return false;
        return Y.fromLondonInput(Y.addDays(c.start_date, s.day - 1) + "T" + ("0" + m[1]).slice(-2) + ":" + m[2]);
      }
      function editTimes(s) {
        var t = timesOf(s);
        openForm({ title: "Day " + s.day + ", session " + s.sessionNo + ": times", intro: "UK time, like 09:30. Leave a box empty to use the usual time: weigh-in 08:00 for session 1 and 13:00 for session 2, lift-off two hours after weigh-in, and the awards estimated from the attempts.",
          saveLabel: "Save times",
          fields: [{ name: "weighIn", label: "Weigh-in", type: "text", half: true, placeholder: hm(t.weighIn) }, { name: "liftOff", label: "Lift-off", type: "text", half: true, placeholder: hm(t.liftOff) }, { name: "awards", label: "Awards", type: "text", half: true, placeholder: hm(t.awards) }],
          values: { weighIn: s.weighIn ? hm(msOf(s.weighIn)) : "", liftOff: s.liftOff ? hm(msOf(s.liftOff)) : "", awards: s.awards ? hm(msOf(s.awards)) : "" },
          validate: function (v) { return ["weighIn", "liftOff", "awards"].some(function (k) { return parseTime(v[k], s) === false; }) ? "Type each time like 09:30, or leave it empty." : null; },
          onSave: function (v) { ["weighIn", "liftOff", "awards"].forEach(function (k) { s[k] = parseTime(v[k], s); }); S.dirty = true; status(); draw("times:" + s.day + "-" + s.sessionNo); } });
      }
      // The card: the three times in plain text, with an Edit button that opens the overlay
      function timesRow(s) {
        var t = timesOf(s), item = function (label, ms, note) { return el("div", { class: "time-item" }, el("span", { class: "time-label" }, label), el("strong", { class: "time-value" }, ms === null ? "Not set" : hm(ms)), note ? el("span", { class: "time-note" }, note) : null); };
        return el("div", { class: "times-card" },
          item("Weigh-in", t.weighIn, t.weighInAuto && t.weighIn !== null ? "usual time" : ""), item("Lift-off", t.liftOff, t.liftOffAuto && t.liftOff !== null ? "2 hours after weigh-in" : ""), item("Awards", t.awards, t.awardsAuto && t.awards !== null ? "estimated" : ""),
          el("button", { class: "btn btn-sm btn-secondary", type: "button", "data-fk": "times:" + s.day + "-" + s.sessionNo, "aria-label": "Edit times for day " + s.day + ", session " + s.sessionNo, onclick: function () { editTimes(s); } }, "Edit times"));
      }
      var justMoved = null;
      function draw(focusKey, moved) {
        justMoved = moved || null;
        var kids = [], pl = placed(), unplaced = list.filter(function (e) { return !pl[e.id]; }), flights = flightsList();
        var women = list.filter(function (e) { return e.sex === "F"; }).length;
        kids.push(el("p", { class: "panel-intro" }, list.length + (list.length === 1 ? " lifter" : " lifters") + " entered (" + women + " women, " + (list.length - women) + " men)" + (flights.length ? ". " + S.sessions.length + (S.sessions.length === 1 ? " session, " : " sessions, ") + flights.length + (flights.length === 1 ? " flight, " : " flights, ") + (list.length - unplaced.length) + " placed." : ". Not sorted yet.")));
        var noTotal = list.filter(function (e) { return e.total === null; }).length;
        var notes = S.warnings.slice(); if (S.dropped) notes.push(S.dropped + (S.dropped === 1 ? " lifter" : " lifters") + " on the saved order has cancelled since, and has been taken out. Save to keep that.");
        if (!flights.length && noTotal) notes.push(noTotal + (noTotal === 1 ? " lifter has" : " lifters have") + " no best total yet (it comes from the OpenIPF check on the entry). They go first in their flight.");
        if (notes.length) kids.push(el("div", { class: "callout" }, el("ul", { style: "margin:0;padding-left:1.2em" }, notes.map(function (w) { return el("li", null, w); }))));
        kids.push(el("p", { class: "visually-hidden", id: "lo-grip-help" }, "Press space to pick this lifter up, then the up and down arrow keys to move them through the order, space to drop them, delete to take them out, or escape to cancel."));
        if (flights.length) {
          kids.push(el("section", { id: "lo-unplaced-zone", class: "lab-unplaced", "aria-labelledby": "lo-unplaced" }, el("h3", { id: "lo-unplaced" }, "Not in the lifting order" + (unplaced.length ? " (" + unplaced.length + ")" : "")),
            unplaced.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table lab-table" }, el("caption", { class: "visually-hidden" }, "Lifters not yet in the lifting order"),
              el("thead", null, el("tr", null, [el("th", { scope: "col" }, el("span", { class: "visually-hidden" }, "Move")), "Lifter", "Class", "Age class", "Best total"].map(function (h) { return h.nodeType ? h : el("th", { scope: "col" }, h); }))),
              el("tbody", null, unplaced.map(function (e) { return el("tr", { "data-id": e.id }, el("td", { class: "grip-cell" }, grip(e.id)), el("th", { scope: "row" }, e.name), el("td", null, (e.sex === "F" ? "W " : "M ") + e.classLabel), el("td", null, e.ageClass), el("td", null, e.total === null ? "none yet" : e.total + " kg")); }))))
              : el("p", { class: "help" }, "Everyone is in. Drag a lifter here to take them out of the lifting order.")));
        }
        S.sessions.forEach(function (s) {
          var box = el("section", { class: "lab-session", "aria-label": "Day " + s.day + ", session " + s.sessionNo }, el("div", { class: "lab-headrow" }, el("h3", null, "Day " + s.day + ", session " + s.sessionNo + (s.prime ? ": prime time" : "")),
            el("span", { class: "lab-headacts" }, btn("Add flight", function () { addFlight(s); }), btn("Remove session", function () { removeSession(s); }, "btn-ghost", { "aria-label": "Remove day " + s.day + " session " + s.sessionNo })) ), timesRow(s));
          s.flights.forEach(function (f) {
            var fp = f.lifters.filter(function (l) { return ent[l.id].event !== "bench_only"; }).length, sx = sexOf(f), st = settingsNow();
            var problems = []; if (sx === "mixed") problems.push("women and men in the same flight"); if (f.lifters.length > st.maxPerFlight) problems.push("over the " + st.maxPerFlight + " lifters limit"); if (fp > st.maxFullPower) problems.push("over the " + st.maxFullPower + " full power limit");
            box.appendChild(el("section", { class: "lab-flight", "data-flight": s.day + ":" + f.letter },
              el("div", { class: "lab-headrow" }, el("h4", null, "Flight " + f.letter + " ", el("span", { class: "sex-tag" + (sx === "women" ? " f" : "") }, sx === "women" ? "Women" : sx === "men" ? "Men" : sx === "mixed" ? "Mixed" : "Empty"), " · " + f.lifters.length + " lifters"),
                el("span", { class: "lab-headacts" }, btn("Remove flight", function () { removeFlight(s, f); }, "btn-ghost", { "aria-label": "Remove flight " + f.letter }))),
              problems.length ? el("p", { class: "form-error" }, "Check this flight: " + problems.join(", ") + ".") : null,
              f.lifters.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table lab-table" }, el("caption", { class: "visually-hidden" }, "Flight " + f.letter),
                el("thead", null, el("tr", null, [el("th", { scope: "col" }, el("span", { class: "visually-hidden" }, "Move")), "#", "Lifter", "Class", "Age class", "Event", "Best total", "GL"].concat(S.showLots ? ["Lot"] : []).map(function (h) { return h.nodeType ? h : el("th", { scope: "col" }, h); }))),
                el("tbody", null, f.lifters.map(function (l, i) { return lifterRow(l, f, i); })))) : el("p", { class: "empty" }, "Nobody in this flight. Drag someone here.")));
          });
          kids.push(box);
        });
        if (S.sessions.length) kids.push(el("div", { class: "lab-headacts", style: "margin-top:var(--space-4)" }, btn("Add session", addSession)));
        if (!list.length) kids.push(el("p", { class: "empty" }, "Nobody has entered yet, so there is nothing to sort."));
        sortBtn.hidden = S.sessions.length > 0; clearBtn.hidden = S.sessions.length === 0; renderLots();
        area.replaceChildren.apply(area, kids);
        if (focusKey) { var t = area.querySelector('[data-fk="' + focusKey + '"]'); if (t && !t.disabled) t.focus(); }
        if (moved) window.setTimeout(function () { var r = area.querySelector('tr[data-id="' + moved + '"]'); if (r) r.classList.remove("just-moved"); }, 1400);
      }
      function save(btnNode) {
        var st = settingsNow();
        btnNode.disabled = true;
        sb.rpc("lifting_order_save", { c: c.id, p: {
          settings: { days: st.days, sessions: st.sessions, max_full_power: st.maxFullPower, max_per_flight: st.maxPerFlight, prime_time: st.primeTime.enabled, prime_women: st.primeTime.women, prime_men: st.primeTime.men, women_first: st.womenFirst, seconds_per_attempt: st.secondsPerAttempt, show_glp: st.showGlp, show_total: st.showTotal },
          sessions: S.sessions.map(function (s) { return { day: s.day, session_no: s.sessionNo, prime: s.prime, name: s.name, weigh_in_at: s.weighIn, lift_off_at: s.liftOff, awards_at: s.awards, flights: s.flights.map(function (f) { return { letter: f.letter, locked: f.locked, lifters: f.lifters.map(function (l) { return { entry_id: l.id, locked: l.locked, lot_number: l.lot, reason: l.reason }; }) }; }) }; })
        } }).then(function (r) {
          if (r.error) { var m = (r.error.message || "").trim(); throw new Error(m === "forbidden" ? "You do not have permission to save the lifting order." : /invalid:lifter/.test(m) ? "Someone on the order is no longer an entered lifter. Reload the page and sort again." : friendly(r.error)); }
          S.dirty = false; S.dropped = 0; status(); toast("Lifting order saved."); draw();
        }).catch(function (e) { toast(friendly(e), "error"); }).then(function () { btnNode.disabled = false; });
      }
      // ---- exports: weigh-in sheet, score sheet, OpenLifter file. They use what is on screen, in lot order.
      var LEx = window.LiftingExport, olSaved = {};
      try { olSaved = JSON.parse((res[3] && res[3].data && res[3].data.value) || "{}") || {}; } catch (x) { olSaved = {}; }
      var DIV_KEYS = [["F", "classic", "Women, classic"], ["M", "classic", "Men, classic"], ["F", "equipped", "Women, equipped"], ["M", "equipped", "Men, equipped"]];
      function divisionLines() { return DIV_KEYS.map(function (d) { return d[2] + " = " + ((olSaved.divisions || {})[d[0] + ":" + d[1]] || LEx.defaultDivisionCode(d[0], d[1])); }).join("\n"); }
      function parseDivisions(text) {
        var map = {};
        text.split(/\r?\n/).forEach(function (line) {
          var i = line.lastIndexOf("="); if (i < 0) return;
          var lab = line.slice(0, i).trim(), code = LEx.clean(line.slice(i + 1)), hit = DIV_KEYS.filter(function (d) { return d[2] === lab; })[0];
          if (hit && code) map[hit[0] + ":" + hit[1]] = code;
        });
        return map;
      }
      var divText = el("textarea", { id: "ol-divisions", rows: "4", "aria-describedby": "ol-div-help", spellcheck: "false" }); divText.value = divisionLines();
      var stdBox = el("input", { type: "checkbox", id: "ol-standard" }); stdBox.checked = !!olSaved.standard;
      var noviceBox = el("input", { type: "checkbox", id: "ol-novice" }); noviceBox.checked = (olSaved.novice_for || []).indexOf(c.id) >= 0;
      var classicBox = el("input", { type: "text", id: "ol-classic", value: (olSaved.equipment || {}).classic || "Sleeves" }), equippedBox = el("input", { type: "text", id: "ol-equipped", value: (olSaved.equipment || {}).equipped || "Single-ply" });
      function olSettings() { return { divisions: parseDivisions(divText.value), equipment: { classic: classicBox.value.trim() || "Sleeves", equipped: equippedBox.value.trim() || "Single-ply" }, novice: noviceBox.checked, standard: stdBox.checked, platforms: 1 }; }
      function exportSessions() { return S.sessions.map(function (x) { return { day: x.day, sessionNo: x.sessionNo, prime: x.prime, flights: x.flights.map(function (f) { return { letter: f.letter, lifters: f.lifters.map(function (l) { return { id: l.id, lot: l.lot }; }) }; }) }; }); }
      function exportReady(needLots) {
        if (!S.sessions.length) { toast("Sort the entries first.", "error"); return false; }
        if (S.dirty && !window.confirm("The order has changes that are not saved. Export what is on screen anyway?")) return false;
        if (needLots && !flightsList().every(function (x) { return x.f.lifters.every(function (l) { return l.lot; }); }) && !window.confirm("Not everyone has a lot number yet. Draw them first if you can. Export anyway?")) return false;
        return true;
      }
      function peopleMap() { var m = {}; list.forEach(function (e) { m[e.id] = e; }); return m; }
      function openSheet(html) { var w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank"); if (!w) toast("Your browser blocked the new window. Allow pop-ups for this site and try again.", "error"); }
      function olFile() {
        if (!exportReady(true)) return;
        var st = olSettings(), csv = LEx.openLifterCsv(LEx.openLifterRows(exportSessions(), peopleMap(), c, st), st);
        var days = Math.max.apply(null, S.sessions.map(function (x) { return x.day; })), errs = LEx.validateOpenLifter(csv, { days: days, platforms: 1, standard: st.standard });
        if (errs.length && !window.confirm("OpenLifter may refuse this file:\n\n" + errs.slice(0, 6).join("\n") + (errs.length > 6 ? "\n…and " + (errs.length - 6) + " more" : "") + "\n\nDownload it anyway?")) return;
        var a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: (c.slug || "competition") + "-openlifter.csv" }); document.body.appendChild(a); a.click(); a.remove();
      }
      var ICON_PRINT = '<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        ICON_DOWNLOAD = '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        ICON_MAIL = '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="m3 7 9 6 9-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      // a tertiary (ghost) button with a small icon, so it is clear what it does
      function iconBtn(label, icon, fn, extra) { return el("button", Object.assign({ type: "button", class: "btn btn-sm btn-ghost", onclick: fn }, extra || {}), Y.svg(icon), " ", label); }
      var exportBox = el("section", { "aria-labelledby": "lo-export-h", style: "margin:var(--space-5) 0" },
        el("h3", { id: "lo-export-h" }, "Exports"),
        el("p", { class: "help" }, "Print sheets open in a new tab, ready to print or save as PDF. The weigh-in sheet follows the lot numbers, so draw those first. The others follow the lifting order."),
        el("h4", { class: "lo-sub" }, "Print sheets"),
        el("div", { class: "actions" },
          iconBtn("Weigh-in sheet", ICON_PRINT, function () { if (exportReady(true)) openSheet(LEx.weighInSheet(exportSessions(), peopleMap(), c)); }),
          iconBtn("Score sheets", ICON_PRINT, function () { if (exportReady(true)) openSheet(LEx.scoreSheet(exportSessions(), peopleMap(), c)); }),
          iconBtn("Rack heights", ICON_PRINT, function () { if (exportReady(false)) openSheet(LEx.rackSheet(exportSessions(), peopleMap(), c)); }),
          iconBtn("Kit check", ICON_PRINT, function () { if (exportReady(false)) openSheet(LEx.kitSheet(exportSessions(), peopleMap(), c)); })),
        el("h4", { class: "lo-sub" }, "OpenLifter"),
        el("p", { class: "help" }, "A CSV to import into OpenLifter."),
        el("div", { class: "actions" }, iconBtn("OpenLifter file", ICON_DOWNLOAD, olFile)),
        el("details", { class: "ol-settings" }, el("summary", null, "OpenLifter settings"),
          el("div", { class: "field" }, el("label", { for: "ol-divisions" }, "Division codes"), el("p", { class: "help", id: "ol-div-help" }, "One per line, the code after the equals sign. Each must match a division set up in the OpenLifter meet exactly, or the import fails."), divText),
          el("div", { class: "field half" }, el("label", { for: "ol-classic" }, "Classic equipment"), classicBox),
          el("div", { class: "field half" }, el("label", { for: "ol-equipped" }, "Equipped equipment"), equippedBox),
          el("div", { class: "field field-check" }, stdBox, el("div", null, el("label", { for: "ol-standard" }, "Use the public OpenLifter's columns"), el("p", { class: "help" }, "Leaves out Session, Novice and CanBreakRecords. Only for the public OpenLifter: ours accepts them."))),
          el("div", { class: "field field-check" }, noviceBox, el("div", null, el("label", { for: "ol-novice" }, "This is a novice competition"), el("p", { class: "help" }, "Written to the Novice column."))),
          el("div", { class: "actions" }, btn("Save OpenLifter settings", function () {
            var st = olSettings(), nf = (olSaved.novice_for || []).filter(function (id) { return id !== c.id; }); if (st.novice) nf.push(c.id);
            var next = { divisions: st.divisions, equipment: st.equipment, novice_for: nf, standard: st.standard };
            sb.from("site_settings").upsert({ key: "openlifter.settings", value: JSON.stringify(next) }).then(function (r) { if (r.error) throw r.error; olSaved = next; toast("OpenLifter settings saved."); }).catch(function (e) { toast(friendly(e), "error"); });
          }, "btn-secondary"))));
      var published = row.status === "published", shareBox = el("section", { "aria-labelledby": "lo-share-h", style: "margin:var(--space-5) 0" });
      var closed = !!c.entries_closed_manually || (!!c.entry_closes && new Date(c.entry_closes) <= new Date()), isFinal = !!row.final_at;
      var lifters = function (n) { return n + (n === 1 ? " lifter" : " lifters"); };
      function lifterCount() { return flightsList().reduce(function (t, x) { return t + x.f.lifters.length; }, 0); }
      // How sharing works. While entries are open, publishing can email the provisional order to the lifters in it (you choose). When entries close,
      // lifters are emailed automatically that entries are closed. "Finalise lifting order" then marks it final, publishes it if needed, and emails it.
      function pubStatus() {
        var when = function (iso) { return new Date(iso).toLocaleDateString("en-GB", { timeZone: Y.TZ, dateStyle: "medium" }); };
        var kids = [el("h3", { id: "lo-share-h" }, "Sharing")];
        finalBtn.textContent = isFinal ? "Send the final order again" : "Finalise lifting order";
        finalBtn.className = "btn " + (isFinal ? "btn-secondary" : "btn-primary");
        finalBtn.disabled = !closed; finalBtn.title = closed ? "" : "Available once entries close";
        var autoNote = el("p", { class: "help", id: "lo-auto-note" }, closed
          ? (isFinal ? "This order is final. Lifters were emailed when entries closed and again when it was finalised." : "Entries have closed, so lifters have been emailed that entries are closed and the final order is coming. Finalise lifting order publishes the order as final and emails it to them.")
          : "When entries close, everyone entered is emailed automatically: no more changes to entries, no refunds for dropouts, and the final lifting order will follow. After that, Finalise lifting order sends them the final order.");
        if (!published) {
          kids.push(el("p", { class: "help", id: "lo-pub-note", role: "status" }, "Not published yet. Publishing puts the lifting order on the website, without lot numbers, and the calendar swaps View entries for View lifting order. Save your changes first. Use Preview above to see it before anyone else can."
            + (closed ? "" : " While entries are open you can also email the provisional order to the lifters in it when you publish.")));
          kids.push(el("div", { class: "actions" }, pubBtn, finalBtn));
        } else {
          kids.push(el("p", { class: "help", id: "lo-pub-note", role: "status" }, "Published (" + (isFinal ? "final" : "provisional") + "). Anyone can see it on the website, and saving changes updates it straight away. Saving never emails anyone."
            + (row.shared_at ? " Last emailed to " + lifters(row.shared_count || 0) + " as " + row.shared_as + " on " + when(row.shared_at) + "." : "")));
          kids.push(el("div", { class: "actions" }, finalBtn, unpubBtn));
        }
        kids.push(autoNote);
        shareBox.replaceChildren.apply(shareBox, kids);
      }
      function busy(on) { [pubBtn, unpubBtn, finalBtn].forEach(function (x) { if (x) x.disabled = on || (x === finalBtn && !closed); }); }
      function publishCall(flag) {
        return sb.rpc("lifting_order_publish", { c: c.id, publish: flag }).then(function (r) {
          if (r.error) throw new Error(/invalid:empty_order/.test(r.error.message || "") ? "There is nothing saved to publish. Save the order first." : /forbidden/.test(r.error.message || "") ? "You do not have permission to publish." : friendly(r.error));
          published = flag; row.status = flag ? "published" : "draft"; row.published_as = flag ? r.data : null;
        });
      }
      // Emails the lifters in the order, from the competitions address. Resolves with { kind, sent, failed }.
      function emailLifters() {
        return sb.auth.getSession().then(function (g) {
          var token = g.data && g.data.session && g.data.session.access_token;
          return fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", { method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "", Authorization: "Bearer " + token }, body: JSON.stringify({ action: "share_lifting_order", competition_id: c.id }) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error === "not_published" ? "Publish the lifting order first." : b.error === "closed" ? "Entries have closed, so only the final order can be emailed. Use Finalise lifting order." : b.error === "not_allowed" ? "You do not have permission to do that." : "The email function did not answer. Check that it has been updated in Supabase."); return b; }); })
          .then(function (b) { row.shared_at = new Date().toISOString(); row.shared_as = b.kind; row.shared_count = b.sent; return b; });
      }
      function sentToast(b) { toast("Emailed the " + b.kind + " lifting order to " + lifters(b.sent) + (b.failed ? ", and " + b.failed + " could not be sent" : "") + "."); }
      function doPublish(email) {
        busy(true);
        return publishCall(true).then(function () {
          pubStatus();
          if (!email) { toast("Lifting order published."); return; }
          return emailLifters().then(function (b) { pubStatus(); sentToast(b); });
        }).catch(function (e) { toast(friendly(e), "error"); pubStatus(); }).then(function () { busy(false); });
      }
      function publish() {
        if (published) {
          if (!window.confirm("Unpublish the lifting order? The calendar goes back to View entries.")) return;
          busy(true); publishCall(false).then(function () { pubStatus(); toast("Lifting order unpublished."); }).catch(function (e) { toast(friendly(e), "error"); }).then(function () { busy(false); });
          return;
        }
        if (S.dirty) { toast("Save the order first, then publish.", "error"); return; }
        if (!S.sessions.length) { toast("Sort the entries and save first.", "error"); return; }
        var n = lifterCount();
        if (closed) {
          // Entries have closed: publishing sends nothing. The only email left is the final order, sent by Finalise lifting order.
          if (!window.confirm("Publish the lifting order? Anyone can see it, without lot numbers. No email goes out now: lifters are emailed the final order when you use Finalise lifting order.")) return;
          doPublish(false); return;
        }
        openForm({ title: "Publish the lifting order", fields: [], saveLabel: "Publish and email " + lifters(n),
          intro: "Publishing puts the lifting order on the website, without lot numbers, and the calendar swaps View entries for View lifting order. You can also email the provisional order to the " + lifters(n) + " in it, from the competitions address. Entry is still open, so it may change.",
          extra: [{ label: "Publish without emailing", onclick: function () { doPublish(false); } }],
          onSave: function () { return publishCall(true).then(function () { pubStatus(); return emailLifters().then(function (b) { pubStatus(); sentToast(b); }).catch(function (e) { toast("Published, but the email did not send: " + friendly(e) + " Unpublish and publish again to try once more.", "error"); }); }); } });
      }
      function finalise() {
        if (!closed) { toast("Entries have not closed yet, so the order cannot be finalised.", "error"); return; }
        if (S.dirty) { toast("Save your changes first, so lifters see the current order.", "error"); return; }
        if (!published && !S.sessions.length) { toast("Sort the entries and save first.", "error"); return; }
        var n = lifterCount();
        openForm({ title: isFinal ? "Send the final lifting order again" : "Finalise the lifting order", fields: [], saveLabel: (isFinal ? "Send to " : "Finalise and email ") + lifters(n),
          intro: (isFinal ? "The order is already final. This emails it again to the " + lifters(n) + " in it." : (published ? "" : "It is not published yet, so this publishes it. ") + "Entries have closed. This marks the lifting order as final and emails it to the " + lifters(n) + " in it, from the competitions address. After this, no more changes should be made."),
          onSave: function () {
            var first = isFinal ? Promise.resolve() : sb.rpc("lifting_order_finalise", { c: c.id }).then(function (r) {
              if (r.error) throw new Error(/invalid:not_closed/.test(r.error.message || "") ? "Entries have not closed yet." : /invalid:empty_order/.test(r.error.message || "") ? "There is nothing saved to publish. Save the order first." : /forbidden/.test(r.error.message || "") ? "You do not have permission to do that." : friendly(r.error));
              published = true; isFinal = true; row.status = "published"; row.published_as = "final"; row.final_at = new Date().toISOString();
            });
            return first.then(function () { pubStatus(); return emailLifters().then(function (b) { pubStatus(); sentToast(b); }).catch(function (e) { toast("Marked final, but the email did not send: " + friendly(e) + " Use Send the final order again.", "error"); }); });
          } });
      }
      var pubBtn = el("button", { type: "button", class: "btn btn-primary", onclick: publish }, "Publish"), unpubBtn = iconBtn("Unpublish", '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', publish);
      var finalBtn = el("button", { type: "button", class: "btn btn-primary", onclick: finalise }, "Finalise lifting order");
      function previewUrl() { return "../lifting/?c=" + encodeURIComponent(c.slug || c.id) + "&preview=1"; }        // the plain address: it does not depend on the /lifting-order rewrite
      var previewLink = el("a", { class: "btn btn-sm btn-ghost", href: previewUrl(), target: "_blank", rel: "noopener" }, "Preview ", el("span", { class: "visually-hidden" }, "(opens in a new tab)"));
      var sortBtn = btn("Sort the entries", runSort, "btn-primary"), clearBtn = btn("Clear the order", clearOrder, "btn-danger"), saveBtn = btn("Save", function () { save(saveBtn); }, "btn-secondary");
      // Lot numbers: again only the buttons that apply. No lots yet: Draw. Drawn: a note, Show lot numbers, Redraw and Remove.
      var lotsBox = el("section", { "aria-labelledby": "lo-lots-h", style: "margin:var(--space-5) 0" });
      function renderLots() {
        var ls = lotsState(), n = flightsList().reduce(function (t, x) { return t + x.f.lifters.length; }, 0);
        var kids = [el("h3", { id: "lo-lots-h" }, "Lot numbers"),
          el("p", { class: "help" }, "Lot numbers decide the weigh-in order and are never shown publicly. Each flight gets its own block of numbers in flight order (flight A from 1, flight B carries on, and so on), women before men, shuffled at random within each group. Draw them once the flights are settled.")];
        if (!S.sessions.length) kids.push(el("p", { class: "help" }, "Sort the entries first."));
        else if (!ls.any) kids.push(el("div", { class: "actions" }, btn("Draw lot numbers", drawLots, "btn-secondary")));
        else {
          kids.push(el("p", { class: ls.ok ? "help" : "form-error", role: "status" }, ls.ok ? "Lot numbers are drawn for " + n + (n === 1 ? " lifter." : " lifters.") : "Lifters have moved since the lot numbers were drawn, so some flights no longer have their own block. Redraw them once the order is settled."));
          var showBox = el("input", { type: "checkbox", id: "lo-show-lots" }); showBox.checked = !!S.showLots;
          showBox.addEventListener("change", function (e) { S.showLots = e.target.checked; draw(); });
          kids.push(el("div", { class: "field field-check" }, showBox, el("div", null, el("label", { for: "lo-show-lots" }, "Show lot numbers in the lists above"))));
          kids.push(el("div", { class: "actions" }, btn("Redraw lot numbers", drawLots, "btn-ghost"), btn("Remove lot numbers", removeLots, "btn-ghost")));
        }
        lotsBox.replaceChildren.apply(lotsBox, kids);
      }
      view.replaceChildren(
        el("p", { class: "panel-intro" }, "Sort the entered lifters into sessions and flights, then drag anyone to change it. Best totals come from OpenIPF. Not public yet."),
        form.el,
        el("section", { "aria-labelledby": "lo-build-h", style: "margin:var(--space-4) 0" }, el("h3", { id: "lo-build-h" }, "Build and save"),
          el("p", { class: "help" }, "Sort the entries once to make the first order, then arrange it by hand. Save your progress as you go. Preview shows what is saved, to the entries team only."),
          el("div", { class: "actions", style: "margin:var(--space-3) 0" }, sortBtn, clearBtn, saveBtn, previewLink),
          statusNode),
        live, area,
        shareBox,
        lotsBox,
        exportBox,
        el("section", { "aria-labelledby": "lo-settings-h", style: "margin:var(--space-5) 0" }, el("h3", { id: "lo-settings-h" }, "Settings"), secForm.el));
      status(); pubStatus(); draw();
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  // ---- Volunteer points: who has what, add or take away points, bring in the old sheet, points for helpers at franchise competitions ----
  // The balances come from the database (points expire 24 months after they were earned and a spend uses the oldest first), never from here.
  function renderPoints(panel) {
    var state = { rows: [], q: "", open: null };
    panel.replaceChildren(panelHead("Volunteer points"), el("p", null, "Loading…"));
    var tbody = el("tbody"), summary = el("p", { class: "panel-intro" }), history = el("div"), refBox = el("details", { class: "ol-settings" }), importBox = el("details", { class: "ol-settings" }), helpersBox = el("details", { class: "ol-settings" });
    function msg(e) {
      var m = String((e && e.message) || e || "").replace(/^.*?ERROR:\s*/s, "").split("\n")[0].trim();
      return ({ "invalid:name": "That is a new person: add their name too.", "invalid:email": "Check the email address.", "invalid:delta": "Enter a number of points from 1 to 100.", "invalid:reason": "Say what the points are for.", insufficient: "They do not have that many points.", forbidden: "You do not have permission to do that." })[m] || friendly(e);
    }
    function when(iso) { return new Date(iso).toLocaleDateString("en-GB", { timeZone: Y.TZ, dateStyle: "medium" }); }
    function load() {
      return Promise.all([sb.rpc("points_overview"), sb.from("vol_people").select("email,full_name,committee")]).then(function (res) {
        if (res[0].error) throw res[0].error; state.rows = res[0].data || [];
        state.committee = {};
        (res[1].data || []).forEach(function (x) {
          if (!x.committee) return; state.committee[x.email] = true;
          if (!state.rows.some(function (r) { return r.email === x.email; })) state.rows.push({ email: x.email, name: x.full_name || x.email, balance: 0, earned: 0, spent: 0, expiring: 0, next_expiry: null });      // on the committee but nothing earned yet
        });
        state.rows.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      });
    }
    function drawRows() {
      var q = state.q.trim().toLowerCase(), list = state.rows.filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.email.toLowerCase().indexOf(q) >= 0; });
      var withPts = state.rows.filter(function (r) { return r.balance > 0; }), total = withPts.reduce(function (t, r) { return t + r.balance; }, 0), soon = state.rows.reduce(function (t, r) { return t + (r.expiring || 0); }, 0);
      summary.textContent = withPts.length + (withPts.length === 1 ? " person has" : " people have") + " points, " + total + " points in all." + (Object.keys(state.committee || {}).length ? " " + (function (n) { return n + (n === 1 ? " committee member earns" : " committee members earn"); })(Object.keys(state.committee).length) + " 3 points at the end of every quarter (next: " + nextQuarterEnd() + ")." : "") + (soon ? " " + soon + (soon === 1 ? " point expires" : " points expire") + " in the next 60 days." : "");
      var out = [];
      list.forEach(function (r) {
        out.push(el("tr", null, el("th", { scope: "row" }, r.name, state.committee && state.committee[r.email] ? el("span", { class: "tag tag-position", style: "margin-left:var(--space-2)" }, "Committee") : null, el("small", null, r.email)), el("td", { class: "num" }, String(r.balance)), el("td", { class: "nowrap" }, r.expiring ? r.expiring + " by " + when(r.next_expiry) : "–"), el("td", { class: "num" }, String(r.earned)), el("td", { class: "num" }, String(r.spent)),
          el("td", { class: "col-actions" }, el("span", { class: "actions" }, btn("History", function () { showHistory(r); }), btn("Edit", function () { editVolunteer({ email: r.email, name: r.name }, function () { load().then(function () { drawRows(); }); }, [{ label: "Add points", onclick: function () { adjust(1, r); } }].concat(r.balance > 0 ? [{ label: "Take points away", onclick: function () { adjust(-1, r); } }] : [])); }, "btn-ghost", { "aria-label": "Edit " + r.name })))));
        if (state.hist && state.hist.email === r.email) out.push(el("tr", { class: "row-detail" }, el("td", { colspan: "6" }, el("div", { class: "row-detail-inner" }, state.hist.node))));
      });
      tbody.replaceChildren.apply(tbody, out);
      if (!list.length) tbody.appendChild(el("tr", null, el("td", { colspan: "6" }, el("p", { class: "empty", style: "margin:0" }, "Nobody matches."))));
    }
    function showHistory(r) {
      state.open = r.email;
      var node = el("div", { "aria-live": "polite" }, el("p", { class: "help" }, "Loading…"));
      state.hist = { email: r.email, node: node }; drawRows();
      sb.from("points_ledger").select("*").eq("email", r.email).order("earned_at", { ascending: false }).order("id", { ascending: false }).then(ok).then(function (rows) {
        node.replaceChildren(el("h2", { id: "pts-history-h", tabindex: "-1", style: "margin:0 0 var(--space-1);font-size:1.15rem" }, "History: " + r.name), el("p", { class: "help", style: "margin:0 0 var(--space-3)" }, r.email + ". " + r.balance + " points now."),
          rows.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
            el("thead", null, el("tr", null, ["When", "What", "Points", "By"].map(function (h) { return el("th", { scope: "col", class: h === "Points" ? "num" : null }, h); }))),
            el("tbody", null, rows.map(function (x) { return el("tr", null, el("td", { class: "nowrap" }, when(x.earned_at)), el("td", null, x.reason), el("td", { class: "num" }, x.delta === 0 ? "–" : (x.delta > 0 ? "+" : "") + x.delta), el("td", null, x.created_by || "")); })))) : el("p", { class: "empty" }, "Nothing yet."),
          el("p", { style: "margin:var(--space-3) 0 0" }, btn("Close history", function () { state.open = null; state.hist = null; drawRows(); })));
        var h = document.getElementById("pts-history-h"); if (h) { h.scrollIntoView({ block: "nearest" }); h.focus(); }
      }).catch(function (e) { node.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
    }
    function adjust(sign, who) {
      var add = sign > 0;
      openForm({ title: add ? (who ? "Add points for " + (who.name || who.email) : "Add points") : who ? "Take points away from " + (who.name || who.email) : "Take points away", saveLabel: add ? "Add points" : "Take points away",
        intro: who && add ? "Adding points for " + (who.name || who.email) + ". It goes in the ledger with your name, so there is a record." : who && !add ? (who.name || who.email) + " has " + (who.balance === undefined ? "" : who.balance + " points. ") + "For a spend (priority entry 1, £20 off 4, £40 off 8, half price BP membership 5, free membership 10) or a correction. It cannot take them below zero." : add ? "A thank you, a correction, or points earned somewhere we did not tick off. It goes in the ledger with your name, so there is a record." : "For a spend (priority entry 1, £20 off 4, £40 off 8, half price BP membership 5, free membership 10) or a correction. It cannot take someone below zero.",
        values: who ? { email: who.email } : {}, fields: [{ name: "email", label: "Their email address", type: "email", required: true }].concat(add && !who ? [{ name: "name", label: "Their name (only for someone new)", help: "Leave empty for someone who already has points." }] : [])
          .concat([{ name: "points", label: "Points", type: "number", required: true, min: "1", max: "100", half: true }, { name: "date", label: "Date (optional)", type: "date", half: true, help: "For adding points retroactively. Points expire 24 months after this date." }, { name: "reason", label: "What is it for?", required: true, help: add ? "For example: Helped with the livestream." : "For example: Priority entry, March Open." }]),
        validate: function (v) { var n = Number(v.points); return !n || n < 1 || n > 100 || Math.round(n) !== n ? "Enter a whole number of points from 1 to 100." : null; },
        onSave: function (v) {
          return sb.rpc("points_adjust", { p: { email: String(v.email).trim(), name: String(v.name || "").trim(), delta: (add ? 1 : -1) * Math.round(Number(v.points)), reason: String(v.reason).trim(), date: v.date || "" } }).then(function (r) {
            if (r.error) throw new Error(msg(r.error)); toast((add ? "Added" : "Taken away") + ". They now have " + (r.data && r.data.balance) + " points."); return load().then(function () { drawRows(); if (state.open) showHistory(state.rows.filter(function (x) { return x.email === state.open; })[0] || { email: state.open, name: state.open, balance: 0 }); });
          });
        } });
    }

    // ---- the referee roster: chosen from on the rota, with the level shown there
    function drawReferees() {
      var body = el("div");
      function levelName(v) { var l = REF_LEVELS.filter(function (x) { return x.value === v; })[0]; return l ? l.label : v; }
      function refresh() {
        sb.from("vol_referees").select("*").eq("active", true).order("name").then(ok).then(function (rows) {
          body.replaceChildren(rows.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" }, el("caption", { class: "visually-hidden" }, "Referee roster"),
            el("thead", null, el("tr", null, ["Name", "Level", "Email", ""].map(function (h) { return el("th", { scope: "col" }, h); }))),
            el("tbody", null, rows.map(function (r) { return el("tr", null, el("th", { scope: "row" }, r.name), el("td", null, levelName(r.level)), el("td", null, r.email || "–"),
              el("td", null, el("span", { class: "actions" }, btn("Edit", function () { editRef(r); }), btn("Remove", function () { if (!window.confirm("Remove " + r.name + " from the referee roster? Rotas they are already on keep their name.")) return; sb.from("vol_referees").delete().eq("id", r.id).then(ok).then(refresh).catch(function (e) { toast(friendly(e), "error"); }); }, "btn-danger")))); })))) : el("p", { class: "empty" }, "No referees yet. Add from the committee page, or add one."));
        }).catch(function (e) { body.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
      }
      function editRef(r) {
        var isNew = !r;
        openForm({ title: isNew ? "Add a referee" : "Edit " + r.name, saveLabel: isNew ? "Add referee" : "Save changes", values: r || {},
          fields: [{ name: "name", label: "Name", required: true }, { name: "level", label: "Level", type: "select", required: true, options: [{ value: "", label: "Choose a level" }].concat(REF_LEVELS) }, { name: "email", label: "Email address (optional)", type: "email", help: "Needed for them to earn volunteer points." }],
          validate: function (v) { return v.level ? null : "Choose their level."; },
          onSave: function (v) { var row = { name: String(v.name).trim(), level: v.level, email: String(v.email || "").trim().toLowerCase() || null, active: true }; return (isNew ? sb.from("vol_referees").insert(row) : sb.from("vol_referees").update(row).eq("id", r.id)).then(ok).then(refresh); } });
      }
      // The committee page already lists our international and national referees. Copy them in once (people already on the roster are skipped).
      function fromCommittee() {
        Promise.all([sb.from("org_sections").select("id,title").then(ok), sb.from("people").select("section_id,name,role").then(ok), sb.from("vol_referees").select("name").then(ok)]).then(function (res) {
          var secs = res[0].filter(function (x) { return /referee/i.test(x.title); }).map(function (x) { return x.id; }), have = {}; res[2].forEach(function (x) { have[x.name.trim().toLowerCase()] = 1; });
          var add = [], skipped = [];
          res[1].filter(function (x) { return secs.indexOf(x.section_id) >= 0; }).forEach(function (x) {
            var role = String(x.role || ""), lv = /category\s*(i{1,2}|[12])\b/i.exec(role) ? (/ii|2/i.test(/category\s*(i{1,2}|[12])\b/i.exec(role)[1]) ? "ipf_2" : "ipf_1") : /national/i.test(role) ? "bp_national" : "";
            if (have[x.name.trim().toLowerCase()]) return;
            if (!lv) { skipped.push(x.name); return; }
            add.push({ name: x.name.trim(), level: lv, source: "committee", active: true });
          });
          if (!add.length) { toast(skipped.length ? "Nobody to add: " + skipped.join(", ") + " had no level we could read." : "Everyone on the committee page's referee lists is already on the roster."); return; }
          if (!window.confirm("Add " + add.length + " referees from the committee page? International referees become IPF Category 1 or 2, national referees become British Powerlifting National." + (skipped.length ? " " + skipped.length + " cannot be matched to a level and will be skipped." : ""))) return;
          return sb.from("vol_referees").insert(add).then(ok).then(function () { toast("Added " + add.length + " referees."); refresh(); });
        }).catch(function (e) { toast(friendly(e), "error"); });
      }
      refBox.replaceChildren(el("summary", null, "Referees"),
        el("p", { class: "help" }, "Referees, the technical controller and the jury are picked from this roster on the rota, and their level is shown next to their name. Add our divisional referees here, or when you add someone on the rota."),
        el("div", { class: "actions" }, btn("Add a referee", function () { editRef(null); }, "btn-primary"), btn("Add from the committee page", fromCommittee, "btn-ghost")), body);
      refresh();
    }

    // ---- import the old sheet
    function drawImport() {
      var file = el("input", { type: "file", accept: ".csv,text/csv", id: "pts-file" }), out = el("div", { "aria-live": "polite" });
      importBox.replaceChildren(el("summary", null, "Import the old points sheet"),
        el("p", { class: "help" }, "In the sheet, open the Master database tab and choose File, Download, Comma-separated values (.csv). Choose that file here. Nothing is saved until you press Import. Importing the same file again changes nothing."),
        el("div", { class: "field" }, el("label", { for: "pts-file" }, "The CSV file"), file), out);
      file.addEventListener("change", function () {
        var f = file.files && file.files[0]; if (!f) return;
        f.text().then(function (text) {
          var res = window.PointsImport.parse(text), rep = res.report, kids = [];
          if (rep.warnings.length) kids.push(el("ul", { class: "form-error" }, rep.warnings.map(function (w) { return el("li", null, w); })));
          if (!res.rows.length) { out.replaceChildren.apply(out, kids); return; }
          kids.push(el("p", null, rep.people + " people with an email address, " + rep.earned + " points earned and " + rep.spent + " spent over " + rep.columns.length + " events. The sheet's own totals add up to " + rep.expected + " points."));
          if (rep.noEmail.length) kids.push(el("div", { class: "callout" }, el("p", { class: "callout-title" }, rep.noEmail.length + " rows have no email address, so they cannot be imported"), el("p", { style: "margin:0" }, rep.noEmail.map(function (x) { return x.name + " (" + x.points + ")"; }).join(", ") + ". Add their emails in the sheet and import again, or add their points here afterwards with Add points.")));
          if (rep.badCells.length) kids.push(el("div", { class: "callout" }, el("p", { class: "callout-title" }, rep.badCells.length + " cells are not whole numbers and were ignored"), el("p", { style: "margin:0" }, rep.badCells.map(function (x) { return x.name + ", " + x.column + ": “" + x.value + "”"; }).join("; "))));
          if (rep.mismatches.length) kids.push(el("div", { class: "form-error" }, el("p", null, rep.mismatches.length + " people would not match the sheet's own total:"), el("ul", null, rep.mismatches.slice(0, 10).map(function (x) { return el("li", null, x.name + ": the sheet says " + x.sheet + ", the columns add to " + x.loaded); }))));
          else kids.push(el("p", { class: "help" }, "Every person's columns add up to the total in the sheet."));
          kids.push(el("div", { class: "actions" }, btn("Import " + res.rows.length + " point entries", function () {
            sb.rpc("points_import", { p: { rows: res.rows } }).then(function (r) {
              if (r.error) throw r.error;
              return load().then(function () {
                drawRows(); var mine = {}; state.rows.forEach(function (x) { mine[x.email] = x.balance; });
                var diff = res.people.filter(function (p) { return (mine[p.email] || 0) !== p.sheetTotal; });
                out.replaceChildren(el("p", null, "Imported " + r.data.inserted + " entries" + (r.data.skipped ? " (" + r.data.skipped + " skipped: already there)" : "") + "."),
                  diff.length ? el("div", { class: "callout" }, el("p", { class: "callout-title" }, diff.length + " people now have a different balance from the sheet"), el("p", { style: "margin:0" }, "Usually because some of their points are more than 24 months old and have expired: " + diff.slice(0, 8).map(function (p) { return p.name + " (sheet " + p.sheetTotal + ", now " + (mine[p.email] || 0) + ")"; }).join("; ") + (diff.length > 8 ? " and more." : "."))) : el("p", { class: "help" }, "Every balance matches the sheet."));
              });
            }).catch(function (e) { toast(msg(e), "error"); });
          }, "btn-primary")));
          out.replaceChildren.apply(out, kids);
        });
      });
    }

    // ---- points for helpers at a competition we did not staff
    function drawHelpers() {
      var sel = el("select", { class: "control", id: "help-comp" }), box = el("textarea", { id: "help-list", rows: "6", placeholder: "Jo Smith, jo@example.com\nAmir Khan, amir@example.com, 2" }), out = el("div", { "aria-live": "polite" });
      helpersBox.replaceChildren(el("summary", null, "Points for helpers at another host's competition"),
        el("p", { class: "help" }, "A franchise competition's host staffs it, but their helpers still earn points. Paste the host's list, one person per line: name, email, and optionally the points (1 if left out). Each person earns once per competition."),
        el("div", { class: "field" }, el("label", { for: "help-comp" }, "Competition"), sel), el("div", { class: "field" }, el("label", { for: "help-list" }, "Helpers"), box), out);
      sb.from("competitions").select("id,name,start_date").order("start_date", { ascending: false }).limit(60).then(ok).then(function (cs) { sel.replaceChildren.apply(sel, cs.map(function (x) { return el("option", { value: x.id }, x.name + " (" + x.start_date + ")"); })); });
      function parse() {
        var people = [], bad = [];
        String(box.value).split(/\r?\n/).forEach(function (line) {
          line = line.trim(); if (!line) return;
          var m = /^(.*?)[,\t]\s*([^\s,<>]+@[^\s,<>]+)\s*(?:[,\t]\s*(\d+))?\s*$/.exec(line) || /^(.*?)\s*<([^>]+@[^>]+)>\s*(?:[,\t]\s*(\d+))?\s*$/.exec(line);
          if (!m) bad.push(line); else people.push({ name: m[1].trim(), email: m[2].trim().toLowerCase(), points: m[3] ? Number(m[3]) : 1 });
        });
        return { people: people, bad: bad };
      }
      helpersBox.appendChild(el("div", { class: "actions" }, btn("Check the list", function () {
        var p = parse(), known = {}; state.rows.forEach(function (x) { known[x.email] = x; });
        var kids = [];
        if (p.bad.length) kids.push(el("p", { class: "form-error" }, "These lines have no email address and will be skipped: " + p.bad.join("; ")));
        if (p.people.length) kids.push(el("div", { class: "table-scroll" }, el("table", { class: "admin-table" }, el("thead", null, el("tr", null, ["Name", "Email", "Points", ""].map(function (h) { return el("th", { scope: "col" }, h); }))),
          el("tbody", null, p.people.map(function (x) { return el("tr", null, el("th", { scope: "row" }, x.name || "—"), el("td", null, x.email), el("td", null, String(x.points)), el("td", null, known[x.email] ? "Already known (" + known[x.email].balance + " points now)" : "New person")); })))));
        if (p.people.length) kids.push(el("div", { class: "actions" }, btn("Award these points", function () {
          sb.rpc("points_award_helpers", { p: { competition_id: sel.value, rows: p.people } }).then(function (r) {
            if (r.error) throw r.error; toast("Awarded to " + r.data.awarded + (r.data.awarded === 1 ? " person" : " people") + (r.data.skipped ? ", " + r.data.skipped + " skipped (already awarded or not valid)" : "") + ".");
            box.value = ""; out.replaceChildren(); return load().then(drawRows);
          }).catch(function (e) { toast(msg(e), "error"); });
        }, "btn-primary")));
        out.replaceChildren.apply(out, kids);
      }, "btn-secondary")));
    }

    load().then(function () {
      var search = el("input", { class: "control", type: "search", id: "pts-q", placeholder: "Search by name or email", "aria-label": "Search by name or email", style: "max-width:22rem" });
      search.addEventListener("input", function () { state.q = search.value; drawRows(); });
      panel.replaceChildren(panelHead("Volunteer points", el("span", { class: "actions" }, btn("Add someone new", function () { addVolunteer(function () { load().then(function () { drawRows(); }); }); }, "btn-primary"))),
        summary, el("div", { class: "control-row" }, search),
        el("div", { class: "table-scroll" }, el("table", { class: "admin-table" }, el("caption", { class: "visually-hidden" }, "Volunteer points"),
          el("thead", null, el("tr", null, ["Name", "Points", "Expiring soon", "Earned", "Spent", ""].map(function (h, i) { return el("th", { scope: "col", class: i === 1 || i === 3 || i === 4 ? "num" : i === 5 ? "col-actions" : null }, h || el("span", { class: "visually-hidden" }, "Actions")); }))), tbody)),
        history, refBox, importBox, helpersBox);
      drawRows(); drawReferees(); drawImport(); drawHelpers();
    }).catch(function (e) { panel.replaceChildren(panelHead("Volunteer points"), el("p", { class: "form-error" }, friendly(e))); });
  }

  // ---- Volunteers: set up the rota, open sign-up, pick who does what, publish -----------------------------------------
  // Referees, the technical controller, the session manager and the platform manager are filled in here by the coordinator; volunteers only
  // choose from the roles marked on_form. A place holds a person's name and (if we have it) their email, which is what points will go to.
  var SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
  // Edit a volunteer: their name, email, mobile and T-shirt size. A new name shows everywhere; a new email takes their sign-ups, rota places and
  // points (history included) with it. person = { email, name }; done runs after it is saved.
  // The next quarter end on or after today, never before the first committee award (31 December 2026), for example "31 December 2026".
  function nextQuarterEnd() {
    var t = new Date(), today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()), first = Date.UTC(2026, 11, 31), ends = [[2, 31], [5, 30], [8, 30], [11, 31]];
    for (var y = t.getFullYear(); y <= t.getFullYear() + 1; y++) for (var i = 0; i < 4; i++) { var d = Date.UTC(y, ends[i][0], ends[i][1]); if (d >= today && d >= first) return new Date(d).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }); }
    return "";
  }
  // Add someone new: set them up (name, email, committee) and give them their first points in the same step.
  function addVolunteer(done) {
    openForm({ title: "Add someone new", saveLabel: "Add them", values: {},
      intro: "For someone who is not in the points list yet, for example a committee member or a volunteer from another host. You can give them points now, or later from their row.",
      fields: [{ name: "full_name", label: "Name", required: true }, { name: "email", label: "Email address", type: "email", required: true, help: "Points are tied to this address." }, { name: "mobile", label: "Mobile number (optional)" },
        { name: "committee", label: "Part of the committee", type: "checkbox", help: "Executive and supporting committee members earn 3 points at the end of every quarter. Untick when they step down." },
        { sub: "Points to give them now (optional)" },
        { name: "points", label: "Points", type: "number", min: "1", max: "100", half: true }, { name: "date", label: "Date earned (optional)", type: "date", half: true },
        { name: "reason", label: "What are they for?", help: "Needed if you add points, for example: Volunteered at the March Open. Points expire 24 months after the date earned." }],
      validate: function (v) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v.email || "").trim())) return "That email address does not look right.";
        var has = v.points !== "" && v.points !== null && v.points !== undefined;
        if (has) { var n = Number(v.points); if (!n || n < 1 || n > 100 || Math.round(n) !== n) return "Enter a whole number of points from 1 to 100, or leave it empty."; if (!String(v.reason || "").trim()) return "Say what the points are for."; }
        return null;
      },
      onSave: function (v) {
        var email = String(v.email).trim().toLowerCase(), name = String(v.full_name).trim(), n = Math.round(Number(v.points)) || 0;
        return sb.rpc("vol_person_update", { p: { email: email, full_name: name, mobile: String(v.mobile || "").trim(), committee: !!v.committee, create: true } }).then(function (res) {
          if (res.error) throw new Error(/exists/.test(String(res.error.message)) ? "That person is already in the system. Find them in the list and press Edit." : friendly(res.error));
          if (!n) { toast("Added."); return; }
          return sb.rpc("points_adjust", { p: { email: email, name: name, delta: n, reason: String(v.reason).trim(), date: v.date || "" } }).then(function (r) {
            if (r.error) throw new Error("They were added, but the points were not: " + String((r.error && r.error.message) || "").replace(/^.*?ERROR:\s*/s, "").split("\n")[0].trim() + " Find them in the list and use Edit, then Add points.");
            toast("Added, with " + n + (n === 1 ? " point." : " points."));
          });
        }).then(function () { if (done) done(); });
      } });
  }
  function editVolunteer(person, done, extraActions) {
    sb.from("vol_people").select("email,full_name,mobile,tshirt,committee").eq("email", person.email).maybeSingle().then(function (r) {
      var row = (r && r.data) || {};
      openForm({ title: "Edit " + (person.name || person.email), saveLabel: "Save changes",
        intro: "A new name shows on the points list, sign-ups and rota. A new email address keeps their points, sign-ups and rota places, and any unused priority link or discount code moves to it. Each change is recorded with your name.",
        values: { full_name: row.full_name || person.name || "", email: person.email, mobile: row.mobile || "", tshirt: row.tshirt || "", committee: !!row.committee },
        fields: [{ name: "full_name", label: "Name", required: true }, { name: "email", label: "Email address", type: "email", required: true, help: "Points are tied to this address, and it is where their emails go." },
          { name: "mobile", label: "Mobile number (optional)", half: true }, { name: "tshirt", label: "T-shirt size (optional)", type: "select", half: true, options: [{ value: "", label: "Not given" }].concat(SIZES.map(function (z) { return { value: z, label: z }; })) },
          { name: "committee", label: "Part of the committee", type: "checkbox", help: "Executive and supporting committee members earn 3 points at the end of every quarter. Untick when they step down." }],
        validate: function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v.email || "").trim()) ? null : "That email address does not look right."; },
        extra: extraActions || [],
        onSave: function (v) {
          return sb.rpc("vol_person_update", { p: { email: person.email, new_email: String(v.email).trim().toLowerCase(), full_name: String(v.full_name).trim(), mobile: String(v.mobile || "").trim(), tshirt: v.tshirt || "", committee: !!v.committee } }).then(function (res) {
            if (res.error) {
              var m = String(res.error.message || "");
              throw new Error(/exists/.test(m) ? "Someone else already has that email address. If it is the same person twice, tell us and we will merge them." : /invalid:name/.test(m) ? "Enter a name." : /invalid:email/.test(m) ? "That email address does not look right." : /forbidden/.test(m) ? "You do not have permission to do that." : friendly(res.error));
            }
            toast(res.data && res.data.email_changed ? "Saved. Their points and sign-ups have moved to the new address." : "Saved.");
            if (done) done();
          });
        } });
    });
  }
  var REF_LEVELS = [{ value: "ipf_1", label: "IPF Category 1 referee" }, { value: "ipf_2", label: "IPF Category 2 referee" }, { value: "bp_national", label: "British Powerlifting National referee" }, { value: "bp_divisional", label: "British Powerlifting Divisional referee" }, { value: "ynepf_divisional", label: "YNEPF Divisional referee" }];
  function renderVolunteersTab(view, c) {
    view.replaceChildren(el("p", null, "Loading…"));
    var V = { rota: null, roles: [], sessions: [], signups: [], people: [], referees: [] };
    function load() {
      return Promise.all([
        sb.from("vol_rota").select("*").eq("competition_id", c.id).maybeSingle(),
        sb.from("vol_roles").select("*").order("sort_order"),
        sb.from("vol_sessions").select("*, vol_places(*)").eq("competition_id", c.id).order("sort_order"),
        sb.from("vol_signups").select("*, vol_signup_roles(vol_session_id, role_id)").eq("competition_id", c.id).order("created_at"),
        sb.from("vol_people").select("email,full_name,mobile,tshirt").order("full_name"),
        sb.from("vol_referees").select("*").eq("active", true).order("name")
      ]).then(function (r) {
        V.rota = r[0].error ? null : r[0].data; V.roles = ok(r[1]); V.sessions = ok(r[2]); V.signups = ok(r[3]); V.people = ok(r[4]); V.referees = r[5].error ? [] : ok(r[5]);
        V.sessions.forEach(function (s) { s.vol_places = (s.vol_places || []).slice().sort(function (a, b) { return a.position - b.position; }); });
      });
    }
    var roleBy = function (id) { return V.roles.filter(function (r) { return r.id === id; })[0] || { name: "?", sort_order: 0 }; };
    function formUrl() { return new URL("../volunteer?c=" + encodeURIComponent(c.slug || ""), location.href).href; }
    function rotaUrl(preview) { return new URL("../rota?c=" + encodeURIComponent(c.slug || "") + (preview ? "&preview=1" : ""), location.href).href; }
    function fail(e) { toast(friendly(e), "error"); }

    // ---- first time: create the rota
    function drawSetup() {
      var n = el("input", { class: "control", type: "number", id: "vol-n", min: "1", max: "8", value: "2", style: "max-width:8rem" });
      var su = el("input", { type: "checkbox", id: "vol-su" }), td = el("input", { type: "checkbox", id: "vol-td" });
      su.checked = true; td.checked = true;
      view.replaceChildren(el("p", { class: "panel-intro" }, "Volunteers sign up for this competition, you decide who does what, then publish the rota. Start by saying how many sessions need staffing. The usual roles and numbers are filled in, and you can change every one."),
        el("div", { class: "field" }, el("label", { for: "vol-n" }, "How many sessions need staffing?"), el("p", { class: "help" }, "Lifting sessions, not counting set up and tear down."), n),
        el("div", { class: "field field-check" }, su, el("div", null, el("label", { for: "vol-su" }, "Include set up (usually the evening before)"))),
        el("div", { class: "field field-check" }, td, el("div", null, el("label", { for: "vol-td" }, "Include tear down (straight after the last session)"))),
        el("div", { class: "actions" }, btn("Create the rota", function () {
          var count = Math.max(1, Math.min(8, Math.round(Number(n.value) || 1))), plan = [];
          if (su.checked) plan.push({ area: "setup", label: "Set up" });
          for (var i = 1; i <= count; i++) plan.push({ area: "session", label: "Session " + i });
          if (td.checked) plan.push({ area: "teardown", label: "Tear down" });
          sb.from("vol_rota").upsert({ competition_id: c.id, signup_open: false, offer_tshirts: true, status: "draft" }).then(ok).then(function () {
            return sb.from("vol_sessions").insert(plan.map(function (p, i) { return { competition_id: c.id, area: p.area, label: p.label, sort_order: (i + 1) * 10 }; })).select().then(ok);
          }).then(function (ss) {
            var rows = []; ss.forEach(function (s) { V.roles.filter(function (r) { return r.area === s.area; }).forEach(function (r) { for (var k = 1; k <= r.default_places; k++) rows.push({ vol_session_id: s.id, role_id: r.id, position: k }); }); });
            return rows.length ? sb.from("vol_places").insert(rows).then(ok) : null;
          }).then(function () { return load(); }).then(function () { if (!V.rota) V.rota = { competition_id: c.id, signup_open: false, offer_tshirts: true, status: "draft" }; toast("Rota created."); draw(); }).catch(fail);
        }, "btn-primary")));
    }

    // ---- who can be chosen for a place
    // A volunteer role lists only the people who said on the form they could do it in that session. The other roles (platform manager,
    // session manager, ad-hoc, co-ordinators) list everyone who signed up. Referees, the technical controller and the jury come from the
    // referee roster, with their level. "Someone else…" is the way to pick anyone outside those lists.
    function ticked(session, role, email) {
      return V.signups.some(function (su) { return su.email === email && (su.vol_signup_roles || []).some(function (x) { return x.vol_session_id === session.id && x.role_id === role.id; }); });
    }
    function unavailable(session, place) {
      var role = roleBy(place.role_id);
      if (!role.on_form || !place.email || place.override) return false;
      var signed = V.signups.some(function (su) { return su.email === place.email; });
      return signed && !ticked(session, role, place.email);
    }
    function levelLabel(v) { var l = REF_LEVELS.filter(function (x) { return x.value === v; })[0]; return l ? l.label : ""; }
    function personSelect(session, place) {
      var role = roleBy(place.role_id), sel = el("select", { class: "control", "aria-label": role.name + ", place " + place.position });
      sel.appendChild(el("option", { value: "" }, "Empty"));
      var keep = {};
      if (role.uses_referees) {
        REF_LEVELS.forEach(function (lv) {
          var rs = V.referees.filter(function (r) { return r.level === lv.value; });
          if (rs.length) sel.appendChild(el("optgroup", { label: lv.label }, rs.map(function (r) { var d = placedElsewhere(place, r.email || null, r.name); return el("option", d ? { value: "ref:" + r.id, disabled: "disabled" } : { value: "ref:" + r.id }, r.name + (d ? " (already " + roleBy(d.role_id).name + ")" : "")); })));
        });
        sel.appendChild(el("option", { value: "__newref" }, "Add a referee…"));
      } else {
        var yes = V.signups.filter(function (su) { return role.on_form ? ticked(session, role, su.email) : true; });
        if (yes.length) sel.appendChild(el("optgroup", { label: role.on_form ? "Said they could do this (" + yes.length + ")" : "People who signed up (" + yes.length + ")" }, yes.map(function (su) { var d = placedElsewhere(place, su.email, su.full_name); return el("option", d ? { value: su.email, disabled: "disabled" } : { value: su.email }, su.full_name + (d ? " (already " + roleBy(d.role_id).name + ")" : "")); })));
        sel.appendChild(el("option", { value: "__new" }, "Someone else…"));
      }
      // the person already in the place, even if they are not in the lists above (a typed name, or someone who has changed their answers)
      var cur = "";
      if (place.person_name) {
        var found = role.uses_referees ? V.referees.filter(function (r) { return r.name === place.person_name; })[0] : null;
        cur = found ? "ref:" + found.id : place.email ? place.email : "__current";
        if (!Array.prototype.some.call(sel.options, function (o) { return o.value === cur; })) sel.insertBefore(el("option", { value: cur }, place.person_name + (place.email ? "" : " (no email)")), sel.options[1] || null);
      }
      sel.value = cur;
      sel.addEventListener("change", function () {
        var v = sel.value;
        if (v === cur) return;
        if (v === "__new") { sel.value = cur; return addPerson(session, place); }
        if (v === "__newref") { sel.value = cur; return addReferee(session, place); }
        if (v.indexOf("ref:") === 0) { var r = V.referees.filter(function (x) { return "ref:" + x.id === v; })[0]; return setPlace(place, { email: r.email || null, person_name: r.name, level: levelLabel(r.level), override: false }); }
        var who = v ? V.signups.concat(V.people).filter(function (x) { return x.email === v; })[0] : null;
        setPlace(place, v ? { email: v, person_name: who ? who.full_name : v, level: "", override: false } : { email: null, person_name: "", level: "", override: false });
      });
      return sel;
    }
    // one person, one job per session: where is this person already placed in the same session (other than this place)?
    function sessionOf(place) { return V.sessions.filter(function (x) { return x.vol_places.indexOf(place) >= 0; })[0]; }
    function sameWho(p, email, name) { return email ? p.email === email : !!name && !p.email && String(p.person_name).toLowerCase() === String(name).toLowerCase(); }
    function placedElsewhere(place, email, name) {
      var s = sessionOf(place); if (!s || (!email && !name)) return null;
      return s.vol_places.filter(function (p) { return p !== place && p.person_name && sameWho(p, email, name); })[0] || null;
    }
    function setPlace(place, patch) {
      var dup = patch.person_name ? placedElsewhere(place, patch.email, patch.person_name) : null;
      if (dup) { toast(patch.person_name + " is already down as " + roleBy(dup.role_id).name + " in this session. Each person can only do one job in a session."); draw(); return Promise.resolve(); }
      return sb.from("vol_places").update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq("id", place.id).then(ok).then(function () { Object.assign(place, patch); draw(); }).catch(function (e) { fail(e); draw(); });
    }
    // anyone else: choose someone we know, or add a new person (an email is optional, but it is what points go to)
    function addPerson(session, place) {
      var known = V.signups.concat(V.people.filter(function (pp) { return !V.signups.some(function (su) { return su.email === pp.email; }); }));
      openForm({ title: "Choose someone else", intro: "For someone who did not tick this role, or has not signed up. This is your choice, so they will not be flagged as unavailable. Pick a person we know, or add a new one below.", saveLabel: "Use this person",
        fields: [{ name: "existing", label: "Someone we know", type: "select", options: [{ value: "", label: "A new person (fill in below)" }].concat(known.map(function (x) { return { value: x.email, label: x.full_name + " (" + x.email + ")" }; })) },
          { name: "full_name", label: "Name (for a new person)" }, { name: "email", label: "Email address (optional)", type: "email", half: true }, { name: "mobile", label: "Mobile number (optional)", half: true }],
        values: {}, validate: function (v) { if (!v.existing && !String(v.full_name || "").trim()) return "Choose someone, or enter a name."; return v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v.email).trim()) ? "That email address does not look right." : null; },
        onSave: function (v) {
          if (v.existing) { var w = known.filter(function (x) { return x.email === v.existing; })[0]; return setPlace(place, { email: v.existing, person_name: w.full_name, level: "", override: true }); }
          var email = String(v.email || "").trim().toLowerCase(), name = String(v.full_name || "").trim();
          var make = email ? sb.from("vol_people").upsert({ email: email, full_name: name, mobile: String(v.mobile || "").trim() }).then(ok).then(function () { if (!V.people.some(function (x) { return x.email === email; })) V.people.push({ email: email, full_name: name }); }) : Promise.resolve();
          return make.then(function () { return setPlace(place, { email: email || null, person_name: name, level: "", override: true }); });
        } });
    }
    // a referee who is not on the roster yet: their level is required, so it shows on the rota
    function addReferee(session, place) {
      openForm({ title: "Add a referee", intro: "They join the referee roster, so they are in the list next time. Their level is shown on the rota.", saveLabel: "Add and use",
        fields: [{ name: "name", label: "Name", required: true }, { name: "level", label: "Level", type: "select", required: true, options: [{ value: "", label: "Choose a level" }].concat(REF_LEVELS) }, { name: "email", label: "Email address (optional)", type: "email", help: "Needed for them to earn volunteer points." }],
        values: {}, validate: function (v) { if (!v.level) return "Choose their level."; return v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v.email).trim()) ? "That email address does not look right." : null; },
        onSave: function (v) {
          var row = { name: String(v.name).trim(), email: String(v.email || "").trim().toLowerCase() || null, level: v.level, active: true };
          return sb.from("vol_referees").insert(row).select().then(ok).then(function (rows) {
            V.referees.push(rows[0]); V.referees.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
            return setPlace(place, { email: row.email, person_name: row.name, level: levelLabel(row.level), override: false });
          });
        } });
    }

    // ---- a session: its places, grouped by role
    function sessionCard(s) {
      var taken = {}; s.vol_places.forEach(function (p) { if (p.email) taken[p.email] = (taken[p.email] || 0) + 1; });
      var byRole = {}, order = []; s.vol_places.forEach(function (p) { if (!byRole[p.role_id]) { byRole[p.role_id] = []; order.push(p.role_id); } byRole[p.role_id].push(p); });
      V.roles.forEach(function (r) { if (r.area === s.area && !byRole[r.id] && (r.name !== "Jury" || s.jury)) { byRole[r.id] = []; order.push(r.id); } });
      order.sort(function (a, b) { return roleBy(a).sort_order - roleBy(b).sort_order; });
      var filled = s.vol_places.filter(function (p) { return p.person_name; }).length;
      var card = el("section", { class: "card rota-session", "aria-label": s.label },
        el("div", { class: "card-head" }, el("div", null, el("h2", null, s.label + (s.jury ? " (with a jury)" : "")), el("p", null, (s.when_text ? s.when_text + " · " : "") + filled + " of " + s.vol_places.length + " places filled")),
          el("span", { class: "actions" }, btn("Edit session", function () { editSession(s); }, "btn-secondary"))));
      var roles = el("div", { class: "rota-roles" }), empty = [];
      order.forEach(function (rid) {
        var r = roleBy(rid), places = byRole[rid];
        if (!places.length) { empty.push(rid); return; }          // roles with nobody yet are one compact line below, not a row each
        roles.appendChild(el("div", { class: "rota-role" }, el("div", { class: "rota-role-head" }, el("h3", { class: "rota-role-name" }, r.name, r.on_form ? null : el("small", null, "you choose")),
          btn("Add place", function () { addPlace(s, rid, places); }, "btn-ghost btn-sm", { "aria-label": "Add a " + r.name + " place" })),
          el("ul", { class: "rota-people" }, places.map(function (p) { return placeRow(s, p, taken); }))));
      });
      if (roles.children.length) card.appendChild(roles);
      if (empty.length) card.appendChild(el("div", { class: "rota-empty-roles" }, el("p", null, roles.children.length ? "Roles with nobody yet. Add a place for:" : "Nobody is placed yet. Add a place for:"),
        el("div", { class: "chip-row" }, empty.map(function (rid) { var r = roleBy(rid); return el("button", { type: "button", class: "chip", "aria-label": "Add a " + r.name + " place", onclick: function () { addPlace(s, rid, []); } }, "+ " + r.name); }))));
      return card;
    }
    // one place: a dropdown while it is empty or being edited; once someone is in it, their name with the on-the-day buttons beside it
    var editing = {};
    var DAY_TAG = { arrived: ["Arrived", "tag tag-open"], no_show: ["No show", "tag tag-full"], cancelled: ["Told us in advance", "tag tag-position"] };
    function placeRow(s, p, taken) {
      var gone = unavailable(s, p), r = roleBy(p.role_id), st = DAY_TAG[p.status], filled = !!p.person_name, edit = !filled || editing[p.id];
      var notes = [gone ? el("p", { class: "rota-warn", role: "alert" }, p.person_name + " is no longer available for this role. Please amend this.") : null,
        p.email && taken[p.email] > 1 ? el("p", { class: "rota-warn" }, p.person_name + " is in more than one place in this session.") : null];
      var main, acts = [];
      if (edit) {
        var sel = personSelect(s, p); sel.classList.add("control");
        if (gone) { sel.setAttribute("aria-invalid", "true"); sel.style.borderColor = "var(--error-border, #b91c1c)"; sel.style.borderWidth = "3px"; }
        main = el("div", { class: "item-main" }, sel, notes);
        if (filled) acts.push(btn("Done", function () { delete editing[p.id]; draw(); }, "btn-secondary", { "aria-label": "Done editing " + p.person_name }));
        acts.push(btn("Remove place", function () { removePlace(s, p); }, "btn-ghost", { "aria-label": "Remove " + r.name + " place " + p.position }));
      } else {
        main = el("div", { class: "item-main" }, el("p", { class: "item-title" }, p.person_name, st ? el("span", { class: st[1], style: "margin-left:var(--space-2)" }, st[0]) : null),
          [p.level, p.email ? "" : "No email, so no points"].filter(Boolean).length ? el("p", { class: "item-sub" }, [p.level, p.email ? "" : "No email, so no points"].filter(Boolean).join(". ")) : null, notes);
        if (st) acts.push(btn("Undo", function () { mark(p, "planned"); }, "btn-ghost", { "aria-label": "Undo for " + p.person_name }));
        else {
          acts.push(btn("Arrived", function () { mark(p, "arrived"); }, "btn-secondary", { "aria-label": "Arrived: " + p.person_name }),
            btn("No show", function () { mark(p, "no_show"); }, "btn-ghost", { "aria-label": "No show: " + p.person_name }),
            btn("Told us", function () { mark(p, "cancelled"); }, "btn-ghost", { "aria-label": "Told us in advance: " + p.person_name, title: "They let us know in advance. They lose nothing." }),
            btn("Edit", function () { editing[p.id] = true; draw(); }, "btn-ghost", { "aria-label": "Edit " + p.person_name }));
        }
        acts.push(btn("Remove place", function () { removePlace(s, p); }, "btn-danger", { "aria-label": "Remove " + r.name + " place for " + p.person_name }));
      }
      return el("li", { class: "rota-place" + (gone ? " is-warn" : "") }, main, el("div", { class: "rota-actions" }, acts));
    }
    function addPlace(s, rid, places) {
      var next = places.reduce(function (m, p) { return Math.max(m, p.position); }, 0) + 1;
      sb.from("vol_places").insert({ vol_session_id: s.id, role_id: rid, position: next }).select().then(ok).then(function (rows) { s.vol_places.push(rows[0]); draw(); }).catch(fail);
    }
    function removePlace(s, p) {
      if (p.person_name && !window.confirm("Remove this place? " + p.person_name + " is in it.")) return;
      sb.from("vol_places").delete().eq("id", p.id).then(ok).then(function () { s.vol_places = s.vol_places.filter(function (x) { return x.id !== p.id; }); draw(); }).catch(fail);
    }
    function editSession(s) {
      openForm({ title: "Edit " + s.label, saveLabel: "Save changes", values: { label: s.label, when_text: s.when_text, jury: s.jury },
        fields: [{ name: "label", label: "Name", required: true }, { name: "when_text", label: "Times", help: "For example: Weigh-in 08:00, lift off 10:00. Shown on the rota." }].concat(s.area === "session" ? [{ name: "jury", label: "This session has a jury", type: "checkbox", help: "Adds three jury places. Only tick it when the technical controller asks for one." }] : []),
        extra: [{ label: "Remove session", onclick: function () { removeSession(s); } }],
        onSave: function (v) {
          var patch = { label: String(v.label).trim(), when_text: String(v.when_text || "").trim(), jury: !!v.jury };
          var jury = V.roles.filter(function (r) { return r.name === "Jury"; })[0], had = s.vol_places.filter(function (p) { return jury && p.role_id === jury.id; }), job = Promise.resolve();
          if (s.area !== "session") patch.jury = false;
          if (jury && s.area === "session" && patch.jury && !had.length) job = sb.from("vol_places").insert([1, 2, 3].map(function (k) { return { vol_session_id: s.id, role_id: jury.id, position: k }; })).select().then(ok).then(function (rows) { s.vol_places = s.vol_places.concat(rows); });
          if (jury && s.area === "session" && !patch.jury && had.length) {
            var filledJury = had.filter(function (p) { return p.person_name; });
            if (filledJury.length && !window.confirm("The jury places have " + filledJury.length + (filledJury.length === 1 ? " person" : " people") + " in them. Remove the jury anyway?")) patch.jury = true;
            else job = sb.from("vol_places").delete().in("id", had.map(function (p) { return p.id; })).then(ok).then(function () { s.vol_places = s.vol_places.filter(function (p) { return had.indexOf(p) < 0; }); });
          }
          return job.then(function () { return sb.from("vol_sessions").update(patch).eq("id", s.id).then(ok); }).then(function () { Object.assign(s, patch); draw(); });
        } });
    }
    function removeSession(s) {
      var n = s.vol_places.filter(function (p) { return p.person_name; }).length;
      if (!window.confirm("Remove " + s.label + "?" + (n ? " " + n + (n === 1 ? " person is" : " people are") + " in its places." : "") + " This cannot be undone.")) return;
      sb.from("vol_sessions").delete().eq("id", s.id).then(ok).then(function () { V.sessions = V.sessions.filter(function (x) { return x !== s; }); toast("Session removed."); draw(); }).catch(fail);
    }
    function addSession() {
      openForm({ title: "Add a session", saveLabel: "Add session", values: { area: "session" }, fields: [{ name: "label", label: "Name", required: true }, { name: "area", label: "What is it?", type: "select", options: [{ value: "session", label: "A lifting session" }, { value: "setup", label: "Set up" }, { value: "teardown", label: "Tear down" }] }],
        onSave: function (v) {
          // Where it goes: set up first, lifting sessions after the last lifting session (before tear down), tear down last. So a third or fourth
          // session, or a second day, added later still lands before "Tear down".
          function top(list) { return list.reduce(function (m, x) { return Math.max(m, x.sort_order); }, 0); }
          var tear = V.sessions.filter(function (x) { return x.area === "teardown"; }).sort(function (a, b) { return a.sort_order - b.sort_order; });
          var others = V.sessions.filter(function (x) { return x.area !== "teardown"; });
          var order = v.area === "setup" ? V.sessions.reduce(function (m, x) { return Math.min(m, x.sort_order); }, 10) - 10 : v.area === "teardown" ? top(V.sessions) + 10 : top(others) + 10;
          var bump = v.area === "session" ? tear.filter(function (x, i) { return x.sort_order <= order; }) : [];          // tear down moves after the new session
          return Promise.all(bump.map(function (x, i) { var n = order + 10 * (tear.indexOf(x) + 1); return sb.from("vol_sessions").update({ sort_order: n }).eq("id", x.id).then(ok).then(function () { x.sort_order = n; }); })).then(function () {
            return sb.from("vol_sessions").insert({ competition_id: c.id, area: v.area, label: String(v.label).trim(), sort_order: order }).select().then(ok);
          }).then(function (ss) {
            var rows = []; V.roles.filter(function (r) { return r.area === v.area; }).forEach(function (r) { for (var k = 1; k <= r.default_places; k++) rows.push({ vol_session_id: ss[0].id, role_id: r.id, position: k }); });
            return (rows.length ? sb.from("vol_places").insert(rows).select().then(ok) : Promise.resolve([])).then(function (pl) { ss[0].vol_places = pl; V.sessions.push(ss[0]); V.sessions.sort(function (a, b) { return a.sort_order - b.sort_order; }); draw(); });
          });
        } });
    }

    // ---- sign-up, people, publishing
    function setRota(patch, msg) { return sb.from("vol_rota").update(patch).eq("competition_id", c.id).then(ok).then(function () { Object.assign(V.rota, patch); if (msg) toast(msg); draw(); }).catch(fail); }
    function downloadSignups() {
      var head = ["Name", "Email", "Mobile", "T-shirt", "Signed up", "Note"].concat(V.sessions.map(function (s) { return s.label; }));
      var lines = [head.map(csvCell).join(",")].concat(V.signups.map(function (su) {
        return [su.full_name, su.email, su.mobile, su.tshirt, new Date(su.created_at).toLocaleString("en-GB", { timeZone: Y.TZ }), su.note].concat(V.sessions.map(function (s) {
          return (su.vol_signup_roles || []).filter(function (x) { return x.vol_session_id === s.id; }).map(function (x) { return roleBy(x.role_id).name; }).join("; ");
        })).map(csvCell).join(",");
      }));
      var a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" })), download: (c.slug || "competition") + "-volunteers.csv" }); document.body.appendChild(a); a.click(); a.remove();
    }
    // ---- on the day: tick people off as they arrive. Arrived earns the role's points; a no show loses all their points; telling us in advance costs nothing.
    function mark(p, status) {
      if (status === "no_show" && !window.confirm("Mark " + p.person_name + " as a no show? They lose ALL their volunteer points. You can undo it, but only do this if they did not turn up and did not tell us.")) return;
      sb.rpc("vol_mark", { pl: p.id, new_status: status }).then(function (r) {
        if (r.error) throw r.error;
        var d = r.data || {}; p.status = status;
        toast(status === "arrived" ? (d.no_email ? p.person_name + " arrived. They have no email on file, so no points." : "Arrived: " + (d.points > 0 ? "+" + d.points + " point" + (d.points === 1 ? "" : "s") : "no points") + " for " + p.person_name + ".")
          : status === "no_show" ? "No show: " + (d.points < 0 ? "removed " + (-d.points) + " points from " : "") + p.person_name + "." : status === "cancelled" ? p.person_name + " told us in advance." : "Undone.");
        draw();
      }).catch(function (e) { toast(friendly(e), "error"); });
    }
    function draw() {
      var closesAt = V.rota.signup_closes_at ? new Date(V.rota.signup_closes_at) : null, lapsed = !!(closesAt && closesAt <= new Date()), open = !!V.rota.signup_open && !lapsed, published = V.rota.status === "published";
      var people = V.signups.length + (V.signups.length === 1 ? " person has" : " people have") + " signed up so far.";
      function stamp(d) { return d.toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" }); }
      var shirts = el("input", { type: "checkbox", id: "vol-shirts" }); shirts.checked = !!V.rota.offer_tshirts; shirts.addEventListener("change", function () { setRota({ offer_tshirts: shirts.checked }); });
      var when = el("input", { type: "datetime-local", id: "vol-closes", value: Y.toLondonInput(V.rota.signup_closes_at) });
      when.addEventListener("change", function () { setRota({ signup_closes_at: Y.fromLondonInput(when.value) }, when.value ? "Sign-up will close then." : "Sign-up will stay open until you close it."); });
      var link = el("input", { type: "text", readonly: "", value: formUrl(), "aria-label": "The sign-up link to share", onfocus: function (ev) { ev.target.select(); } });
      // The status of both halves, at a glance, under the heading.
      var statusRow = el("p", { class: "status-row", role: "status" }, el("span", null, "Sign-up", el("span", { class: "tag " + (open ? "tag-open" : "tag-closed") }, open ? "Open" : "Closed")), el("span", null, "Rota", el("span", { class: "tag " + (published ? "tag-open" : "tag-position") }, published ? "Published" : "Draft")), el("span", null, people));
      var signupBox = el("section", { class: "card vol-card", "aria-labelledby": "vol-signup-h" },
        el("div", { class: "vol-card-head" }, el("h2", { id: "vol-signup-h" }, "Sign-up"),
          open ? btn("Close sign-up", function () { setRota({ signup_open: false }, "Sign-up closed."); }, "btn-secondary") : el("button", { type: "button", class: "btn btn-sm btn-primary", onclick: function () { if (!V.sessions.length) return toast("Add a session first.", "error"); setRota(lapsed ? { signup_open: true, signup_closes_at: null } : { signup_open: true }, "Sign-up is open."); } }, "Open sign-up")),
        el("p", { class: "help", id: "vol-signup-note" }, (open ? "Sign-up is open. Anyone with the link can sign up" + (closesAt ? " until " + stamp(closesAt) : "") + ". It shows on the calendar as a Volunteer button." : lapsed && V.rota.signup_open ? "Sign-up closed by itself on " + stamp(closesAt) + "." : "Sign-up is closed. Open it when you are ready, usually a couple of weeks after entry opens.")),
        el("div", { class: "copy-row" }, link, btn("Copy the link", function () { copyText(formUrl()); }, "btn-secondary"), V.signups.length ? btn("Download sign-ups (CSV)", downloadSignups, "btn-ghost") : null),
        el("hr"),
        el("div", { class: "vol-settings" },
          el("div", { class: "field", style: "max-width:22rem;margin:0" }, el("label", { for: "vol-closes" }, "Close sign-up automatically (optional)"), el("p", { class: "help", id: "vol-closes-help" }, "UK time. Leave empty to close it yourself."), when),
          el("div", { class: "field field-check", style: "margin:0" }, shirts, el("div", null, el("label", { for: "vol-shirts" }, "Ask for a T-shirt size"), el("p", { class: "help" }, "Unisex sizes XS to 5XL. Turn it off for competitions where we are not providing T-shirts.")))));
      // Publishing the rota can email each volunteer who has a role, once: what they are doing, with a link to the rota. Publishing again does not email again.
      function rotaPeople() { var seen = {}; V.sessions.forEach(function (s) { (s.vol_places || []).forEach(function (p) { if (p.email && (p.status || "planned") === "planned") seen[p.email.toLowerCase()] = 1; }); }); return Object.keys(seen).length; }
      function emailRota() {
        return sb.auth.getSession().then(function (g) {
          var token = g.data && g.data.session && g.data.session.access_token;
          return fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", { method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "", Authorization: "Bearer " + token }, body: JSON.stringify({ action: "rota_share", competition_id: c.id }) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error === "not_published" ? "Publish the rota first." : b.error === "not_allowed" ? "You do not have permission to do that." : "The email function did not answer. Check that it has been updated in Supabase."); return b; }); });
      }
      function publishRota() {
        var n = rotaPeople(), now = function () { return { status: "published", published_at: new Date().toISOString() }; };
        if (V.rota.emailed_at || !n) { setRota(now(), "Rota published."); return; }          // already emailed once, or nobody to email: just publish
        openForm({ title: "Publish the rota", fields: [], saveLabel: "Publish and email " + n + (n === 1 ? " volunteer" : " volunteers"),
          intro: "Publishing puts names and roles on a public page (no emails or mobile numbers). You can also email the " + n + (n === 1 ? " volunteer" : " volunteers") + " who " + (n === 1 ? "has" : "have") + " a role, telling them what they are doing and linking to the rota, from the competitions address. This email goes out once: publishing again later does not email them again.",
          extra: [{ label: "Publish without emailing", onclick: function () { setRota(now(), "Rota published."); } }],
          onSave: function () {
            var patch = now();
            return sb.from("vol_rota").update(patch).eq("competition_id", c.id).then(ok).then(function () {
              Object.assign(V.rota, patch);
              return emailRota().then(function (b) { V.rota.emailed_at = new Date().toISOString(); V.rota.emailed_count = b.sent; toast("Rota published and emailed to " + b.sent + (b.sent === 1 ? " volunteer" : " volunteers") + (b.failed ? ", and " + b.failed + " could not be sent" : "") + "."); })
                .catch(function (e) { toast("Rota published, but the email did not send: " + friendly(e) + " Unpublish and publish again to try once more.", "error"); });
            }).then(function () { draw(); });
          } });
      }
      var shareBox = el("section", { class: "card vol-card", "aria-labelledby": "vol-pub-h" },
        el("div", { class: "vol-card-head" }, el("h2", { id: "vol-pub-h" }, "Publishing"), published ? btn("Unpublish", function () { setRota({ status: "draft", published_at: null }, "Rota unpublished."); }, "btn-secondary") : el("button", { type: "button", class: "btn btn-sm btn-primary", onclick: publishRota }, "Publish")),
        el("p", { class: "help", id: "vol-pub-note" }, published ? "The rota is published: anyone can see who is helping, by name and role. Changes show straight away." + (V.rota.emailed_at ? " Volunteers were emailed on " + stamp(new Date(V.rota.emailed_at)) + (V.rota.emailed_count ? " (" + V.rota.emailed_count + (V.rota.emailed_count === 1 ? " person" : " people") + ")" : "") + "." : "") : "The rota is not published. Publishing puts names and roles on a public page (no emails or mobile numbers). Preview shows it to the entries team first."),
        el("div", { class: "actions" }, el("a", { class: "btn btn-sm btn-ghost", href: rotaUrl(true), target: "_blank", rel: "noopener" }, "Preview ", el("span", { class: "visually-hidden" }, "(opens in a new tab)")),
          published ? btn("Copy the rota link", function () { copyText(rotaUrl(false)); }, "btn-ghost") : null));
      var needs = [];
      V.sessions.forEach(function (s) { s.vol_places.forEach(function (p) { if (unavailable(s, p)) needs.push(p.person_name + " (" + s.label + ", " + roleBy(p.role_id).name + ")"); }); });
      var needBox = needs.length ? el("div", { class: "callout", role: "alert" }, el("p", { class: "callout-title" }, needs.length + (needs.length === 1 ? " place needs" : " places need") + " attention"), el("p", { style: "margin:0" }, "Changed their answers and no longer available for the role they were given: " + needs.join("; ") + ".")) : null;
      var peopleBox = V.signups.length ? el("details", { class: "ol-settings" }, el("summary", null, "Who has signed up (" + V.signups.length + ")"),
        el("ul", { class: "item-list" }, V.signups.map(function (su) {
          var n = (su.vol_signup_roles || []).length;
          return el("li", { class: "item-row" }, el("div", { class: "item-main" }, el("p", { class: "item-title" }, su.full_name), el("p", { class: "item-sub" }, su.email + (su.mobile ? " · " + su.mobile : "") + (su.tshirt ? " · " + su.tshirt : "") + " · " + n + (n === 1 ? " role ticked" : " roles ticked"))),
            el("span", { class: "actions" }, btn("Edit", function () { editVolunteer({ email: su.email, name: su.full_name }, function () { load().then(draw); }); }, "btn-ghost", { "aria-label": "Edit " + su.full_name })));
        }))) : null;
      var dayBox = el("details", { class: "ol-settings" }, el("summary", null, "How the day works"),
        el("div", { class: "stack" },
          el("p", null, "Press ", el("strong", null, "Arrived"), " beside a name to give them the role’s points straight away."),
          el("p", null, el("strong", null, "No show"), " is for someone who did not turn up and did not tell us. It removes all their points."),
          el("p", null, el("strong", null, "Told us"), " is for someone who let us know in advance. It costs them nothing."),
          el("p", null, "Referees, the technical controller, the session manager and the platform manager are not on the sign-up form: you fill those in.")));
      var kids = [statusRow, el("p", { class: "panel-intro" }, "Open sign-up, choose who does what in each session, and publish the rota."), signupBox];
      if (peopleBox) kids.push(peopleBox);
      kids.push(dayBox);
      if (needBox) kids.push(needBox);
      kids.push(el("div", { class: "section-head" }, el("h2", null, "Sessions"), btn("Add session", addSession, "btn-secondary")));
      V.sessions.forEach(function (s) { kids.push(sessionCard(s)); });
      if (!V.sessions.length) kids.push(el("div", { class: "empty-state" }, el("p", null, "No sessions yet. Add a session to start building the rota.")));
      kids.push(shareBox);
      view.replaceChildren.apply(view, kids);
    }
    load().then(function () {
      if (!V.rota && !V.sessions.length) return drawSetup();
      if (!V.rota) V.rota = { competition_id: c.id, signup_open: false, offer_tshirts: true, status: "draft" };
      draw();
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  // ---- Waiting list: who is waiting, who has been offered a place, and a button to look after the list now -----
  function renderWaitingTab(view, c) {
    view.replaceChildren(el("p", null, "Loading…"));
    Promise.all([
      sb.from("waiting_list").select("*, offers(expires_at, outcome, offered_at)").eq("competition_id", c.id).order("joined_at"),
      sb.rpc("places_left", { c: c.id })
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      var all = res[0].data || [], left = res[1].error ? null : res[1].data, now = new Date();
      var active = all.filter(function (w) { return w.status === "waiting" || w.status === "offered"; });
      all = active.concat(all.filter(function (w) { return active.indexOf(w) < 0; }));        // the queue first, then people who are no longer waiting
      function offerOf(w) { return (w.offers || []).filter(function (o) { return !o.outcome; }).sort(function (p, q) { return new Date(q.offered_at) - new Date(p.offered_at); })[0]; }
      function stateOf(w) {
        var o = offerOf(w);
        if (w.status === "offered" && o) return ["Offered until " + new Date(o.expires_at).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" }), "tag tag-open"];
        return ({ waiting: ["Waiting", "tag tag-position"], entered: ["Entered", "tag tag-open"], lapsed: ["Did not take the place", "tag tag-full"], declined: ["Declined", "tag tag-full"], removed: ["Removed", "tag tag-full"], offered: ["Offered", "tag tag-open"] })[w.status] || [w.status, "tag"];
      }
      var checkBtn = btn("Check the list now", function () {
        checkBtn.disabled = true;
        sb.auth.getSession().then(function (s) {
          var token = s.data && s.data.session && s.data.session.access_token;
          return fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", { method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "", Authorization: "Bearer " + token }, body: JSON.stringify({ action: "run", competition_id: c.id }) });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error === "not_allowed" ? "You do not have permission to do that." : "The waiting list function did not answer. Check that it has been added in Supabase."); return b; }); })
          .then(function (b) { toast("Done: " + b.offers + " offered, " + b.reminders + " reminders, " + b.expired + " ended" + (b.failed ? ", " + b.failed + " emails failed" : "") + "."); renderWaitingTab(view, c); })
          .catch(function (e) { toast(friendly(e), "error"); checkBtn.disabled = false; });
      }, "btn-secondary");
      view.replaceChildren(
        el("div", { class: "actions", style: "margin-bottom:var(--space-3)" }, checkBtn),
        el("p", { class: "panel-intro" }, "Opens by itself when the competition is full. When a place frees up, the next person is emailed a link and the place is held for them. " +
          (left === null ? "" : left + (left === 1 ? " place free" : " places free") + ", ") + active.length + " waiting."),
        all.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
          el("thead", null, el("tr", null, ["Place in queue", "Name", "Email", "Joined", "Status", "Actions"].map(function (h) { return el("th", { scope: "col" }, h); }))),
          el("tbody", null, all.map(function (w) {
            var pos = active.indexOf(w) + 1, st = stateOf(w);
            return el("tr", null, el("td", null, pos ? String(pos) : "–"), el("th", { scope: "row" }, w.full_name), el("td", null, w.email),
              el("td", null, new Date(w.joined_at).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" })),
              el("td", null, el("span", { class: st[1] }, st[0])),
              el("td", null, w.status === "waiting" || w.status === "offered" ? el("span", { class: "actions" }, btn(w.status === "offered" ? "Withdraw offer" : "Remove", function () {
                if (!window.confirm((w.status === "offered" ? "Withdraw the offer to " : "Take off the list: ") + w.full_name + "? " + (w.status === "offered" ? "The place goes to the next person." : ""))) return;
                sb.rpc("waitlist_remove", { wid: w.id }).then(function (r) { if (r.error) throw r.error; toast("Done."); renderWaitingTab(view, c); }).catch(function (e) { toast(friendly(e), "error"); });
              }, "btn-danger")) : ""));
          })))) : el("p", { class: "empty" }, "Nobody is on the waiting list."));
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  // ---- Extras: a photo package, merchandise (a T-shirt in sizes) offered on the entry form ------------------
  var EXTRA_KINDS = { photo: "Photo package", merch: "Merchandise", federation: "Federation" };
  function renderExtrasTab(view, c) {
    view.replaceChildren(el("p", null, "Loading…"));
    Promise.all([
      sb.from("addons").select("*, addon_options(id,label,stock,sort_order)").eq("competition_id", c.id).order("sort_order").order("name"),
      sb.from("entry_addons").select("addon_id,option_id,quantity,entries!inner(competition_id,status,hold_expires_at)").eq("entries.competition_id", c.id)
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      var items = res[0].data || [], now = new Date();
      var taken = (res[1].error ? [] : res[1].data || []).filter(function (x) { var e = x.entries; return e && (e.status === "paid" || e.status === "comped" || (e.status === "held" && new Date(e.hold_expires_at) > now)); });
      function count(id) { return taken.filter(function (x) { return x.addon_id === id; }).reduce(function (n, x) { return n + x.quantity; }, 0); }
      view.replaceChildren(
        el("div", { class: "section-head is-first" }, el("h2", null, "Extras"), btn("Add an extra", function () { editExtra(c, null, function () { renderExtrasTab(view, c); }); }, "btn-primary")),
        el("p", { class: "panel-intro" }, "Extras are offered on the entry form, after the lifting questions, and added to what the lifter pays. Discount codes take money off the entry only, never the extras. A photo package is paid to the photographer you name on the Money tab, merchandise is shared with the host by the percentage you set there, and anything marked as paid to the federation is kept by the federation."),
        items.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
          el("thead", null, el("tr", null, ["Extra", "Type", "Price", "Taken", "Actions"].map(function (h) { return el("th", { scope: "col", class: h === "Price" || h === "Taken" ? "num" : h === "Actions" ? "col-actions" : null }, h); }))),
          el("tbody", null, items.map(function (x) {
            var sizes = (x.addon_options || []).slice().sort(function (p, q) { return p.sort_order - q.sort_order; }).map(function (o) { return o.label; });
            var n = count(x.id);
            return el("tr", null,
              el("th", { scope: "row" }, x.name, el("small", null, [x.description, sizes.length && "Sizes: " + sizes.join(", ")].filter(Boolean).join(" · "))),
              el("td", null, EXTRA_KINDS[x.kind] || x.kind), el("td", { class: "num" }, money(x.price_pence)),
              el("td", { class: "num" }, n + (x.stock === null ? "" : " of " + x.stock)),
              el("td", { class: "col-actions" }, el("span", { class: "actions" },
                btn("Edit", function () { editExtra(c, x, function () { renderExtrasTab(view, c); }); }),
                n === 0 ? btn("Delete", function () { if (!window.confirm("Delete " + x.name + "?")) return; sb.from("addons").delete().eq("id", x.id).then(ok).then(function () { toast("Deleted."); renderExtrasTab(view, c); }).catch(function (e) { toast(friendly(e), "error"); }); }, "btn-danger") : null)));
          })))) : el("p", { class: "empty" }, "No extras yet. Add the photo package, or anything else you sell with entries."));
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  function editExtra(c, x, done) {
    var current = x ? (x.addon_options || []).slice().sort(function (p, q) { return p.sort_order - q.sort_order; }) : [];
    openForm({
      title: x ? "Change " + x.name : "Add an extra", saveLabel: "Save",
      intro: "For example the White Lights Media photo package, or a T-shirt in sizes.",
      values: x ? { kind: x.kind, name: x.name, description: x.description, price: poundsInput(x.price_pence), stock: x.stock === null ? "" : x.stock, sizes: current.map(function (o) { return o.label; }).join(", ") }
                : { kind: "photo", name: "White Lights Media photo package", description: "", price: "", stock: "", sizes: "" },
      fields: [
        { name: "kind", label: "What kind is it?", type: "select", half: true, options: [{ value: "photo", label: "Photo package (paid to the photographer)" }, { value: "merch", label: "Merchandise (shared with the host)" }, { value: "federation", label: "Paid to the federation (the federation keeps all of it)" }] },
        { name: "price", label: "Price (£)", type: "number", min: "0", required: true, half: true },
        { name: "name", label: "Name", required: true, help: "Shown on the entry form, on the payment page and in the confirmation email." },
        { name: "description", label: "Short description (optional)", help: "One line shown under the name on the entry form." },
        { name: "stock", label: "How many are available? (optional)", type: "number", min: "1", half: true, help: "Leave blank for no limit." },
        { name: "sizes", label: "Sizes (optional)", half: true, help: "Separate with commas, for example S, M, L, XL. Leave blank if it has no sizes." }
      ],
      validate: function (v) { return v.price === null || v.price < 0 ? "Enter a price of zero or more." : null; },
      onSave: function (v) {
        var row = { competition_id: c.id, kind: v.kind, name: v.name, description: v.description || "", price_pence: pence(v.price), stock: v.stock === "" || v.stock === null ? null : Math.round(v.stock) };
        var q = x ? sb.from("addons").update(row).eq("id", x.id).select("id").single() : sb.from("addons").insert(row).select("id").single();
        return q.then(ok).then(function (d) {
          var id = (Array.isArray(d) ? d[0] : d).id;
          var labels = String(v.sizes || "").split(",").map(function (s) { return s.trim(); }).filter(function (s, i, all) { return s && all.indexOf(s) === i; });
          var add = labels.filter(function (l) { return !current.some(function (o) { return o.label === l; }); });
          var drop = current.filter(function (o) { return labels.indexOf(o.label) < 0; });
          var kept = [];
          return Promise.all(drop.map(function (o) { return sb.from("addon_options").delete().eq("id", o.id).then(function (r) { if (r.error) kept.push(o.label); }); }))
            .then(function () { return add.length ? sb.from("addon_options").insert(add.map(function (l, i) { return { addon_id: id, label: l, sort_order: labels.indexOf(l) }; })).then(ok) : null; })
            .then(function () { toast(kept.length ? "Saved. These sizes were kept because someone has already chosen them: " + kept.join(", ") + "." : "Saved."); done(); });
        });
      }
    });
  }

  function renderMoneyTab(view, c) {
    view.replaceChildren(el("p", null, "Loading…"));
    Promise.all([
      sb.rpc("competition_settlement", { c: c.id }),
      sb.from("payout_rules").select("*, payees(name,kind)").eq("competition_id", c.id),
      sb.from("payouts").select("*, payees(name)").eq("competition_id", c.id).order("paid_on", { ascending: false }),
      sb.from("payees").select("id,name,kind"),
      sb.from("federation_fees").select("key,pence")
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      var feeDefaults = {}; ((res[4].error ? [] : res[4].data) || []).forEach(function (f) { feeDefaults[f.key] = f.pence; });
      var franchise = c.is_franchise !== false;
      var hostPayee = (res[3].data || []).filter(function (p) { return p.id === c.host_payee_id; })[0];
      var rows = res[0].data || [], rules = res[1].error ? [] : res[1].data || [], sent = res[2].error ? [] : res[2].data || [], payees = res[3].error ? [] : res[3].data || [];
      var gross = rows.reduce(function (n, r) { return n + r.gross_pence; }, 0), fees = rows.reduce(function (n, r) { return n + r.fee_pence; }, 0);
      var fed = rows.filter(function (r) { return r.payee_kind === "federation"; });
      var toSend = rows.filter(function (r) { return r.payee_kind !== "federation"; }).reduce(function (n, r) { return n + r.net_pence; }, 0);
      function sentTo(r) { return sent.filter(function (s) { return s.payee_id === r.payee_id; }).reduce(function (n, s) { return n + s.amount_pence; }, 0); }
      var split = ["merch", "photo"].map(function (cat) {
        var rs = rules.filter(function (r) { return r.category === cat && r.percent > 0; });
        return rs.length ? el("li", null, el("strong", null, CATEGORY_NAMES[cat] + ": "), rs.map(function (r) { return (r.payees ? r.payees.name : "?") + " " + r.percent + "%"; }).join(", ")) : null;
      }).filter(Boolean);
      var own = { full_power: c.fee_full_power_pence, bench_only: c.fee_bench_only_pence, sub_junior: c.fee_sub_junior_pence };
      var fp = function (k, d) { return money(own[k] !== undefined && own[k] !== null ? own[k] : feeDefaults[k] === undefined ? d : feeDefaults[k]); };
      view.replaceChildren(
        el("div", { class: "actions", style: "margin-bottom:var(--space-3)" },
          btn("Set who gets paid", function () { setPayouts(c, rules, hostPayee && franchise ? hostPayee.name : "", function () { renderMoneyTab(view, c); }); }, "btn-primary"),
          rows.length ? btn("Record a payment sent", function () { recordPayout(c, rows, function () { renderMoneyTab(view, c); }); }, "btn-secondary") : null,
          franchise ? btn("Change this competition's amounts", function () { setCompetitionFees(c, own, feeDefaults, function () { renderMoneyTab(view, c); }); }) : null),
        el("h2", null, "How the money is split"),
        franchise ? el("p", null, hostPayee ? "Host: " + hostPayee.name + "." : el("strong", null, "No host set yet: all the entry money stays with the federation until you set one.")) : el("p", null, el("strong", null, "Run by the federation."), " Not a franchise competition: the federation keeps the whole entry fee, so there is no host to pay."),
        franchise ? el("p", null, "From each entry the federation keeps a fixed amount: ", el("strong", null, fp("full_power", 1200) + " for a full power entry, " + fp("bench_only", 750) + " for bench only and " + fp("sub_junior", 450) + " for a sub-junior"),
          " (these are this competition's own amounts, whatever the host charges). Novice, junior, masters and open entries pay the full power amount. The host receives the rest of the entry fee.") : null,
        split.length ? el("ul", null, split) : null,
        el("p", { class: "help" }, "The federation absorbs discounts and free places (the host is still paid on the full entry fee) and all of Stripe's processing fees. So a discounted entry can leave the federation's share lower, or even below nothing."),
        el("h2", null, "Money to send"),
        el("p", { class: "panel-intro" }, "Taken so far: " + money(gross) + ". Stripe fees: " + money(fees) + ". To send to others: " + money(toSend) + ". The federation's share after fees: " + money(fed.reduce(function (n, r) { return n + r.net_pence; }, 0)) + ". Figures update as entries come in."),
        rows.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
          el("thead", null, el("tr", null, ["Who", "Entry money", "Merchandise", "Photos", "Share", "Stripe fees", "To send", "Sent", "Still to send"].map(function (h, i) { return el("th", { scope: "col", class: i ? "num" : null }, h); }))),
          el("tbody", null, rows.map(function (r) {
            var isFed = r.payee_kind === "federation", got = sentTo(r);
            return el("tr", null, el("th", { scope: "row" }, r.payee_name, el("small", null, isFed ? "Federation" : r.payee_kind === "host" ? "Host" : "Photographer")),
              el("td", { class: "num" }, money(r.entry_pence)), el("td", { class: "num" }, money(r.merch_pence)), el("td", { class: "num" }, money(r.photo_pence)), el("td", { class: "num" }, money(r.gross_pence)),
              el("td", { class: "num" }, r.fee_pence ? "−" + money(r.fee_pence) : money(0)), el("td", { class: "num" }, el("strong", null, money(r.net_pence))),
              el("td", { class: "num" }, isFed ? "Keeps" : money(got)), el("td", { class: "num" }, isFed ? "" : el("strong", null, money(Math.max(r.net_pence - got, 0)))));
          }))) ) : el("p", { class: "empty" }, "Nothing to show yet: set who gets paid, and the figures appear once there are entries."),
        sent.length ? el("div", null, el("h2", null, "Payments sent"), el("ul", { class: "history-list" }, sent.map(function (s) {
          return el("li", null, el("strong", null, money(s.amount_pence)), " to " + (s.payees ? s.payees.name : "?") + " · " + s.paid_on + (s.reference ? " · " + s.reference : "") + (s.created_by ? " · " + s.created_by : ""));
        }))) : null);
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e).replace(/^forbidden$/, "You do not have permission to see the money report."))); });
  }

  function setPayouts(c, rules, hostName, done) {
    var franchise = c.is_franchise !== false;
    function pct(cat, kind) { var r = rules.filter(function (x) { return x.category === cat && x.payees && x.payees.kind === kind; })[0]; return r ? r.percent : null; }
    function name(kind) { var r = rules.filter(function (x) { return x.payees && x.payees.kind === kind; })[0]; return r ? r.payees.name : ""; }
    openForm({
      title: "Who gets paid: " + c.name, saveLabel: "Save",
      intro: (franchise ? "The host is paid the entry fee less the federation's fixed amount (shown on the Money tab). " : "This is not a franchise competition, so the federation keeps the whole entry fee. ") + "Merchandise and photo packages are shared by the percentages below. Changing this changes the report straight away, including for entries already taken.",
      values: { host_name: hostName || name("host"), host_merch_percent: pct("merch", "host") === null ? 100 : pct("merch", "host"),
        photographer_name: name("photographer") || "White Lights Media", photographer_percent: pct("photo", "photographer") === null ? 100 : pct("photo", "photographer") },
      fields: (franchise ? [
        { name: "host_name", label: "Host (the gym or venue)", required: true, help: "A name you have used before is found again; a new name adds a new host." },
        { name: "host_merch_percent", label: "Host's share of merchandise (%)", type: "number", min: "0", half: true, help: "The federation keeps the rest." }] : []).concat([
        { name: "photographer_name", label: "Photographer", half: true, help: "Leave blank if there are no photo packages." },
        { name: "photographer_percent", label: "Photographer's share of photo packages (%)", type: "number", min: "0", half: true }
      ]),
      validate: function (v) { return [franchise ? v.host_merch_percent : 0, v.photographer_percent].some(function (x) { return x === null || x < 0 || x > 100; }) ? "Percentages must be between 0 and 100." : null; },
      onSave: function (v) {
        return sb.rpc("save_payout_setup", { c: c.id, p: { host_name: v.host_name, host_merch_percent: v.host_merch_percent, photographer_name: v.photographer_name, photographer_percent: v.photographer_percent } }).then(function (r) {
          if (r.error) { var m = (r.error.message || "").trim(); throw new Error(MONEY_ERRORS[m] || friendly(r.error)); }
          toast("Saved."); done();
        });
      }
    });
  }

  // The fixed amounts the federation keeps from each entry. Each competition has its own copy (so changing them later never
  // rewrites the report for a competition that has already happened); new competitions start with the defaults.
  function feeFields() {
    return [{ name: "full_power", label: "Full power entry (£)", type: "number", min: "0", required: true, half: true }, { name: "bench_only", label: "Bench only entry (£)", type: "number", min: "0", required: true, half: true },
      { name: "sub_junior", label: "Sub-junior entry (£)", type: "number", min: "0", required: true, half: true }];
  }
  function feeValues(o, f) { function pick(k, d) { var v = o && o[k] !== undefined && o[k] !== null ? o[k] : f && f[k] !== undefined ? f[k] : d; return v / 100; } return { full_power: pick("full_power", 1200), bench_only: pick("bench_only", 750), sub_junior: pick("sub_junior", 450) }; }
  function setCompetitionFees(c, own, defaults, done) {
    openForm({
      title: "What the federation keeps: " + c.name, saveLabel: "Save",
      intro: "A fixed amount from each entry in this competition, whatever the host charges. Novice, junior, masters and open entries pay the full power amount. This changes the report for this competition only, including entries already taken.",
      values: feeValues(own, defaults), fields: feeFields(),
      onSave: function (v) {
        return sb.rpc("save_competition_fees", { c: c.id, p: { full_power: Math.round(v.full_power * 100), bench_only: Math.round(v.bench_only * 100), sub_junior: Math.round(v.sub_junior * 100) } }).then(function (r) {
          if (r.error) { var m = (r.error.message || "").trim(); throw new Error(m === "invalid:fees" ? "Enter amounts of zero or more." : m === "forbidden" ? "You do not have permission to change these." : friendly(r.error)); }
          c.fee_full_power_pence = Math.round(v.full_power * 100); c.fee_bench_only_pence = Math.round(v.bench_only * 100); c.fee_sub_junior_pence = Math.round(v.sub_junior * 100);
          toast("Saved."); done();
        });
      }
    });
  }
  function setDefaultFees(defaults, done) {
    openForm({
      title: "What the federation keeps from each entry", saveLabel: "Save",
      intro: "These are the amounts new competitions start with. Competitions that already exist keep the amounts they started with, so their reports do not change. To change one, open its Money tab.",
      values: feeValues(null, defaults), fields: feeFields(),
      onSave: function (v) {
        return Promise.all(["full_power", "bench_only", "sub_junior"].map(function (k) { return sb.from("federation_fees").update({ pence: Math.round(v[k] * 100) }).eq("key", k).then(ok); }))
          .then(function () { toast("Saved. New competitions will start with these amounts."); done(); });
      }
    });
  }
  // A small panel on the Calendar page (entries team and admins) showing the defaults.
  function feesPanel() {
    var box = el("div", { class: "panel", style: "margin-top:var(--space-6)" }, el("h2", { style: "margin-top:0" }, "What the federation keeps from each entry"), el("p", null, "Loading…"));
    function load() { sb.from("federation_fees").select("key,pence").then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; }).then(function (rows) {
      var f = {}; rows.forEach(function (x) { f[x.key] = x.pence; });
      var g = function (k, d) { return money(f[k] === undefined ? d : f[k]); };
      box.replaceChildren(el("h2", { style: "margin-top:0" }, "What the federation keeps from each entry"),
        el("p", null, g("full_power", 1200) + " for a full power entry, " + g("bench_only", 750) + " for bench only, " + g("sub_junior", 450) + " for a sub-junior. Novice, junior, masters and open entries pay the full power amount. The host receives the rest of the entry fee."),
        el("p", { class: "help" }, "These are the amounts new competitions start with. Each competition keeps its own, so changing these never alters a past competition's report. Change one competition's amounts on its Money tab."),
        el("p", null, btn("Change the defaults", function () { setDefaultFees(f, load); }, "btn-secondary")));
    }); }
    load();
    return box;
  }

  function recordPayout(c, rows, done) {
    var others = rows.filter(function (r) { return r.payee_kind !== "federation"; });
    openForm({
      title: "Record a payment sent", saveLabel: "Record it",
      intro: "This only records that you have sent the money (it does not send anything). The report then shows what is still to send.",
      values: { payee_id: others[0] && others[0].payee_id, paid_on: Y.todayLondon() },
      fields: [
        { name: "payee_id", label: "Paid to", type: "select", options: others.map(function (r) { return { value: r.payee_id, label: r.payee_name + " (to send " + money(r.net_pence) + ")" }; }) },
        { name: "amount", label: "Amount sent (£)", type: "number", min: "0", required: true, half: true }, { name: "paid_on", label: "Date sent", type: "date", required: true, half: true },
        { name: "reference", label: "Reference (optional)", help: "For example the bank transfer reference." }
      ],
      validate: function (v) { return v.amount === null || v.amount <= 0 ? "Enter the amount you sent." : null; },
      onSave: function (v) {
        return sb.from("payouts").insert({ competition_id: c.id, payee_id: v.payee_id, amount_pence: Math.round(v.amount * 100), paid_on: v.paid_on, reference: v.reference, created_by: state.user.email || "" }).then(ok)
          .then(function () { toast("Recorded."); done(); });
      }
    });
  }

  // ---- discount codes --------------------------------------------------------------------------
  // Codes for this competition, and codes that work for any competition. A code can be tied to one email address so it
  // cannot be passed around. Made here, never guessable: name, discount, and random letters (SAM-20OFF-K7XQ2M).
  var DISCOUNT_ERRORS = { forbidden: "You do not have permission to make discount codes.", "invalid:kind": "Choose pounds off or percent off.", "invalid:value": "Enter a discount: pounds off, or a percentage from 1 to 100.",
    "invalid:max_uses": "How many times it can be used must be between 1 and 1000.", "invalid:email": "Check the email address." };
  function discountWords(d) { return d.kind === "percent" ? (d.value === 100 ? "Free entry" : d.value === 50 ? "Half price (50% off)" : d.value + "% off") : entryMoney(d.value) + " off"; }
  function copyText(text) {
    var done = function () { toast("Copied: " + text); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast("Select the code and copy it by hand.", "error"); });
    else toast("Select the code and copy it by hand.", "error");
  }

  function renderDiscountsTab(view, c) {
    view.replaceChildren(el("p", null, "Loading…"));
    sb.from("discount_codes").select("*").order("created_at", { ascending: false }).then(ok).then(function (all) {
      var codes = all.filter(function (d) { return d.competition_id === c.id || d.competition_id === null; });
      var ids = codes.map(function (d) { return d.id; });
      return (ids.length ? sb.from("entries").select("id,full_name,email,discount_code_id,status,hold_expires_at,discount_pence,price_pence,paid_at,created_at").in("discount_code_id", ids).order("created_at", { ascending: false }).then(function (r) { return r.error ? [] : r.data || []; }) : Promise.resolve([])).then(function (used) {
        var now = new Date();
        function everUsed(d) { return used.some(function (e) { return e.discount_code_id === d.id; }); }      // any entry at all, even a cancelled one, remembers the code
        function uses(d) { return used.filter(function (e) { return e.discount_code_id === d.id && (e.status === "paid" || e.status === "comped" || (e.status === "held" && new Date(e.hold_expires_at) > now)); }).length; }
        // The trail: every entry that used a code, newest first, so you can see what is being redeemed and by whom.
        function redemptions() {
          var byId = {}; codes.forEach(function (d) { byId[d.id] = d; });
          var rows = used.filter(function (e) { return byId[e.discount_code_id] && !(e.status === "held" && new Date(e.hold_expires_at) <= now); });
          var label = { paid: "Paid", comped: "Free entry", held: "Paying now", cancelled: "Cancelled", refunded: "Refunded" };
          return el("div", null, el("div", { class: "section-head" }, el("h2", null, "Who has used a code")),
            el("p", { class: "panel-intro" }, "Every entry that used a code, newest first. The competitions inbox also gets an email each time a code is used."),
            rows.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
              el("thead", null, el("tr", null, ["When", "Code", "Used by", "Discount", "Entry"].map(function (h) { return el("th", { scope: "col" }, h); }))),
              el("tbody", null, rows.map(function (e) {
                return el("tr", null, el("td", null, new Date(e.paid_at || e.created_at).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" })),
                  el("td", null, el("code", { class: "code-text" }, byId[e.discount_code_id].code)),
                  el("th", { scope: "row" }, e.full_name, el("small", null, e.email)),
                  el("td", null, e.discount_pence ? entryMoney(e.discount_pence) + " off" + (e.price_pence ? ", paid " + entryMoney(e.price_pence) : ", free") : "–"),
                  el("td", null, label[e.status] || e.status));
              })))) : el("div", { class: "empty-state" }, el("p", null, "No code has been used yet.")));
        }
        function state(d) {
          if (!d.active) return ["Switched off", "tag tag-full"];
          if (d.expires_at && new Date(d.expires_at) <= now) return ["Expired", "tag tag-full"];
          if (uses(d) >= d.max_uses) return ["Used up", "tag tag-closed"];
          return ["Live", "tag tag-open"];
        }
        view.replaceChildren(
          el("div", { class: "section-head is-first" }, el("h2", null, "Discount codes"), btn("Make a discount code", function () { makeDiscount(c, function () { renderDiscountsTab(view, c); }); }, "btn-primary")),
          el("p", { class: "panel-intro" }, "Give someone a code and they enter it on the last step of the entry form. A code can take pounds or a percentage off, and one that takes everything off makes the entry free. Tie a code to someone's email address and only they can use it."),
          codes.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
            el("thead", null, el("tr", null, ["Code", "Discount", "Used", "Valid until", "Status", "Actions"].map(function (h) { return el("th", { scope: "col", class: h === "Actions" ? "col-actions" : h === "Valid until" || h === "Used" || h === "Discount" ? "nowrap" : null }, h); }))),
            el("tbody", null, codes.map(function (d) {
              var st = state(d), n = uses(d);
              return el("tr", null,
                el("th", { scope: "row" }, el("code", { class: "code-text" }, d.code),
                  el("small", null, [d.recipient_name, d.recipient_email && "only " + d.recipient_email, d.competition_id === null && "any competition", d.reason, d.points_cost > 0 && d.active && !d.points_spent_at ? "holding " + d.points_cost + " points until used (Delete gives them back)" : d.points_cost > 0 && d.points_spent_at ? d.points_cost + " points spent" : ""].filter(Boolean).join(" · "))),
                el("td", { class: "nowrap" }, discountWords(d)), el("td", { class: "nowrap" }, n + " of " + d.max_uses),
                el("td", { class: "nowrap" }, d.expires_at ? new Date(d.expires_at).toLocaleDateString("en-GB", { timeZone: Y.TZ, dateStyle: "medium" }) : "No end date"),
                el("td", null, el("span", { class: st[1] }, st[0])),
                el("td", { class: "col-actions" }, el("span", { class: "actions" },
                  btn("Copy", function () { copyText(d.code); }),
                  everUsed(d) && !d.active ? null : btn("Delete", function () {
                    var kept = everUsed(d);
                    if (!window.confirm(kept ? "The code " + d.code + " has been used, so it cannot be deleted: its entries keep a record of it. It will be switched off, so nobody can use it again." : "Delete the code " + d.code + "?")) return;
                    (kept ? sb.from("discount_codes").update({ active: false }).eq("id", d.id) : sb.from("discount_codes").delete().eq("id", d.id)).then(ok)
                      .then(function () { toast(kept ? "Switched off." : "Deleted."); renderDiscountsTab(view, c); }).catch(function (er) { toast(friendly(er), "error"); });
                  }, "btn-danger"))));
            })))) : el("div", { class: "empty-state" }, el("p", null, "No discount codes yet.")),
          redemptions(),
          c.entry_method === "yne" ? prioritySection(c) : null);
      });
    }).catch(function (e) { view.replaceChildren(el("p", { class: "form-error" }, friendly(e))); });
  }

  function makeDiscount(c, done) {
    var PRESETS = { custom: null, off20: { kind: "amount", value: 20, reason: "Volunteer points: £20 off" }, off40: { kind: "amount", value: 40, reason: "Volunteer points: £40 off" },
      half: { kind: "percent", value: 50, reason: "Volunteer points: half price" }, free: { kind: "percent", value: 100, reason: "Volunteer points: free entry" } };
    var api = openForm({
      title: "Make a discount code: " + c.name, saveLabel: "Make code",
      intro: "The code is made for you from the name and the discount, plus random letters so it cannot be guessed. Send it to the person yourself.",
      values: { preset: "custom", kind: "amount", value: "", max_uses: 1, scope: "this" },
      fields: [
        { name: "preset", label: "Quick choice", type: "select", options: [{ value: "custom", label: "Something else (fill in below)" }, { value: "off20", label: "£20 off (volunteer)" }, { value: "off40", label: "£40 off (volunteer)" }, { value: "half", label: "Half price (volunteer)" }, { value: "free", label: "Free entry (volunteer)" }] },
        { name: "kind", label: "Type of discount", type: "select", options: [{ value: "amount", label: "Pounds off" }, { value: "percent", label: "Percent off" }], half: true },
        { name: "value", label: "How much (£ or %)", type: "number", min: "0", required: true, half: true, help: "For example 20 for £20 off, or 50 for 50% off." },
        { name: "recipient_name", label: "Who is it for? (optional)", half: true, help: "Used to make the code, for example SAM-20OFF-…" },
        { name: "recipient_email", label: "Their email address (optional)", type: "email", half: true, help: "If set, only this address can use the code." },
        { name: "scope", label: "Works for", type: "select", options: [{ value: "this", label: "This competition only" }, { value: "any", label: "Any competition" }], half: true },
        { name: "max_uses", label: "Number of uses", type: "number", min: "1", half: true },
        { name: "expires", label: "Last day it works (optional)", type: "date", help: "Leave blank for no end date." },
        { name: "reason", label: "Reason (kept privately)", help: "For example the volunteer points it was exchanged for." }
      ],
      validate: function (v) {
        if (v.value === null || v.value <= 0) return "Enter how much the discount is.";
        if (v.kind === "percent" && v.value > 100) return "A percentage cannot be more than 100.";
        return null;
      },
      onSave: function (v) {
        var p = { kind: v.kind, value: v.kind === "amount" ? Math.round(v.value * 100) : Math.round(v.value), max_uses: v.max_uses || 1, recipient_name: v.recipient_name, recipient_email: v.recipient_email,
          reason: v.reason, expires_at: v.expires ? Y.fromLondonInput(v.expires + "T23:59") : null };
        return sb.rpc("create_discount_code", { c: v.scope === "any" ? null : c.id, p: p }).then(function (r) {
          if (r.error) { var m = (r.error.message || "").trim(); throw new Error(DISCOUNT_ERRORS[m] || friendly(r.error)); }
          setTimeout(function () { showNewCode(r.data && r.data.code, v); done(); }, 80);
        });
      }
    });
    api.input("preset").addEventListener("change", function () {
      var pr = PRESETS[api.get("preset")]; if (!pr) return;
      api.set("kind", pr.kind); api.set("value", pr.value); api.set("reason", pr.reason);
    });
  }
  function showNewCode(code, v) {
    openForm({
      title: "Your code", saveLabel: "Done", values: { code: code },
      intro: "Send this to " + (v.recipient_name || "the person") + ". " + (v.recipient_email ? "Only " + v.recipient_email + " can use it. " : "") + "It is also listed on the Discounts tab.",
      fields: [{ name: "code", label: "Discount code", help: "Select it and copy, or use Copy on the list." }],
      onSave: function () { return Promise.resolve(); }
    });
    var f = document.getElementById("f-code"); if (f) { f.readOnly = true; f.select(); }
  }

  // Add someone by hand: a free place, or someone who paid another way. The database applies the same checks on the person
  // and the class as the entry form, but not the opening times (this is the entries team's decision).
  var MANUAL_ERRORS = {
    forbidden: "You do not have permission to add entries.", already_entered: "That email address is already entered in this competition.", "invalid:full_name": "Enter their full name.",
    "invalid:email": "Check the email address.", "invalid:date_of_birth": "Check the date of birth.", "invalid:too_young": "Lifters must be at least 14 in the year of the competition.",
    "invalid:sex": "Choose men's or women's.", "invalid:event": "Choose an event.", "invalid:equipment": "Choose the equipment.", "invalid:price": "Enter how much they paid.",
    "invalid:weight_class": "That weight class does not match the category (or the age, for the sub-junior classes).", "invalid:division": "Choose their federation or division.",
    "invalid:guardian": "Lifters under 18 need a parent or guardian's name, phone and email."
  };
  function addEntry(c, refs, reload) {
    var classOptions = refs.classes.map(function (w) { return { value: w.id, label: (w.sex === "M" ? "Men's " : "Women's ") + w.label + " kg" }; });
    openForm({
      title: "Add an entry: " + c.name, saveLabel: "Add entry",
      intro: "For someone who has been given a free place, or who paid another way (cash, bank transfer or a payment link). The same checks apply as on the entry form, but not the opening times or the guest delay. No email is sent.",
      values: { mode: "comped", sex: "M", event: "full_power", equipment: "classic", photo: "no", division_id: refs.divisions[0] && refs.divisions[0].id, weight_class_id: classOptions[0] && classOptions[0].value },
      fields: [
        { name: "mode", label: "How is this entry paid?", type: "select", options: [{ value: "comped", label: "Free place (comped)" }, { value: "paid_elsewhere", label: "Paid another way" }] },
        { name: "price", label: "Amount paid (£), if paid another way", type: "number", min: "0", half: true },
        { name: "note", label: "Note", required: true, half: true, help: "How they paid, or why the place is free. Kept privately." },
        { name: "full_name", label: "Full name", required: true, half: true }, { name: "email", label: "Email address", type: "email", required: true, half: true },
        { name: "date_of_birth", label: "Date of birth", type: "date", required: true, half: true }, { name: "sex", label: "Category", type: "select", options: [{ value: "M", label: "Men's" }, { value: "F", label: "Women's" }], half: true },
        { name: "weight_class_id", label: "Weight class", type: "select", options: classOptions, half: true }, { name: "division_id", label: "Federation or division", type: "select", options: refs.divisions.map(function (d) { return { value: d.id, label: d.name }; }), half: true },
        { name: "event", label: "Event", type: "select", options: [{ value: "full_power", label: "Full power" }, { value: "bench_only", label: "Bench only" }], half: true },
        { name: "equipment", label: "Equipment", type: "select", options: [{ value: "classic", label: "Classic" }, { value: "equipped", label: "Equipped" }], half: true },
        { name: "club", label: refs.clubLabel + " (optional)", type: "select", options: [{ value: "", label: "No " + refs.clubLabel.toLowerCase() }].concat(refs.clubs.map(function (x) { return { value: x.name, label: x.name }; })), half: true },
        { name: "bp_number", label: "Membership number", half: true }, { name: "instagram", label: "Instagram handle (no @)", half: true },
        { name: "photo", label: "Photos and videos", type: "select", options: [{ value: "yes", label: "Consents to promotional use" }, { value: "no", label: "Does not consent" }, { value: "never", label: "Do not photograph or film" }], half: true },
        { name: "guardian_name", label: "Parent or guardian name (if under 18)", half: true }, { name: "guardian_phone", label: "Their phone", half: true }, { name: "guardian_email", label: "Their email", type: "email" }
      ],
      validate: function (v) {
        if (v.mode === "paid_elsewhere" && (v.price === null || v.price < 0)) return "Enter how much they paid.";
        var w = refs.classes.filter(function (x) { return x.id === v.weight_class_id; })[0];
        if (w && w.sex !== v.sex) return "That weight class is for " + (w.sex === "M" ? "men" : "women") + ". Change the category or the class.";
        return null;
      },
      onSave: function (v) {
        var p = { mode: v.mode, price_pence: v.mode === "paid_elsewhere" ? Math.round(v.price * 100) : 0, note: v.note, full_name: v.full_name, email: v.email, date_of_birth: v.date_of_birth, sex: v.sex,
          weight_class_id: v.weight_class_id, division_id: v.division_id, event: v.event, equipment: v.equipment, club: v.club, bp_number: v.bp_number, instagram: String(v.instagram || "").replace(/^@/, ""),
          photo_ok: v.photo === "yes", photo_opt_out: v.photo === "never", guardian_name: v.guardian_name, guardian_phone: v.guardian_phone, guardian_email: v.guardian_email };
        return sb.rpc("add_manual_entry", { c: c.id, p: p }).then(function (r) {
          if (r.error) { var m = (r.error.message || "").trim(); throw new Error(MANUAL_ERRORS[m] || friendly(r.error)); }
          toast(r.data && r.data.over_capacity ? "Entry added. Note: this is more than the number of places." : "Entry added.", r.data && r.data.over_capacity ? "error" : undefined); reload();
        });
      }
    });
  }

  // Cancel an entry and/or refund through Stripe. The entry-refund function checks the caller is on the entries team,
  // moves the money, records who did it and why, frees the place, and emails the lifter.
  function cancelOrRefund(e, c, reload, opts) {
    opts = opts || {};
    var pays = (e.payments || []).filter(function (p) { return p.status === "succeeded"; }), pay = pays[0];
    var paid = pay ? pay.amount_pence : 0, refunded = pay ? (pay.refunds || []).reduce(function (n, r) { return n + r.amount_pence; }, 0) : 0, left = Math.max(paid - refunded, 0);
    var canRefund = e.status === "paid" && left > 0;
    var options = canRefund ? [
      { value: "full", label: "Cancel the entry and refund " + entryMoney(left) + " in full" },
      { value: "partcancel", label: "Cancel the entry and refund part of it" },
      { value: "part", label: "Keep the entry and refund part of it" },
      { value: "cancel", label: "Cancel the entry with no refund" }] : [{ value: "cancel", label: "Cancel the entry" + (e.status === "held" ? " (they have not paid)" : e.status === "comped" ? " (it is free)" : "") }];
    var closed = c.entry_closes && new Date(c.entry_closes) <= new Date();
    openForm({
      title: "Cancel or refund: " + e.full_name, saveLabel: "Confirm",
      intro: (paid ? "Paid " + entryMoney(paid) + (refunded ? ", already refunded " + entryMoney(refunded) : "") + ". " : "") + (canRefund ? "Stripe keeps its processing fee on a refund, so the federation bears that cost. " : "") +
        (closed ? "Entries have closed, so refunds are not normally given now. Use this only for unforeseen circumstances. " : "") + "The lifter is emailed unless you untick the box. This cannot be undone.",
      values: { action: (closed && !opts.keepRefund) ? (options.filter(function (o) { return o.value === "cancel"; })[0] || options[0]).value : options[0].value, amount: "", reason: opts.reason || "", notify: true },
      fields: [
        { name: "action", label: "What would you like to do?", type: "select", options: options },
        canRefund ? { name: "amount", label: "Amount to refund, for the part options (£)", type: "number", min: "0", help: "Up to " + entryMoney(left) + ". Leave blank for the full amount." } : null,
        { name: "reason", label: "Reason", type: "textarea", rows: 3, required: true, help: "Kept in the history, and included in the email to the lifter." },
        { name: "notify", label: "Email the lifter", type: "checkbox" }
      ].filter(Boolean),
      validate: function (v) {
        if ((v.action === "part" || v.action === "partcancel")) {
          if (v.amount === null || v.amount <= 0) return "Enter how much to refund.";
          if (Math.round(v.amount * 100) > left) return "That is more than the " + entryMoney(left) + " left to refund.";
        }
        return null;
      },
      onSave: function (v) {
        var pence = v.action === "full" ? left : (v.action === "part" || v.action === "partcancel") ? Math.round(v.amount * 100) : 0;
        return sb.auth.getSession().then(function (s) {
          var token = s && s.data && s.data.session && s.data.session.access_token;
          return fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/entry-refund", {
            method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "", Authorization: "Bearer " + (token || "") },
            body: JSON.stringify({ entry_id: e.id, refund_pence: pence, cancel: v.action !== "part", reason: v.reason, notify: !!v.notify })
          });
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.message || "That did not work. Please try again."); return b; }); })
          .then(function (b) { toast(b.refunded_pence ? entryMoney(b.refunded_pence) + " refunded." : "Entry cancelled."); return opts.onDone ? Promise.resolve(opts.onDone(b)).catch(function (er) { toast(friendly(er), "error"); }) : null; }).then(function () { reload(); });
      }
    });
  }

  // Everything the lifter asked for or changed themselves on this entry, newest first: kept as a record.
  function showRequestHistory(body, e) {
    sb.from("entry_requests").select("*").eq("entry_id", e.id).order("created_at", { ascending: false }).then(function (r) {
      var list = (r && !r.error && r.data) || []; if (!list.length) return;
      var STATE = { pending: "Waiting", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn by the lifter", applied: "Changed by the lifter" };
      body.appendChild(el("div", { class: "entry-history" }, el("h3", null, "Requests and changes made by the lifter"), el("ul", { class: "history-list" }, list.map(function (q) {
        var what = Object.keys(q.after || {}).map(function (k) { return k + ": " + (q.before && q.before[k] ? q.before[k] + " to " + q.after[k] : q.after[k]); }).join("; ");
        return el("li", null, el("strong", null, (q.kind === "cancel" ? "Cancellation" : q.kind === "update" ? "Details" : "Change") + " · " + (STATE[q.status] || q.status)), " · " + new Date(q.created_at).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" }) + (what ? " · " + what : "") + (q.note ? " · “" + q.note + "”" : "") + (q.decline_reason ? " · Reason: " + q.decline_reason : "") + (q.decided_by && q.status !== "pending" && q.status !== "applied" ? " · by " + q.decided_by : ""));
      }))));
    });
  }

  // The changes made to one entry, from the audit log.
  var HISTORY_SKIP = { id: 1, created_at: 1, hold_expires_at: 1 };
  function showHistory(body, e) {
    var box = el("div", { class: "entry-history" }, el("h3", null, "History"), el("p", null, "Loading…"));
    body.appendChild(box);
    sb.from("audit_log").select("*").eq("table_name", "entries").eq("row_id", e.id).order("at", { ascending: false }).limit(30).then(ok).then(function (rows) {
      box.replaceChildren(el("h3", null, "History"), rows.length ? el("ul", { class: "history-list" }, rows.map(function (r) {
        var what = r.action === "insert" ? "Entry created" : r.action === "delete" ? "Entry deleted" : (function () {
          var b = r.before || {}, a = r.after || {}, ch = Object.keys(a).filter(function (k) { return !HISTORY_SKIP[k] && JSON.stringify(a[k]) !== JSON.stringify(b[k]); });
          return ch.length ? "Changed " + ch.map(function (k) { return k.replace(/_/g, " ") + " (" + (b[k] === null || b[k] === "" ? "empty" : b[k]) + " → " + (a[k] === null || a[k] === "" ? "empty" : a[k]) + ")"; }).join(", ") : "Updated";
        })();
        return el("li", null, el("strong", null, when(r.at)), " · " + (r.actor_email || "system") + " · " + what);
      })) : el("p", { class: "empty" }, "No history recorded."));
    }).catch(function (er) { box.replaceChildren(el("h3", null, "History"), el("p", { class: "form-error" }, friendly(er))); });
  }

  // Edit any detail of an entry. The database logs who changed what.
  function editEntry(e, c, refs, done) {
    var priv = one(e.entry_private);
    var classOptions = refs.classes.map(function (w) { return { value: w.id, label: (w.sex === "M" ? "Men's " : "Women's ") + w.label + " kg" }; });
    var clubs = refs.clubs.map(function (x) { return x.name; });
    if (e.club && clubs.indexOf(e.club) < 0) clubs.unshift(e.club);
    var fields = [
      { name: "full_name", label: "Full name", required: true },
      { name: "display_name", label: "Name on public lists (optional)", help: "Leave blank to use the full name." },
      { name: "email", label: "Email address", type: "email", required: true, half: true },
      { name: "date_of_birth", label: "Date of birth", type: "date", required: true, half: true },
      { name: "sex", label: "Category", type: "select", options: [{ value: "M", label: "Men's" }, { value: "F", label: "Women's" }], half: true },
      { name: "weight_class_id", label: "Weight class", type: "select", options: classOptions, half: true },
      { name: "event", label: "Event", type: "select", options: [{ value: "full_power", label: "Full power" }, { value: "bench_only", label: "Bench only" }], half: true },
      { name: "equipment", label: "Equipment", type: "select", options: [{ value: "classic", label: "Classic" }, { value: "equipped", label: "Equipped" }], half: true },
      { name: "division_id", label: "Federation or division", type: "select", options: refs.divisions.map(function (d) { return { value: d.id, label: d.name }; }), half: true },
      { name: "club", label: refs.clubLabel, type: "select", options: [{ value: "", label: "No " + refs.clubLabel.toLowerCase() }].concat(clubs.map(function (n) { return { value: n, label: n }; })), half: true },
      { name: "bp_number", label: "Membership number", half: true },
      { name: "instagram", label: "Instagram handle (no @)", half: true },
      { name: "openipf_url", label: "OpenIPF link", type: "url" },
      { name: "photo", label: "Photos and videos", type: "select", options: [{ value: "yes", label: "Consents to promotional use" }, { value: "no", label: "Does not consent" }, { value: "never", label: "Do not photograph or film" }] },
      { name: "membership_checked", label: "Membership number checked", type: "checkbox", half: true },
      { name: "can_break_records", label: "Can break records", type: "checkbox", half: true },
      { name: "entry_note", label: "Private note (entries team only)", type: "textarea", rows: 3 }
    ];
    if (priv && priv.guardian_name !== undefined && (priv.guardian_name || priv.guardian_phone || priv.guardian_email)) {
      fields.push({ name: "guardian_name", label: "Parent or guardian name", half: true }, { name: "guardian_phone", label: "Their phone", half: true }, { name: "guardian_email", label: "Their email", type: "email" });
    }
    openForm({
      title: "Edit entry: " + e.full_name, saveLabel: "Save changes",
      values: Object.assign({}, e, { photo: e.photo_opt_out ? "never" : e.photo_ok ? "yes" : "no", guardian_name: priv && priv.guardian_name, guardian_phone: priv && priv.guardian_phone, guardian_email: priv && priv.guardian_email, display_name: e.display_name || "" }),
      fields: fields,
      validate: function (v) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return "Enter a valid email address.";
        var w = refs.classes.filter(function (x) { return x.id === v.weight_class_id; })[0];
        if (w && w.sex !== v.sex) return "That weight class is for " + (w.sex === "M" ? "men" : "women") + ". Change the category or the class.";
        if (v.openipf_url && !/^https:\/\//i.test(v.openipf_url)) return "The OpenIPF link must start with https://";
        return null;
      },
      onSave: function (v) {
        var row = { full_name: v.full_name, display_name: v.display_name, email: v.email.toLowerCase(), date_of_birth: v.date_of_birth, sex: v.sex, weight_class_id: v.weight_class_id,
          event: v.event, equipment: v.equipment, division_id: v.division_id || null, club: v.club, bp_number: v.bp_number, instagram: String(v.instagram || "").replace(/^@/, ""), openipf_url: v.openipf_url,
          photo_ok: v.photo === "yes", photo_opt_out: v.photo === "never", membership_checked: !!v.membership_checked, can_break_records: !!v.can_break_records, entry_note: v.entry_note };
        var chain = sb.from("entries").update(row).eq("id", e.id).then(ok);
        if (v.guardian_name !== undefined) chain = chain.then(function () { return sb.from("entry_private").update({ guardian_name: v.guardian_name, guardian_phone: v.guardian_phone, guardian_email: v.guardian_email }).eq("entry_id", e.id).then(ok); });
        return chain.then(function () { toast("Entry saved."); done(); });
      }
    });
  }

  function csvCell(v) { v = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
  function downloadEntries(c) {
    sb.from("entries").select("*, weight_classes(label), divisions(name)").eq("competition_id", c.id).in("status", ["paid", "comped"]).order("created_at").then(ok).then(function (rows) {
      var head = ["Name", "Email", "BP number", "Sex", "Age category", "Weight class", "Event", "Equipment", "Division", "Guest", "Club", "Instagram", "Paid (GBP)", "Paid at"];
      var lines = [head.map(csvCell).join(",")].concat(rows.map(function (e) {
        return [e.full_name, e.email, e.bp_number, e.sex, CAT_LABEL[catFor(e.date_of_birth, c.start_date)], e.weight_classes && e.weight_classes.label, e.event, e.equipment, e.divisions && e.divisions.name, e.is_guest ? "Yes" : "No", e.club, e.instagram, (e.price_pence / 100).toFixed(2), e.paid_at].map(csvCell).join(",");
      }));
      var a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" })), download: (c.slug || "entries") + "-entries.csv" });
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { toast(friendly(e), "error"); });
  }

  // ---- Priority entry: a list of people per competition, emailed their personal link automatically ----------------
  // Paste the list once, any time before entry opens. When the priority window opens, the site makes each person's single-use
  // link and emails it (the waitlist function's timer does this). "Send now" and "Send again" do it by hand for one person.
  function parsePeople(text) {
    var out = [], bad = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var m = line.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/);
      if (!m) { bad.push(line); return; }
      var name = line.replace(m[0], "").replace(/[<>",;\t]+/g, " ").replace(/\s+/g, " ").trim();
      out.push({ email: m[0], name: name });
    });
    return { people: out, bad: bad };
  }
  function addPriority(c, done) {
    openForm({
      title: "Add people to the priority list", saveLabel: "Add to the list",
      intro: "Their links are emailed to them automatically when priority entry opens. You can add people at any time before then, and again later.",
      fields: [{ name: "people", label: "People, one per line", type: "textarea", rows: 10, required: true, help: "Email addresses. A name can come before the address, for example Sam Smith, sam@example.com. Pasting two columns from a spreadsheet works too." },
        { name: "from_points", label: "Costs 1 volunteer point", type: "checkbox", help: "Tick this to give these people a priority link that costs 1 of their volunteer points, taken only once their entry is confirmed. Leave it unticked for a free link (a guest, a sponsor, a test). Everyone with points is added with a points link automatically when the priority window opens." }],
      onSave: function (v) {
        var r = parsePeople(v.people);
        if (v.from_points) r.people = r.people.map(function (x) { return Object.assign({}, x, { from_points: true }); });
        if (r.bad.length) return Promise.reject(new Error("There is no email address on this line: " + r.bad[0]));
        if (!r.people.length) return Promise.reject(new Error("Add at least one email address."));
        return sb.rpc("priority_add", { c: c.id, people: r.people }).then(function (res) {
          if (res.error) { var m = (res.error.message || "").trim(); throw new Error(/^invalid:email/.test(m) ? "That does not look like an email address: " + m.replace(/^invalid:email:/, "") : friendly(res.error)); }
          toast(res.data + (res.data === 1 ? " person" : " people") + " added."); done();
        });
      }
    });
  }
  function sendPriority(c, inviteId, done) {
    return sb.auth.getSession().then(function (s) {
      var token = s.data && s.data.session && s.data.session.access_token;
      return fetch((window.YNEPF_CONFIG.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/waitlist", { method: "POST", headers: { "Content-Type": "application/json", apikey: window.YNEPF_CONFIG.supabaseAnonKey || "", Authorization: "Bearer " + token }, body: JSON.stringify({ action: "priority_send", competition_id: c.id, invite_id: inviteId || undefined }) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error === "not_allowed" ? "You do not have permission to do that." : "The email function did not answer. Check that the waitlist function has been updated in Supabase."); return b; }); })
      .then(function (b) { toast(b.sent ? "Sent " + b.sent + (b.sent === 1 ? " link." : " links.") + (b.failed ? " " + b.failed + " could not be sent." : "") : (b.failed ? b.failed + " could not be sent." : "Nothing to send.")); done(); })
      .catch(function (e) { toast(friendly(e), "error"); });
  }
  function prioritySection(c) {
    var box = el("div");
    function load() {
      box.replaceChildren(el("h2", null, "Priority entry"), el("p", null, "Loading…"));
      Promise.all([
        sb.from("invites").select("id,email,full_name,used_at,sent_at,from_points,entries(full_name,status)").eq("competition_id", c.id).order("email").then(ok),
        sb.from("entry_settings").select("priority_hours").eq("competition_id", c.id).maybeSingle().then(function (r) { return r.error ? null : r.data; }, function () { return null; })
      ]).then(function (res) {
        var rows = res[0], hours = (res[1] && res[1].priority_hours) || 24, next = function () { load(); };
        var start = c.entry_opens ? new Date(new Date(c.entry_opens).getTime() - hours * 3600 * 1000) : null;
        var waiting = rows.filter(function (r) { return !r.used_at && !r.sent_at; });
        function stamp(d) { return new Date(d).toLocaleString("en-GB", { timeZone: Y.TZ, dateStyle: "medium", timeStyle: "short" }); }
        box.replaceChildren(el("div", { class: "section-head" }, el("h2", null, "Priority entry"), btn("Add people", function () { addPriority(c, next); }, "btn-primary")),
          el("p", { class: "panel-intro" }, start
            ? "Everyone on this list is emailed their personal link automatically on " + stamp(start) + ", " + hours + " hours before general entry opens. They can enter from then. Volunteers with points are added automatically at that moment, and the point is only taken once their entry is confirmed."
            : "Set when entry opens on the Details tab first. Links are emailed automatically " + hours + " hours before it."),
          el("div", { class: "actions", style: "margin-bottom:var(--space-3)" },
            waiting.length ? btn("Send to everyone waiting now", function () { if (!window.confirm("Email the link now to the " + waiting.length + (waiting.length === 1 ? " person" : " people") + " still waiting?")) return; sendPriority(c, null, next); }, "btn-secondary") : null),
          rows.length ? el("div", { class: "table-scroll" }, el("table", { class: "admin-table" },
            el("thead", null, el("tr", null, ["Name", "Email", "Link sent", "Used", "Status", "Actions"].map(function (h) { return el("th", { scope: "col", class: h === "Actions" ? "col-actions" : null }, h); }))),
            el("tbody", null, rows.map(function (r) {
              var st = r.used_at ? ["Entered with their link", "tag tag-open"] : r.sent_at ? ["Link sent", "tag tag-position"] : [start && start <= new Date() ? "Sending shortly" : "Will be sent automatically", "tag tag-closed"];
              var en = Array.isArray(r.entries) ? r.entries[0] : r.entries;
              return el("tr", null, el("th", { scope: "row" }, r.full_name || "—", r.from_points ? el("small", null, "Volunteer points (1 point when they enter)") : null), el("td", null, r.email), el("td", { class: "nowrap" }, r.sent_at ? stamp(r.sent_at) : "Not yet"),
                el("td", { class: r.used_at ? null : "nowrap" }, r.used_at ? stamp(r.used_at) + (en ? " as " + en.full_name : "") : "Not yet"), el("td", null, el("span", { class: st[1] }, st[0])),
                el("td", { class: "col-actions" }, r.used_at ? "" : el("span", { class: "actions" },
                  btn(r.sent_at ? "Send again" : "Send now", function () { sendPriority(c, r.id, next); }),
                  btn("Remove", function () { if (!window.confirm("Remove " + (r.full_name || r.email) + " from the list?" + (r.sent_at ? " Their link will stop working." : ""))) return; sb.from("invites").delete().eq("id", r.id).then(ok).then(next).catch(function (e) { toast(friendly(e), "error"); }); }, "btn-danger"))));
            })))) : el("div", { class: "empty-state" }, el("p", null, "Nobody on the priority list yet.")));
      }).catch(function (e) { box.replaceChildren(el("h2", null, "Priority entry"), el("p", { class: "form-error" }, friendly(e))); });
    }
    load();
    return box;
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
    iSub: function (l) { return l.url === "privacy" ? "Our own page, written in the page editor" : l.url === "#" ? "# (placeholder: add the real address)" : l.url; },
    // The privacy policy link is a page of our own: its address is fixed, it cannot be deleted, and the page is edited in the page editor.
    isFixed: function (l) { return !!l && l.url === "privacy"; },
    fixedAction: { label: "Edit the privacy policy page", hash: "#privacy" },
    normalise: function (v) { v.url = v.url.trim(); v.label = v.label.trim(); return v; },
    validate: function (v) { return footerUrlOk(v.url) ? null : "The address must start with https://, or be a page on this site (like faqs.html), or be # for now."; }
  };

  // ---- the privacy policy page: a rich text editor, kept in site_settings under page.privacy ----------------------
  function renderPrivacy(panel) {
    panel.replaceChildren(el("p", null, el("a", { href: "#footer" }, "← Back to the footer")), panelHead("Privacy policy"), el("p", null, "Loading…"));
    sb.from("site_settings").select("value").eq("key", "page.privacy").maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      var v = {}; try { v = JSON.parse((r.data && r.data.value) || "{}") || {}; } catch (e) { v = {}; }
      var editors = []; editors.pending = [];
      var dateC = makeControl({ name: "updated", label: "Last updated", type: "date", required: true, help: "Shown at the top of the page. Change it when you change what the policy says." }, v.updated || Y.todayLondon(), editors);
      var bodyC = makeControl({ name: "body_md", label: "Policy text", type: "md", height: "620px", help: "Use the toolbar for headings, bold, lists and links. This is what the page shows." }, v.body_md || "", editors);
      var errBox = el("p", { class: "form-error", role: "alert", hidden: true });
      var saveBtn = el("button", { class: "btn btn-primary", type: "submit" }, "Save changes");
      var form = el("form", { novalidate: true }, dateC.wrap, bodyC.wrap, errBox,
        el("div", { class: "actions", style: "margin-top:var(--space-4)" }, saveBtn,
          el("a", { class: "btn btn-secondary", href: "#footer" }, "Cancel"),
          el("a", { class: "btn btn-ghost", href: "../privacy", target: "_blank", rel: "noopener" }, "View the page ", el("span", { class: "visually-hidden" }, "(opens in a new tab)"))));
      form.addEventListener("submit", function (e) {
        e.preventDefault(); errBox.hidden = true;
        var d = dateC.get(), md = bodyC.get();
        if (!d) { errBox.textContent = "Add the date it was last updated."; errBox.hidden = false; return; }
        if (!String(md || "").trim()) { errBox.textContent = "The policy text cannot be empty."; errBox.hidden = false; return; }
        saveBtn.disabled = true;
        sb.from("site_settings").upsert({ key: "page.privacy", value: JSON.stringify({ body_md: md, updated: d }) }).then(function (res) {
          if (res.error) throw res.error;
          toast("Privacy policy saved. The page is updated.");
        }).catch(function (er) { errBox.textContent = friendly(er); errBox.hidden = false; }).then(function () { saveBtn.disabled = false; });
      });
      panel.lastChild.remove();
      panel.appendChild(el("p", { class: "panel-intro" }, "This is the text on the Privacy policy page, linked from the footer. Saving updates the page straight away."));
      panel.appendChild(form);
      window.setTimeout(function () { editors.pending.forEach(function (fn) { fn(); }); }, 0);
    }).catch(function (e) { panel.lastChild.textContent = friendly(e); });
  }

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
              cfg.isFixed && cfg.isFixed(it) ? btn("Edit page", function () { go(cfg.fixedAction.hash); }) : null,
              btn("Edit", function () { editItem(it, g, groups); }),
              cfg.isFixed && cfg.isFixed(it) ? null : btn("Delete", function () { removeItem(it); }, "btn-danger"))));
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
      var fixed = !!(cfg.isFixed && cfg.isFixed(it));
      var fields = fixed ? cfg.iFields.filter(function (f) { return f.name === "label"; }) : cfg.iFields.slice();
      if (!fixed) fields.unshift({
        name: cfg.fk, label: cap, type: "select",
        options: groups.map(function (g) { return { value: g.id, label: g.title }; })
      });
      var values = Object.assign({}, it || {});
      values[cfg.fk] = it ? it[cfg.fk] : group.id;
      openForm({
        title: isNew ? "Add " + cfg.iWord : "Edit " + cfg.iWord,
        values: values, fields: fields,
        saveLabel: isNew ? "Add " + cfg.iWord : "Save changes",
        extra: fixed ? [{ label: cfg.fixedAction.label, onclick: function () { go(cfg.fixedAction.hash); } }] : null,
        intro: fixed ? "This link goes to our own privacy policy page, so its address is fixed. You can change the link text. To change what the page says, use the page editor." : null,
        validate: function (v) { return fixed ? null : cfg.validate(cfg.normalise(Object.assign({}, v))); },
        onSave: function (v) {
          if (fixed) return sb.from(cfg.iTable).update({ label: String(v.label || "").trim() }).eq("id", it.id).then(ok).then(function () { toast("Saved."); route(); });
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
          el("strong", null, "Competitions team"), " run entries and volunteers: settings, entries, refunds, reports and the volunteer rota. ",
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
  var ROLE_NAMES = { admin: "Admin", entries: "Competitions team", editor: "Editor", contributor: "Contributor" };
  var ROLE_OPTIONS = [
    { value: "editor", label: "Editor: can edit the website" },
    { value: "entries", label: "Competitions team: runs entries, volunteers, refunds and reports" },
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
        [btn("Edit", function () { editHomeHero(hero); }, "btn-secondary"), resetBtn("hero", "wording")]));

      // ---- hero photos
      panel.appendChild(heroPhotosCard(both[1]));

      // ---- upcoming events, resources, cards, news, call to action
      var ev = cur("events");
      panel.appendChild(homeCard("Upcoming events",
        [homeLine("Heading", ev.heading), homeLine("Button", ev.buttonLabel), el("p", { class: "help" }, "The events themselves come from the Calendar tab.")],
        [btn("Edit", function () { editHomeSimple("events", "Upcoming events", ev, [{ name: "heading", label: "Heading", required: true }, { name: "buttonLabel", label: "Button text", required: true }]); }, "btn-secondary"), resetBtn("events", "wording")]));
      panel.appendChild(homeListCard("resources", "Resources", cur("resources"), custom("resources")));
      panel.appendChild(homeListCard("cards", "Find your place", cur("cards"), custom("cards")));
      var nw = cur("news");
      panel.appendChild(homeCard("Latest news",
        [homeLine("Heading", nw.heading), homeLine("Button", nw.buttonLabel), el("p", { class: "help" }, "The posts themselves come from the News tab.")],
        [btn("Edit", function () { editHomeSimple("news", "Latest news", nw, [{ name: "heading", label: "Heading", required: true }, { name: "buttonLabel", label: "Button text", required: true }]); }, "btn-secondary"), resetBtn("news", "wording")]));
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
    privacy: renderPrivacy,
    points: renderPoints,
    account: renderAccount
  };

  // Which roles see which tab. contributor: news only. entries: the entries desk. editor: site content.
  var TAB_ROLES = {
    competitions: ["admin", "editor", "entries"], news: ["admin", "editor", "contributor"], home: ["admin", "editor"],
    organisation: ["admin", "editor"], records: ["admin", "editor"], faqs: ["admin", "editor"], footer: ["admin", "editor"], privacy: ["admin", "editor"], points: ["admin", "entries"], users: ["admin"],
    account: ["admin", "entries", "editor", "contributor"]
  };
  function canSee(tab) { return (TAB_ROLES[tab] || []).indexOf(state.role) >= 0; }
  // On a phone a wide table would scroll sideways and hide its buttons. Every editor table is given labels on its cells here, so the stylesheet
  // can show each row as a small card (name on top, the figures labelled, the buttons underneath). Done as tables appear, because tabs fill in after loading.
  function cardify(table) {
    if (table.classList.contains("lab-table")) return;
    table.classList.add("table-cards"); table.setAttribute("role", "table");
    var heads = Array.prototype.map.call(table.querySelectorAll(":scope > thead th"), function (h) { return (h.textContent || "").trim(); });
    Array.prototype.forEach.call(table.querySelectorAll("tr"), function (tr) {
      if (tr.closest("table") !== table || tr.getAttribute("role")) return;                  // a table inside this one is done on its own; rows come and go as lists are searched or opened
      tr.setAttribute("role", "row");
      Array.prototype.forEach.call(tr.children, function (cell, i) {
        var inHead = !!cell.closest("thead"), colspan = cell.getAttribute("colspan");
        cell.setAttribute("role", inHead ? "columnheader" : cell.tagName === "TH" ? "rowheader" : "cell");
        if (inHead || colspan || cell.tagName === "TH") return;
        var label = heads[i] || "";
        if (!label || label === "Actions") cell.classList.add("col-actions");
        else { cell.setAttribute("data-label", label); if (cell.querySelector("small") || (cell.textContent || "").trim().length > 18 || /@/.test(cell.textContent || "")) cell.classList.add("wide"); }          // long cells get the label above them, full width
      });
    });
  }
  function cardifyAll(root) { Array.prototype.forEach.call((root || document).querySelectorAll("table.admin-table"), cardify); }
  var cardsPending = false;
  new MutationObserver(function () { if (cardsPending) return; cardsPending = true; requestAnimationFrame(function () { cardsPending = false; cardifyAll($("panel")); }); }).observe(document.getElementById("panel") || document.body, { childList: true, subtree: true });

  function route() {
    var parts = (location.hash || "").replace("#", "").split("/");
    var tab = parts[0];
    if (!TABS[tab] || !canSee(tab)) { tab = state.role === "contributor" ? "news" : "competitions"; parts = [tab]; }
    var acct = $("account-link"); if (acct) { if (tab === "account") acct.setAttribute("aria-current", "page"); else acct.removeAttribute("aria-current"); }
    Array.prototype.forEach.call(document.querySelectorAll(".admin-tabs a"), function (a) {
      if (a.getAttribute("data-tab") === (tab === "privacy" ? "footer" : tab)) a.setAttribute("aria-current", "page");
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
