function parseRoleIds(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(roleId => roleId.trim().replace(/^<@&|>$/g, ''))
    .filter(Boolean);
}

function hasAnyRole(interaction, roleIds) {
  return roleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId));
}

module.exports = { parseRoleIds, hasAnyRole };
