import { DataFactory } from "rdf-data-factory";
import type {
  LocatedQuery,
  LocatedTriplePattern,
} from "../../lib/containment_mapping";

const DF = new DataFactory();

export const LOCAL = "local";
export const REMOTE = "http://example.org/sparql";
export const REGISTRY = "http://example.org/jobRegistry";

export const v = (name: string) => DF.variable(name);
export const c = (name: string) => DF.namedNode(`http://example.org/${name}`);

export function tp(
  location: string,
  subject: string,
  predicate: string,
  object: string,
): LocatedTriplePattern {
  const term = (name: string) =>
    name.startsWith("?") ? v(name.slice(1)) : c(name);

  return {
    location,
    subject: term(subject),
    predicate: term(predicate),
    object: term(object),
  };
}

export function query(
  head: string[],
  body: LocatedTriplePattern[],
): LocatedQuery {
  return { head: head.map(v), body, semantics: "bag-set" };
}
