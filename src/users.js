const collator = new Intl.Collator('es', { sensitivity: 'base' });

export function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    startMonth: row.start_month,
    endMonth: row.end_month,
    joinsSecretSanta: Boolean(row.joins_secret_santa),
    isAdmin: Boolean(row.is_admin),
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export function toPerson(row) {
  return { id: row.id, name: row.name, startMonth: row.start_month, endMonth: row.end_month };
}

export function sortByName(items) {
  return [...items].sort((a, b) => collator.compare(a.name, b.name));
}
