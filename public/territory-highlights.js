export function unitHighlights(unit, people = []) {
  return {
    sale: unit.commercial_status === "in vendita",
    agency: unit.commercial_status === "altra agenzia",
    hot:
      unit.lead_temperature === "caldo" ||
      people.some((p) => p.lead_temperature === "caldo"),
  };
}
