import { test, expect } from "bun:test";
import { isError } from "result-interface";
import { isSubgoalsOnto } from "../lib/subgoals_onto";
import { locate } from "../lib/located_query";

const PREFIX = `PREFIX schema: <http://schema.org/> PREFIX ex: <http://example.org/>`;

function located(sparql: string) {
  const form = locate(`${PREFIX} ${sparql}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

test("the identity is subgoals-onto on two identical queries", () => {
  const q = located(`SELECT ?s ?j WHERE { ?s schema:jobTitle ?j }`);

  expect(isSubgoalsOnto(q, q)).toBe(true);
});

test("refuses to leave a conjunct of the contained query unmapped", () => {
  const superQuery = located(`SELECT ?s ?b WHERE { ?s schema:birthDate ?b }`);
  const subQuery = located(`SELECT ?s ?b WHERE {
    ?s schema:birthDate ?b .
    ?s schema:knows ?b .
  }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(false);
});

test("accepts two patterns placed on a single conjunct when nothing is left over", () => {
  const superQuery = located(`SELECT ?s ?j WHERE {
    ?s schema:jobTitle ?j .
    ?s schema:jobTitle ?j .
  }`);
  const subQuery = located(`SELECT ?s ?j WHERE { ?s schema:jobTitle ?j }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(true);
});

test("counts a repeated conjunct of the contained query once", () => {
  const superQuery = located(`SELECT ?s ?j WHERE { ?s schema:jobTitle ?j }`);
  const subQuery = located(`SELECT ?s ?j WHERE {
    ?s schema:jobTitle ?j .
    ?s schema:jobTitle ?j .
  }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(true);
});

test("rejects a pair whose containing query holds too few conjuncts", () => {
  const superQuery = located(`SELECT ?s WHERE { ?s schema:jobTitle ?x }`);
  const subQuery = located(`SELECT ?s WHERE {
    ?s schema:jobTitle ?j .
    ?s schema:name ?n .
  }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(false);
});

test("holds a distinguished variable to itself", () => {
  const superQuery = located(`SELECT ?s ?t WHERE { ?s schema:jobTitle ?t }`);
  const subQuery = located(`SELECT ?s ?t WHERE { ?t schema:jobTitle ?s }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(false);
});

test("refuses a constant facing a different constant", () => {
  const superQuery = located(`SELECT ?s WHERE { ?s schema:jobTitle "cashier" }`);
  const subQuery = located(`SELECT ?s WHERE { ?s schema:jobTitle "barista" }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(false);
});

test("only places a pattern on one evaluated at the same member", () => {
  const superQuery = located(`SELECT ?s ?j WHERE {
    SERVICE ex:socialNetwork { ?s schema:jobTitle ?j }
  }`);
  const subQuery = located(`SELECT ?s ?j WHERE {
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?j }
  }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(false);
});

test("maps a branch onto one that unions over a wider sub-federation", () => {
  const narrow = located(`SELECT * WHERE {
    { SERVICE ex:a { ?s ex:p ?o } } UNION { SERVICE ex:b { ?s ex:p ?o } }
  }`);
  const wide = located(`SELECT * WHERE {
    { SERVICE ex:a { ?s ex:p ?o } } UNION { SERVICE ex:b { ?s ex:p ?o } }
    UNION { SERVICE ex:c { ?s ex:p ?o } }
  }`);

  expect(isSubgoalsOnto(narrow, wide)).toBe(true);
  expect(isSubgoalsOnto(wide, narrow)).toBe(false);
});

test("covers a federated query against itself", () => {
  const q = located(`SELECT ?s ?b ?j WHERE {
    ?s schema:birthDate ?b .
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?j }
  }`);

  expect(isSubgoalsOnto(q, q)).toBe(true);
});

test("backtracks onto the placement that covers every conjunct", () => {
  const superQuery = located(`SELECT ?s WHERE {
    ?s schema:jobTitle ?x .
    ?s schema:jobTitle ?y .
  }`);
  const subQuery = located(`SELECT ?s WHERE {
    ?s schema:jobTitle "cashier" .
    ?s schema:jobTitle ?w .
  }`);

  expect(isSubgoalsOnto(subQuery, superQuery)).toBe(true);
});
