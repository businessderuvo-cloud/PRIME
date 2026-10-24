const compare = new Intl.Collator("it", { numeric: true, sensitivity: "base" })
  .compare;
function floorInfo(value) {
  const raw = String(value || "").trim();
  const text = raw
    .toLowerCase()
    .replace(/^piano\s+/, "")
    .replace(/[°º]/g, "")
    .trim();
  if (!text)
    return { key: "unknown", label: "Piano da indicare", rank: Infinity };
  const aliases = {
    terra: 0,
    "piano terra": 0,
    "p.t.": 0,
    pt: 0,
    primo: 1,
    secondo: 2,
    terzo: 3,
    quarto: 4,
    quinto: 5,
    sesto: 6,
    settimo: 7,
    ottavo: 8,
    nono: 9,
    decimo: 10,
    rialzato: 0.25,
    ammezzato: 0.5,
    seminterrato: -0.5,
    interrato: -1,
  };
  const number = Object.hasOwn(aliases, text)
    ? aliases[text]
    : /^-?\d+$/.test(text)
      ? Number(text)
      : null;
  const special = {
    "-0.5": "Seminterrato",
    0.25: "Piano rialzato",
    0.5: "Piano ammezzato",
  };
  if (number !== null)
    return {
      key: String(number),
      label:
        special[number] || (number === 0 ? "Piano terra" : `Piano ${number}`),
      rank: number,
    };
  return { key: text, label: `Piano ${raw}`, rank: 10000 };
}
export function groupUnitsByFloor(units) {
  const groups = new Map();
  for (const unit of units) {
    const floor = floorInfo(unit.floor);
    if (!groups.has(floor.key)) groups.set(floor.key, { ...floor, units: [] });
    groups.get(floor.key).units.push(unit);
  }
  return [...groups.values()]
    .sort((a, b) =>
      a.rank === b.rank ? compare(a.label, b.label) : a.rank - b.rank,
    )
    .map((group) => ({
      ...group,
      units: group.units.sort(
        (a, b) =>
          compare(a.staircase || "", b.staircase || "") ||
          compare(a.title, b.title),
      ),
    }));
}
