import {
  variablesOf,
  type LocatedQuery,
  type LocatedTriplePattern,
} from "./containment_mapping";

export function federationOf(query: LocatedQuery): Set<string> {
  const federation = new Set<string>();

  for (const pattern of query.body) {
    federation.add(pattern.location);
  }

  return federation;
}

/** The variables a member binds alone and the head discards. */
export function fresh(query: LocatedQuery, member: string): Set<string> {
  const distinguished = new Set<string>();

  for (const variable of query.head) {
    distinguished.add(variable.value);
  }

  const atMember: LocatedTriplePattern[] = [];
  const elsewhere: LocatedTriplePattern[] = [];

  for (const pattern of query.body) {
    if (pattern.location === member) {
      atMember.push(pattern);
    } else {
      elsewhere.push(pattern);
    }
  }

  const shared = variablesOf(elsewhere);
  const freshVariables = new Set<string>();

  for (const variable of variablesOf(atMember)) {
    if (!distinguished.has(variable) && !shared.has(variable)) {
      freshVariables.add(variable);
    }
  }

  return freshVariables;
}

/**
 * Whether every member the containing query contacts is also contacted by the
 * contained one, which containment requires.
 */
export function subQueryContactsEveryMember(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
): boolean {
  const contacted = federationOf(subQuery);

  for (const member of federationOf(superQuery)) {
    if (!contacted.has(member)) {
      return false;
    }
  }

  return true;
}

/**
 * Whether every member the contained query contacts alone binds no fresh
 * variable, which containment requires. Such a variable multiplies the
 * solution mappings of the contained query while leaving the containing one
 * untouched.
 */
export function extraMembersBindNoFreshVariable(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
): boolean {
  const contacted = federationOf(superQuery);

  for (const member of federationOf(subQuery)) {
    if (!contacted.has(member) && fresh(subQuery, member).size > 0) {
      return false;
    }
  }

  return true;
}
