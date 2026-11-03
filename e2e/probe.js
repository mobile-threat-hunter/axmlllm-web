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
    r.comps = document.querySelectorAll("#comps tr").length - 1;
    r.treeNodes = document.querySelectorAll("#tree .node").length;
    // every anomaly path must map onto a tree node
    const paths = [...document.querySelectorAll(".anom .path")].map((p) => p.dataset.path);
    r.unmappedPaths = paths.filter((p) => !document.querySelector(`#tree .node[data-path="${CSS.escape(p)}"]`));
    // labels: groups, per-config rows, and every "used by" link must map onto a tree node too
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
