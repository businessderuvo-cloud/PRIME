export function unitHighlights(unit, people = []) {
  return {
    sale: unit.commercial_status === "in vendita",
    agency: unit.commercial_status === "altra agenzia",
    hot:
      Number(unit.is_hot_lead) === 1 ||
      people.some((p) => Number(p.is_hot_lead) === 1),
  };
}
