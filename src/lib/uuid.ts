const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

export function uuidIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => isUuid(id)))];
}

export function isInvalidUuidError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) {
    return false;
  }
  return (
    error.code === '22P02' ||
    /invalid input syntax for type uuid/i.test(error.message ?? '')
  );
}
