export function unitHighlights(unit, people = []) {
  return {
    sale: unit.commercial_status === "in vendita",
    agency: unit.commercial_status === "altra agenzia",
    hot:
      Number(unit.is_hot_lead) === 1 ||
      people.some((p) => Number(p.is_hot_lead) === 1),
  };
}

export function unitAgentIds(unit, properties = [], people = []) {
  if (unit.assigned_agent_id) return [unit.assigned_agent_id];
  const propertyAgents = properties
    .filter((p) => p.unit_id === unit.id && p.assigned_agent_id)
    .map((p) => p.assigned_agent_id);
  if (propertyAgents.length) return [...new Set(propertyAgents)];
  return [...new Set(people.map((p) => p.assigned_agent_id).filter(Boolean))];
}
