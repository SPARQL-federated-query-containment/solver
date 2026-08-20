import { test, expect } from "bun:test";
import { isError, isResult } from "result-interface";
import { locate, toSparql, LOCAL_MEMBER } from "../lib/located_query";

const PREFIX = "PREFIX ex: <http://example.org/>";
const REGISTRY = "http://example.org/reg";

function body(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value.body.map((pattern) => [
    pattern.location,
    pattern.subject.value,
    pattern.predicate.value,
    pattern.object.value,
  ]);
}

function head(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value.head.map((variable) => variable.value);
}

function rejection(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  return isResult(form) ? undefined : form.error.message;
}

test("locates a triple pattern of the body at the member queried locally", () => {
  expect(body("SELECT ?s WHERE { ?s ex:birthday ?b }")).toEqual([
    [LOCAL_MEMBER, "s", "http://example.org/birthday", "b"],
  ]);
});

test("locates a triple pattern of a SERVICE clause at its endpoint", () => {
  expect(
    body(`SELECT ?s WHERE {
      ?s ex:birthday ?b .
      SERVICE ex:reg { ?s ex:job ?j }
    }`),
  ).toEqual([
    [LOCAL_MEMBER, "s", "http://example.org/birthday", "b"],
    [REGISTRY, "s", "http://example.org/job", "j"],
  ]);
});

test("reads a SERVICE clause wrapped in a group as an ordinary member", () => {
  expect(
    body("SELECT ?s ?j WHERE { { SERVICE ex:reg { ?s ex:job ?j } } }"),
  ).toEqual([[REGISTRY, "s", "http://example.org/job", "j"]]);
});

test("locates every pattern of a query spanning three members", () => {
  expect(
    body(`SELECT ?drug ?title ?keggUrl WHERE {
      ?drug ex:drugCategory ex:micronutrient .
      ?drug ex:casRegistryNumber ?id .
      SERVICE ex:kegg {
        ?keggDrug ex:chemicalFormula ?formula .
        ?keggDrug ex:xRef ?id .
        ?keggDrug ex:url ?keggUrl .
      }
      SERVICE ex:pubmed {
        ?article ex:subject ?drug .
        ?article ex:title ?title .
      }
    }`),
  ).toEqual([
    [
      LOCAL_MEMBER,
      "drug",
      "http://example.org/drugCategory",
      "http://example.org/micronutrient",
    ],
    [LOCAL_MEMBER, "drug", "http://example.org/casRegistryNumber", "id"],
    [
      "http://example.org/kegg",
      "keggDrug",
      "http://example.org/chemicalFormula",
      "formula",
    ],
    ["http://example.org/kegg", "keggDrug", "http://example.org/xRef", "id"],
    ["http://example.org/kegg", "keggDrug", "http://example.org/url", "keggUrl"],
    [
      "http://example.org/pubmed",
      "article",
      "http://example.org/subject",
      "drug",
    ],
    [
      "http://example.org/pubmed",
      "article",
      "http://example.org/title",
      "title",
    ],
  ]);
});

test("gives two SERVICE clauses on one endpoint the same location", () => {
  const located = body(`SELECT ?s WHERE {
    SERVICE ex:reg { ?s ex:job ?j }
    ?s ex:birthday ?b .
    SERVICE ex:reg { ?s ex:employer ?e }
  }`);

  expect(located.map((pattern) => pattern[0]).toSorted()).toEqual([
    REGISTRY,
    REGISTRY,
    LOCAL_MEMBER,
  ]);
});

test("keeps the literals of the body as they are written", () => {
  expect(
    body(`SELECT ?s WHERE { ?s ex:label "text"@en . ?s ex:count 42 }`).map(
      (pattern) => pattern[3],
    ),
  ).toEqual(["text", "42"]);
});

test("refuses a large query holding one operator outside the fragment", () => {
  expect(
    rejection(`SELECT ?drug ?title WHERE {
      ?drug ex:drugCategory ex:micronutrient .
      ?drug ex:casRegistryNumber ?id .
      SERVICE ex:kegg {
        ?keggDrug ex:xRef ?id .
        ?keggDrug ex:url ?keggUrl .
      }
      SERVICE ex:pubmed {
        ?article ex:subject ?drug .
        OPTIONAL { ?article ex:title ?title }
      }
    }`),
  ).toContain("leftjoin");
});

test("refuses a head holding a variable the body never binds", () => {
  expect(
    rejection("SELECT ?s ?job WHERE { ?s ex:birthday ?b }"),
  ).toContain("?job");
});

test("refuses a blank node", () => {
  expect(
    rejection("SELECT ?s WHERE { ?s ex:a _:x . _:x ex:b ?c }"),
  ).toContain("blank node");
});

test("takes the head from the projection", () => {
  expect(head("SELECT ?s WHERE { ?s ex:birthday ?b }")).toEqual(["s"]);
});

