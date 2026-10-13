export function isSchemaMismatch(error: { message?: string; code?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  const code = error.code ?? '';
  const message = error.message ?? '';
  return (
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    /schema cache/i.test(message) ||
    /could not find the (table|column)/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /does not exist/i.test(message)
  );
}
