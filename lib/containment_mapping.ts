import type * as RDF from "@rdfjs/types";

/** A triple pattern extended with the federation member evaluating it. */
export interface LocatedTriplePattern {
  location: string;
  subject: RDF.Term;
  predicate: RDF.Term;
  object: RDF.Term;
}

export type Semantics = "bag-set" | "bag";

export interface LocatedBody {
  body: LocatedTriplePattern[];
  semantics: Semantics;
}

export interface LocatedQuery extends LocatedBody {
  head: RDF.Variable[];
}

/** Assigns a term of the contained query to a variable of the containing one. */
export type Mapping = Map<string, RDF.Term>;

export const POSITIONS = ["subject", "predicate", "object"] as const;

/**
 * Extends the mapping so that it places a on b, or returns undefined when the
 * two cannot be placed. A constant must equal the term facing it, and a
 * variable already assigned must keep its term.
 */
export function place(
  a: LocatedTriplePattern,
  b: LocatedTriplePattern,
  sigma: Mapping,
): Mapping | undefined {
  const extended: Mapping = new Map(sigma);

  for (const position of POSITIONS) {
    const term = a[position];
    const image = b[position];

    if (term.termType === "Variable") {
      const assigned = extended.get(term.value);

      if (assigned !== undefined && !assigned.equals(image)) {
        return undefined;
      }

      extended.set(term.value, image);
    } else if (!term.equals(image)) {
      return undefined;
    }
  }

  return extended;
}

export function variablesOf(body: LocatedTriplePattern[]): Set<string> {
  const variables = new Set<string>();

  for (const pattern of body) {
    for (const position of POSITIONS) {
      const term = pattern[position];

      if (term.termType === "Variable") {
        variables.add(term.value);
      }
    }
  }

  return variables;
}

/** Whether every variable of the body is distinguished. */
export function isProjectionFree(query: LocatedQuery): boolean {
  const distinguished = new Set<string>();

  for (const variable of query.head) {
    distinguished.add(variable.value);
  }

  for (const variable of variablesOf(query.body)) {
    if (!distinguished.has(variable)) {
      return false;
    }
  }

  return true;
}

export function sameHead(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
): boolean {
  if (subQuery.head.length !== superQuery.head.length) {
    return false;
  }

  const distinguished = new Set<string>();

  for (const variable of superQuery.head) {
    distinguished.add(variable.value);
  }

  for (const variable of subQuery.head) {
    if (!distinguished.has(variable.value)) {
      return false;
    }
  }

  return true;
}

/** The identity on the distinguished variables, which every mapping starts from. */
export function identityOnHead(query: LocatedQuery): Mapping {
  return new Map(query.head.map((variable) => [variable.value, variable]));
}