test("takes every variable in scope as the head of a SELECT *", () => {
  expect(head("SELECT * WHERE { ?s ex:birthday ?b }").toSorted()).toEqual([
    "b",
    "s",
  ]);
});

test("expands a sequence path, which stays conjunctive", () => {
  expect(body("SELECT ?s WHERE { ?s ex:a/ex:b ?c }")).toEqual([
    [LOCAL_MEMBER, "s", "http://example.org/a", "var0"],
    [LOCAL_MEMBER, "var0", "http://example.org/b", "c"],
  ]);
});

test("refuses a transitive path", () => {
  expect(rejection("SELECT ?s WHERE { ?s ex:a* ?c }")).toContain("not a CQ");
});

test("refuses a union that is not a UCFQ", () => {
  expect(
    rejection("SELECT ?s WHERE { { ?s ex:a ?b } UNION { ?s ex:c ?d } }"),
  ).toContain("not a UCFQ");
});

test("refuses an optional", () => {
  expect(
    rejection("SELECT ?s WHERE { ?s ex:a ?b OPTIONAL { ?s ex:c ?d } }"),
  ).toContain("leftjoin");
});

test("refuses a filter", () => {
  expect(rejection("SELECT ?s WHERE { ?s ex:a ?b FILTER(?b > 2) }")).toContain(
    "filter",
  );
});

test("refuses a named graph", () => {
  expect(rejection("SELECT ?s WHERE { GRAPH ex:g { ?s ex:a ?b } }")).toContain(
    "graph",
  );
});

test("refuses a nested subquery", () => {
  expect(
    rejection(
      "SELECT ?s WHERE { ?s ex:a ?b . { SELECT ?s WHERE { ?s ex:c ?d } } }",
    ),
  ).toContain("project");
});

test("refuses a SERVICE clause naming its endpoint with a variable", () => {
  expect(rejection("SELECT ?s WHERE { SERVICE ?e { ?s ex:a ?b } }")).toContain(
    "variable",
  );
});

test("refuses a SERVICE clause nested in another", () => {
  expect(
    rejection("SELECT ?s WHERE { SERVICE ex:a { SERVICE ex:b { ?s ex:a ?b } } }"),
  ).toContain("nested");
});

test("refuses a query that is not a projection", () => {
  expect(rejection("ASK WHERE { ?s ex:a ?b }")).toContain("not a CQ");
});

test("refuses a SERVICE clause of a union naming its endpoint with a variable", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      { SERVICE ?e { ?s ex:job ?j } }
      UNION
      { SERVICE ex:reg { ?s ex:job ?j } }
    }`),
  ).toContain("variable");
});

test("refuses a blank node inside a union branch", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job _:x } }
      UNION
      { SERVICE ex:net { ?s ex:job _:x } }
    }`),
  ).toContain("blank node");
});

test("refuses a query that does not parse", () => {
  expect(rejection("SELECT ?s WHERE {")).toContain("does not parse");
});

function sparql(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return toSparql(form.value);
}

function object(query: string) {
  const [line] = sparql(query).split("\n").slice(2);

  return (line ?? "").trim().replace(/^\S+ \S+ /, "");
}

test("writes each member as a named graph", () => {
  expect(
    sparql(`SELECT ?s WHERE {
      ?s ex:birthday ?b .
      SERVICE ex:reg { ?s ex:job ?j }
    }`),
  ).toBe(`SELECT ?s WHERE {
  GRAPH <${LOCAL_MEMBER}> {
    ?s <http://example.org/birthday> ?b .
  }
  GRAPH <${REGISTRY}> {
    ?s <http://example.org/job> ?j .
  }
}`);
});

test("writes a plain string with no datatype", () => {
  expect(object(`SELECT ?s WHERE { ?s ex:a "jan" }`)).toBe(
    `"jan^^http://www.w3.org/2001/XMLSchema#string" .`,
  );
});

test("carries the datatype of a typed literal into the string", () => {
  expect(object(`SELECT ?s WHERE { ?s ex:a 42 }`)).toBe(
    `"42^^http://www.w3.org/2001/XMLSchema#integer" .`,
  );
});

test("carries the language tag of a literal into the string", () => {
  expect(object(`SELECT ?s WHERE { ?s ex:a "jan"@en }`)).toBe(`"jan@en" .`);
});

test("escapes what would break the string or the tag", () => {
  expect(object(`SELECT ?s WHERE { ?s ex:a "a^b@c%d" }`)).toBe(
    `"a%5Eb%40c%25d^^http://www.w3.org/2001/XMLSchema#string" .`,
  );
});

test("keeps two literals sharing a lexical form apart", () => {
  expect(object(`SELECT ?s WHERE { ?s ex:a "42" }`)).not.toBe(
    object(`SELECT ?s WHERE { ?s ex:a 42 }`),
  );
});
