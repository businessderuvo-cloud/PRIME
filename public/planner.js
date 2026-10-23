export const finishedStatuses = new Set([
  "completata",
  "non completata",
  "annullata",
]);

export function clockState(activities, agentId, now = Date.now()) {
  const open = activities.filter(
    (a) => a.agent_id === agentId && !finishedStatuses.has(a.status),
  );
  const overdue = open
    .filter((a) => Date.parse(a.due_at) <= now)
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const current = open
    .filter((a) => Date.parse(a.starts_at) <= now && Date.parse(a.due_at) > now)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  const next = open
    .filter((a) => Date.parse(a.starts_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  if (overdue.length)
    return { phase: "review", activity: overdue[0], overdue, seconds: 0 };
  if (current)
    return {
      phase: "running",
      activity: current,
      overdue,
      seconds: Math.max(
        0,
        Math.ceil((Date.parse(current.due_at) - now) / 1000),
      ),
      next,
    };
  if (next)
    return {
      phase: "waiting",
      activity: next,
      overdue,
      seconds: Math.max(
        0,
        Math.ceil((Date.parse(next.starts_at) - now) / 1000),
      ),
    };
  return { phase: "free", overdue, seconds: 0 };
}
export function countdown(seconds) {
  const n = Math.max(0, Math.floor(seconds));
  return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
}
export function dayKey(input = new Date()) {
  const d = new Date(input);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
export function daysFor(date, view = "week") {
  const start = new Date(date + "T00:00:00");
  if (view === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const count = view === "day" ? 1 : 7;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return dayKey(d);
  });
}
// Segment events at local midnight, then arrange each overlap cluster in lanes.
export function layoutDay(
  records,
  day,
  { startField = "starts_at", endField = "ends_at" } = {},
) {
  const dayStart = new Date(day + "T00:00:00"),
    dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const items = records
    .map((record) => ({
      record,
      start: new Date(Math.max(Date.parse(record[startField]), +dayStart)),
      end: new Date(Math.min(Date.parse(record[endField]), +dayEnd)),
    }))
    .filter((x) => x.start < x.end);
  items.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      a.record.id.localeCompare(b.record.id),
  );
  let cluster = [],
    clusterEnd = 0;
  function finish() {
    const laneEnds = [];
    for (const x of cluster) {
      let lane = laneEnds.findIndex((end) => end <= +x.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = +x.end;
      x.lane = lane;
    }
    for (const x of cluster) {
      x.lanes = laneEnds.length;
      x.top = x.start.getHours() * 60 + x.start.getMinutes();
      const end =
        +x.end === +dayEnd ? 1440 : x.end.getHours() * 60 + x.end.getMinutes();
      x.minutes = Math.max(1, end - x.top);
    }
    cluster = [];
  }
  for (const item of items) {
    if (cluster.length && +item.start >= clusterEnd) finish();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, +item.end);
  }
  if (cluster.length) finish();
  return items;
}
export function activityData(record, fields) {
  return Object.fromEntries(Object.keys(fields).map((k) => [k, record[k]]));
}
