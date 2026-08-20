import {
  identityOnHead,
  place,
  variablesOf,
  type LocatedQuery,
  type LocatedTriplePattern,
  type Mapping,
} from "./containment_mapping";

/** The variables a mapping reaches, by name. */
function image(sigma: Mapping): Set<string> {
  const reached = new Set<string>();

  for (const term of sigma.values()) {
    if (term.termType === "Variable") {
      reached.add(term.value);
    }
  }

  return reached;
}

/**
 * Places the patterns of the containing query on those of the contained one,
 * and reports whether some complete mapping reaches every variable of the
 * contained query.
 */
function search(
  toPlace: LocatedTriplePattern[],
  targets: LocatedTriplePattern[],
  sigma: Mapping,
  targetVariables: Set<string>,
): boolean {
  const [a, ...rest] = toPlace;

  if (a === undefined) {
    return targetVariables.isSubsetOf(image(sigma));
  }

  for (const b of targets) {
    // A location is a constant, so a pattern is only ever placed on one
    // evaluated at the same federation member.
    if (b.location !== a.location) {
      continue;
    }

    const extended = place(a, b, sigma);

    if (
      extended !== undefined &&
      search(rest, targets, extended, targetVariables)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Whether a variable-onto containment mapping from the containing query to the
 * contained one exists, which is sufficient for bag-set containment and, when
 * the contained query is projection-free, necessary.
 *
 * The two queries are expected to have the same head.
 */
export function isVariableOnto(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
): boolean {
  return search(
    superQuery.body,
    subQuery.body,
    identityOnHead(superQuery),
    variablesOf(subQuery.body),
  );
}
