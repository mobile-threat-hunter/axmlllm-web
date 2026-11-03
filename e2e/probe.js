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
    r.cards = [...document.querySelectorAll(".card")].map((c) => c.innerText.replace(/\n/g, "="));
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
    r.unmappedPaths.push(...lpaths.filter((p) => !document.querySelector(`#tree .node[data-path="${CSS.escape(p)}"]`)));
    // resolve the first reference in the tree
    const ref = document.querySelector("#tree .aref");
    if (ref) {
      ref.click();
      await until(() => ref.closest(".attr").querySelector(".resolved"), 20000);
      r.resolved = ref.closest(".attr").querySelector(".resolved").textContent.slice(0, 200);
    }
    // resource listing + string search
    document.getElementById("res-go").click();
    await until(() => document.querySelectorAll("#res tr").length > 1, 20000);
    r.resRows = document.querySelectorAll("#res tr").length - 1;
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
  } catch (e) { r.error = String(e.stack || e); }
  return JSON.stringify(r);
})()
