import { type Result, result, error } from "result-interface";

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

/**
 * A sub-federation as a set of members. It holds at least one member, and the
 * local member only when it holds it alone: the graph queried locally is never
 * part of a BKG.
 */
export function subFederation(members: Iterable<string>): Result<Set<string>> {
  const set = new Set(members);

  if (set.size === 0) {
    return error(new Error("a sub-federation holds no member"));
  }

  if (set.size > 1 && set.has(LOCAL_MEMBER)) {
    return error(
      new Error("the local member cannot be part of a sub-federation"),
    );
  }

  return result(set);
}

/** Whether a location is the single local member. */
export function isLocal(location: Set<string>): boolean {
  return location.size === 1 && location.has(LOCAL_MEMBER);
}

/**
 * Whether the containing query's location covers every member the contained
 * query's does, so the contained BKG is a subbag of the containing one.
 */
export function hosts(containing: Set<string>, contained: Set<string>): boolean {
  return contained.isSubsetOf(containing);
}

/**
 * A single IRI naming the BKG of a sub-federation, for the named graph a set
 * containment solver reads. A sub-federation of one member is that member.
 */
export function virtualMember(subFederation: Iterable<string>): string {
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
