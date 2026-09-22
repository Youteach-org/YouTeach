export function visibleGroups(rawGroups = {}) {
  return Object.fromEntries(
    Object.entries(rawGroups || {}).filter(([, group]) => group?.deleted !== true)
  );
}

export function isDeletedGroup(group) {
  return Boolean(group?.deleted === true);
}
