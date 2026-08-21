export const ENTITY_TYPES = [
  "maltego.IPv4Address",
  "maltego.IPv6Address",
  "maltego.Domain",
  "maltego.URL",
  "maltego.Hash",
  "maltego.EmailAddress",
  "maltego.Netblock",
  "maltego.AS",
  "maltego.Website",
  "maltego.Company",
  "maltego.Person",
  "maltego.Phrase"
] as const;

export type MaltegoEntityType = (typeof ENTITY_TYPES)[number];

const VALUE_PROPERTY_BY_ENTITY_TYPE: Record<MaltegoEntityType, string> = {
  "maltego.IPv4Address": "ipv4-address",
  "maltego.IPv6Address": "ipv6-address",
  "maltego.Domain": "fqdn",
  "maltego.URL": "url",
  "maltego.Hash": "properties.hash",
  "maltego.EmailAddress": "email",
  "maltego.Netblock": "ipv4-range",
  "maltego.AS": "as.number",
  "maltego.Website": "fqdn",
  "maltego.Company": "title",
  "maltego.Person": "person.fullname",
  "maltego.Phrase": "text"
};

export type ValidateResult =
  | { ok: true; normalized?: string }
  | { ok: false; suggestions: string[]; message: string };

export function validateEntityType(type: string): ValidateResult {
  if ((ENTITY_TYPES as readonly string[]).includes(type)) {
    return { ok: true };
  }
  const prefixed = `maltego.${type}`;
  if ((ENTITY_TYPES as readonly string[]).includes(prefixed)) {
    return { ok: true, normalized: prefixed };
  }
  const suggestions = ENTITY_TYPES.filter(
    (t) => t.toLowerCase().includes(type.toLowerCase())
  );
  return {
    ok: false,
    suggestions: suggestions.length > 0 ? [...suggestions] : [...ENTITY_TYPES],
    message: `Unknown entity type '${type}'. Valid types: ${ENTITY_TYPES.join(", ")}`
  };
}

export function isPhraseType(type: string): boolean {
  return type === "maltego.Phrase" || type === "Phrase";
}

export function normalizeEntityType(type: string): string {
  const result = validateEntityType(type);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.normalized ?? type;
}

export function valuePropertyForEntityType(type: string): string {
  const normalized = normalizeEntityType(type) as MaltegoEntityType;
  return VALUE_PROPERTY_BY_ENTITY_TYPE[normalized];
}
