// Evaluated inside the page by run.mjs (Runtime.evaluate, awaitPromise). __APK_B64__ is
// replaced with the APK under test. Resolves to a JSON string of observed page state.
(async () => {
  const r = {};
  const until = async (f, ms = 180000) => {
    const t0 = Date.now();
    while (!f()) { if (Date.now() - t0 > ms) throw new Error("timeout waiting"); await new Promise((s) => setTimeout(s, 200)); }
  };
  try {
    await until(() => engineReady || document.getElementById("status").className === "err");
    r.engine = document.getElementById("status").textContent;
    const buf = Uint8Array.from(atob("__APK_B64__"), (c) => c.charCodeAt(0)).buffer;
    await loadFile(new File([buf], "probe.apk"));
    r.status = document.getElementById("status").textContent;
    r.cards = [...document.querySelectorAll(".card")].map((c) => c.querySelector(".k").innerText + "=" + c.querySelector(".v").innerText);
    r.anoms = document.querySelectorAll(".anom").length;
    r.perms = document.querySelectorAll("#perms tr").length - 1;
    r.comps = document.querySelectorAll("#comps tr[data-kind]:not(.grp)").length;
    // components grouped by kind: one header row per kind, rows in kind order, a chip per kind
    const crows = [...document.querySelectorAll("#comps tr[data-kind]:not(.grp)")];
    r.compKinds = [...document.querySelectorAll("#comps tr.grp")].map((g) => g.dataset.kind);
    r.kindsGrouped = r.compKinds.length === new Set(crows.map((t) => t.dataset.kind)).size &&
      crows.every((t, i) => i === 0 || t.dataset.kind === crows[i - 1].dataset.kind || !crows.slice(0, i).some((p) => p.dataset.kind === t.dataset.kind));
    const chip = document.querySelector(`#comp-kinds button[data-kind="${r.compKinds.at(-1)}"]`);
    if (chip) {
      chip.click();
      const shown = crows.filter((t) => !t.hidden);
      r.kindFilter = shown.length > 0 && shown.every((t) => t.dataset.kind === chip.dataset.kind) &&
        shown.length === Number(chip.querySelector("b").textContent);
      document.querySelector('#comp-kinds button[data-kind=""]').click();
      r.kindFilter &&= crows.every((t) => !t.hidden);
    }
    r.appRows = crows.filter((t) => t.dataset.kind === "application").map((t) => t.cells[0].textContent);
    r.appFirst = !r.appRows.length || crows[0].dataset.kind === "application";
    // embedding contract (android-llm suite-bridge): headers name the columns, counts sit in the
    // section h2, every row names its kind, and every row that names a class carries data-class
    const contract = [];
    for (const [id, cnt] of [["comps", "comp-count"], ["perms", "perm-count"]]) {
      const tb = document.getElementById(id);
      const heads = [...(tb.rows[0]?.cells || [])].map((c) => c.textContent.trim());
      if (tb.rows.length > 1 && tb.rows[1].cells[0].matches("td.mono") && !(heads[0] === "name" && heads.includes("tag"))) contract.push(`${id}: headers ${heads}`);
      if (document.getElementById(cnt)?.parentElement?.tagName !== "H2") contract.push(`${cnt} not in an h2`);
    }
    if (crows.some((t) => t.cells[0].matches("td.mono") && !t.dataset.class)) contract.push("comps: row without data-class");
    if (crows.some((t) => t.dataset.kind === "activity-alias" && t.dataset.class === t.cells[0].textContent)) contract.push("comps: alias data-class is not its target");
    r.contract = contract;
    r.treeNodes = document.querySelectorAll("#tree .node").length;
    // every anomaly path must map onto a tree node
    const paths = [...document.querySelectorAll(".anom .path")].map((p) => p.dataset.path);
    r.unmappedPaths = paths.filter((p) => !document.querySelector(`#tree .node[data-path="${CSS.escape(p)}"]`));
    // labels: groups, per-config rows, and every "used by" link must map onto a tree node too
    // component names as the device builds them: none left package-relative (".Main")
    const ccols = [...document.querySelectorAll("#comps th")].map((t) => t.textContent);
    const cname = (i) => crows.map((t) => t.cells[i]?.textContent);
    r.compNames = cname(ccols.indexOf("name")).slice(0, 3);
    r.relativeNames = cname(ccols.indexOf("name")).filter((n) => n?.startsWith("."));
    // every <activity-alias> row names the class it launches (targetActivity, package-qualified)
    const tcol = ccols.indexOf("target_activity");
    r.aliasTargets = crows.filter((t) => t.dataset.kind === "activity-alias").map((t) => t.cells[tcol]?.textContent ?? null);
    r.restored = ccols.includes("declared_name") ? cname(ccols.indexOf("declared_name")).filter(Boolean).length : 0;
    r.treeClasses = [...document.querySelectorAll("#tree .aclass")].map((a) => a.textContent).slice(0, 2);
    r.labelCard = [...document.querySelectorAll(".card")].find((c) => c.querySelector(".k").textContent === "label")?.querySelector(".v").textContent;
    r.labelGroups = document.querySelectorAll("#labels .lbl").length;
    r.labelRows = [...document.querySelectorAll("#labels .lbl tr")].filter((t) => t.querySelector("td")).map((t) => t.querySelector(".cfgtag").textContent + "=" + t.querySelector(".val").textContent);
    r.labelUnresolved = [...document.querySelectorAll("#labels .sev")].filter((s) => s.textContent === "unresolved").length;
    const lpaths = [...document.querySelectorAll("#labels .path")].map((p) => p.dataset.path);
    // every android:label the tree shows (by ResID) must appear in the Labels list
    r.labelAttrsInTree = [...document.querySelectorAll("#tree .attr .ares")].filter((a) => a.textContent === "0x01010001").length;
    r.labelUses = lpaths.length;
    r.unmappedPaths.push(...lpaths.filter((p) => !document.querySelector(`#tree .node[data-path="${CSS.escape(p)}"]`)));
    // resolve the first reference in the tree
    const ref = document.querySelector("#tree .aref");
    if (ref) {
      ref.click();
      await until(() => ref.closest(".attr").querySelector(".resolved"), 20000);
      r.resolved = ref.closest(".attr").querySelector(".resolved").textContent.slice(0, 200);
    }
    // resource listing + string search
    // (an APK's table may be empty: wait for the count line, not for rows)
    document.getElementById("res-info").textContent = "";
    document.getElementById("res-go").click();
    await until(() => document.getElementById("res-info").textContent.includes("total"), 20000);
    r.resRows = document.querySelectorAll("#res tr td.mono").length ? document.querySelectorAll("#res tr").length - 1 : 0;
    r.resInfo = document.getElementById("res-info").textContent;
    document.getElementById("res-needle").value = "a";
    document.getElementById("res-search").click();
    await new Promise((s) => setTimeout(s, 1500));
    r.searchRows = document.querySelectorAll("#res tr").length - 1;
    // tool console
    r.toolOptions = document.querySelectorAll("#tool-name option").length;
    document.getElementById("tool-name").value = "resource_id_for";
    document.getElementById("tool-name").dispatchEvent(new Event("change"));
    document.querySelector('#tool-form [data-k="name"]').value = "string/app_name";
    document.getElementById("tool-run").click();
    await until(() => document.getElementById("tool-out").textContent.startsWith("//"), 20000);
    r.toolOut = document.getElementById("tool-out").textContent.slice(0, 300);
    // copy buttons: capture what each writes instead of touching the real clipboard
    const copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { copied.push(t); } } });
    const copyOf = async (btn) => {
      if (!btn) return null;
      const n = copied.length;
      btn.click();
      await new Promise((s) => setTimeout(s, 50));
      return copied.length > n ? copied[copied.length - 1] : null;
    };
    const pkg = r.cards.find((c) => c.startsWith("PACKAGE="))?.slice(8);
    const lblBtn = document.querySelector('h2 .copybtn[data-fn="labels"]');
    const c = {
      card: (await copyOf(document.querySelector(".card .copybtn"))) === "probe.apk",
      permsTable: /\S/.test((await copyOf(document.querySelector('h2 .copybtn[data-table="perms"]'))) || ""),
      treeXml: ((await copyOf(document.querySelector('.copybtn[data-fn="treeXml"]'))) || "").startsWith("<manifest"),
      treeNode: ((await copyOf(document.querySelector("#tree .node .copybtn"))) || "").startsWith("<manifest"),
      toolOut: ((await copyOf(document.querySelector('.copybtn[data-fn="toolOut"]'))) || "").startsWith("//"),
    };
    const pkgCard = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".k").textContent === "package");
    if (pkg && pkg !== "—") c.packageCard = (await copyOf(pkgCard?.querySelector(".copybtn"))) === pkg;
    const row = document.querySelector("#comps .rc .copybtn");
    if (row) c.componentRow = ((await copyOf(row)) || "").includes("\t");
    if (r.labelGroups) {
      c.labels = ((await copyOf(lblBtn)) || "").startsWith("label\tconfig\tvalue\tused_by\n");
      const v = document.querySelector("#labels tr .val");
      const vbtn = v?.closest("tr").querySelector(".rc .copybtn");
      if (vbtn && v.textContent !== "(empty string)") c.labelValue = (await copyOf(vbtn)) === v.textContent;
    }
    // a copy click must not toggle the tree node it sits on
    c.treeNotToggled = !document.querySelector("#tree .node")?.classList.contains("closed");
    r.copy = c;
  } catch (e) { r.error = String(e.stack || e); }
  return JSON.stringify(r);
})()
