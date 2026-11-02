/** Pacific/Honolulu wall clock and the day/night phase used for the town tint. */
(function () {
function honoluluParts(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Pacific/Honolulu",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = parseInt(map.hour, 10);
  if (Number.isNaN(hour)) hour = 0;
  hour = ((hour % 24) + 24) % 24;
  const minute = String(map.minute || "00").padStart(2, "0");
  return { hour, minute, label: formatLabel(hour, minute), phase: phaseFor(hour) };
}

function phaseFor(hour) {
  if (hour >= 19 || hour < 5) return "night";
  if (hour >= 17) return "dusk";
  if (hour < 7) return "dawn";
  return "day";
}

function formatLabel(hour, minute) {
  const ampm = hour >= 12 ? "PM" : "AM";
  let h = hour % 12;
  if (h === 0) h = 12;
  return h + ":" + minute + " " + ampm + " HT";
}

function tintFor(phase) {
  if (phase === "night") return "rgba(8, 14, 42, 0.45)";
  if (phase === "dusk") return "rgba(96, 38, 12, 0.24)";
  if (phase === "dawn") return "rgba(255, 186, 120, 0.18)";
  return null;
}

function phaseLabel(phase) {
  if (phase === "night") return "Night";
  if (phase === "dusk") return "Dusk";
  if (phase === "dawn") return "Dawn";
  return "Day";
}

function formatStamp(ts) {
  if (!ts || String(ts).startsWith("seq-")) return "No updates yet";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "No updates yet";
  const parts = honoluluParts(date);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Pacific/Honolulu",
    month: "short",
    day: "numeric",
  }).format(date);
  return day + ", " + parts.label;
}

window.AgentTown = window.AgentTown || {};
Object.assign(window.AgentTown, {
  honoluluParts: honoluluParts,
  phaseFor: phaseFor,
  tintFor: tintFor,
  phaseLabel: phaseLabel,
  formatStamp: formatStamp,
});
})();
