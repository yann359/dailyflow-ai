export function portableSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const unsupported = new Set([
    '$schema',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'format',
    'pattern',
  ]);
  const walk = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(walk)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([k]) => !unsupported.has(k))
              .map(([k, item]) => [k, walk(item)]),
          )
        : v;
  return walk(schema) as Record<string, unknown>;
}
