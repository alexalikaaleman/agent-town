/** ?view=list: a plain phone list of bots (state, task text, project). No map. */
(function () {
const ORDER = { blocked: 0, waiting: 1, working: 2, done: 3, idle: 4, sleeping: 5 };

function render(roster, bots) {
  const list = document.getElementById("bot-list");
  const byId = new Map(roster.map((b) => [b.id, b]));
  const rows = bots.slice().sort((a, b) => {
    const na = a.needsAlex ? -1 : 0;
    const nb = b.needsAlex ? -1 : 0;
    return na - nb || (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) || String(byId.get(a.id).name).localeCompare(byId.get(b.id).name);
  });
  const n = (f) => bots.filter(f).length;
  document.getElementById("c-work").textContent = "Working " + n((b) => b.state === "working");
  document.getElementById("c-wait").textContent = "Waiting " + n((b) => b.state === "waiting");
  document.getElementById("c-block").textContent = "Blocked " + n((b) => b.state === "blocked");
  document.getElementById("c-alex").textContent = "Needs Alex " + n((b) => b.needsAlex);
  list.replaceChildren();
  for (const s of rows) {
    const bot = byId.get(s.id);
    const li = document.createElement("li");
    li.style.setProperty("--dot", bot.color || "#888");
    const row = document.createElement("div");
    row.className = "row1";
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = bot.name;
    const st = document.createElement("span");
    st.className = "st s-" + s.state;
    st.textContent = s.needsAlex ? "needs Alex (" + s.needsAlex + ")" : s.state;
    row.append(nm, st);
    const tk = document.createElement("div");
    tk.className = "tk";
    tk.textContent = s.text || s.task || "No current task.";
    const meta = document.createElement("div");
    meta.className = "meta";
    const when = s.ts ? "Updated " + window.AgentTown.formatStamp(s.ts) : "No status line yet";
    meta.textContent = (s.project ? "Project: " + s.project + " · " : "") + when;
    li.append(row, tk, meta);
    list.appendChild(li);
  }
}

function bootList() {
  document.getElementById("list-view").hidden = false;
  let roster = [];
  window.AgentTown.connectFeed({
    onRoster(list) {
      roster = list;
    },
    onSnapshot(bots) {
      render(roster, bots);
    },
    onStatus(info) {
      const el = document.getElementById("mode");
      el.className = "mode " + (info.ok ? "live" : "stale");
      el.textContent = (info.ok ? "" : "Offline · ") + "List view";
    },
  }).catch(() => {
    const fatal = document.getElementById("fatal");
    fatal.hidden = false;
    fatal.textContent = "Could not load the bots. Check the connection and reload.";
  });
}

window.AgentTown = window.AgentTown || {};
window.AgentTown.bootList = bootList;
})();
