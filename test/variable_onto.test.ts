import { test, expect } from "bun:test";
import { isError } from "result-interface";
import { isVariableOnto } from "../lib/variable_onto";
import { locate } from "../lib/located_query";
import { LOCAL, REMOTE, query, tp } from "./fixtures/located_query";

const PREFIX = `PREFIX schema: <http://schema.org/> PREFIX ex: <http://example.org/>`;

function located(sparql: string) {
  const form = locate(`${PREFIX} ${sparql}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

test("rejects the pair of the introduction, contained under set semantics only", () => {
  const superQuery = located(`SELECT ?s WHERE {
    ?s schema:birthDate ?birthDate .
  }`);
  const subQuery = located(`SELECT ?s WHERE {
    ?s schema:birthDate ?birthDate .
    ?s schema:jobTitle ?job .
  }`);

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("rejects a pair the federation conditions accept, reading one variable at two members", () => {
  const subQuery = located(`SELECT ?s ?birthDate ?job WHERE {
    ?s schema:birthDate ?birthDate .
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
  }`);
  const superQuery = located(`SELECT ?s ?birthDate ?job WHERE {
    ?s schema:birthDate ?birthDate ;
       schema:jobTitle ?job .
  }`);

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("accepts a federated query against itself", () => {
  const q = located(`SELECT ?drug ?title ?keggUrl WHERE {
    ?drug schema:category ex:micronutrient .
    ?drug schema:identifier ?id .
    SERVICE ex:kegg {
      ?keggDrug schema:sameAs ?id .
      ?keggDrug schema:url ?keggUrl .
    }
    SERVICE ex:pubmed {
      ?article schema:about ?drug .
      ?article schema:name ?title .
    }
  }`);

  expect(isVariableOnto(q, q)).toBe(true);
});

test("accepts a federated pair refined by a constant at one member", () => {
  const superQuery = located(`SELECT ?s ?job WHERE {
    ?s schema:birthDate ?birthDate .
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
  }`);
  const subQuery = located(`SELECT ?s ?job WHERE {
    ?s schema:birthDate "2000-01-01" .
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
  }`);

  expect(isVariableOnto(subQuery, superQuery)).toBe(true);
});

test("rejects a federated pair reading the same pattern at another member", () => {
  const superQuery = located(`SELECT ?s ?job WHERE {
    SERVICE ex:socialNetwork { ?s schema:jobTitle ?job }
  }`);
  const subQuery = located(`SELECT ?s ?job WHERE {
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
  }`);

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("the identity is variable-onto on two identical projection-free queries", () => {
  const q = query(
    ["s", "b"],
    [tp(LOCAL, "?s", "birthday", "?b")],
  );

  expect(isVariableOnto(q, q)).toBe(true);
});

test("rejects a contained query binding a variable the mapping never reaches", () => {
  // The example of the paper: projecting away ?job lets a person with two jobs
  // appear twice, so the two are set contained but not bag-set contained.
  const superQuery = query(["s"], [tp(LOCAL, "?s", "birthday", "?b")]);
  const subQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "birthday", "?b"), tp(LOCAL, "?s", "job", "?job")],
  );

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("accepts an extra pattern of the contained query binding no new variable", () => {
  const superQuery = query(["s"], [tp(LOCAL, "?s", "birthday", "?b")]);
  const subQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "birthday", "?b"), tp(LOCAL, "?s", "knows", "?b")],
  );

  expect(isVariableOnto(subQuery, superQuery)).toBe(true);
});

test("does not stop at the first mapping when a later one is variable-onto", () => {
  // Placing the pattern on the first candidate leaves ?w unreached, so the
  // search must backtrack onto the second.
  const superQuery = query(["s"], [tp(LOCAL, "?s", "job", "?v")]);
  const subQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "job", "acme"), tp(LOCAL, "?s", "job", "?w")],
  );

  expect(isVariableOnto(subQuery, superQuery)).toBe(true);
});

test("places two patterns on a single one, which variable-onto allows", () => {
  const superQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "job", "?x"), tp(LOCAL, "?s", "job", "?y")],
  );
  const subQuery = query(["s"], [tp(LOCAL, "?s", "job", "?j")]);

  expect(isVariableOnto(subQuery, superQuery)).toBe(true);
});

test("refuses a constant facing a different constant", () => {
  const superQuery = query(["s"], [tp(LOCAL, "?s", "job", "acme")]);
  const subQuery = query(["s"], [tp(LOCAL, "?s", "job", "globex")]);

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("keeps a variable on the term it was first assigned", () => {
  const superQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "job", "?x"), tp(LOCAL, "?s", "employer", "?x")],
  );
  const subQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "job", "acme"), tp(LOCAL, "?s", "employer", "globex")],
  );

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("only places a pattern on one evaluated at the same member", () => {
  const superQuery = query(["s"], [tp(REMOTE, "?s", "birthday", "?b")]);
  const subQuery = query(["s"], [tp(LOCAL, "?s", "birthday", "?b")]);

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("maps each pattern to the member evaluating it", () => {
  const superQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "birthday", "?b"), tp(REMOTE, "?s", "job", "?j")],
  );
  const subQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "birthday", "?b"), tp(REMOTE, "?s", "job", "?j")],
  );

  expect(isVariableOnto(subQuery, superQuery)).toBe(true);
});

test("undoes an assignment when a placement fails two patterns later", () => {
  const superQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "job", "?x"), tp(LOCAL, "?x", "city", "?y")],
  );
  const subQuery = query(
    ["s"],
    [
      tp(LOCAL, "?s", "job", "acme"),
      tp(LOCAL, "?s", "job", "?w"),
      tp(LOCAL, "?w", "city", "?z"),
    ],
  );

  expect(isVariableOnto(subQuery, superQuery)).toBe(true);
});

test("holds a distinguished variable to itself", () => {
  const superQuery = query(["s"], [tp(LOCAL, "?s", "job", "?t")]);
  const subQuery = query(["s"], [tp(LOCAL, "?t", "job", "?s")]);

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("rejects a pair no placement can make onto", () => {
  const superQuery = query(
    ["s"],
    [tp(LOCAL, "?s", "job", "?x"), tp(LOCAL, "?s", "birthday", "?y")],
  );
  const subQuery = query(
    ["s"],
    [
      tp(LOCAL, "?s", "job", "?a"),
      tp(LOCAL, "?s", "birthday", "?b"),
      tp(LOCAL, "?s", "knows", "?c"),
    ],
  );

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});

test("rejects a contained query whose body the containing one cannot cover", () => {
  const superQuery = query(["s"], [tp(LOCAL, "?s", "birthday", "?b")]);
  const subQuery = query(["s"], [tp(LOCAL, "?s", "job", "?j")]);

  expect(isVariableOnto(subQuery, superQuery)).toBe(false);
});
