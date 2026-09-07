/**
 * The prefix of the members minted here rather than read from a query, so that
 * one never collides with a member of a real federation.
 */
export const FEDERATION_PREFIX = "urn:federation:";

/**
 * The separator between the members a virtual member holds, escaped within
 * each of them so that it marks a boundary and nothing else.
 */
export const MEMBER_SEPARATOR = "_";
export const ESCAPED_MEMBER_SEPARATOR = "%5F";

/** The member holding the knowledge graph queried locally, f_loc in the paper. */
export const LOCAL_MEMBER = `${FEDERATION_PREFIX}local`;

/** The virtual member holding the BKG of a sub-federation. */
export function virtualMember(subFederation: string[]): string {
  const members = Array.from(new Set(subFederation)).sort();
  const [only, ...rest] = members;

  if (only !== undefined && rest.length === 0) {
    return only;
  }

  const escaped = members.map((member) =>
    encodeURIComponent(member).replaceAll(
      MEMBER_SEPARATOR,
      ESCAPED_MEMBER_SEPARATOR,
    ),
  );

  return `${FEDERATION_PREFIX}${escaped.join(MEMBER_SEPARATOR)}`;
}
