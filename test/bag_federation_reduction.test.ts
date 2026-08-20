import { test, expect } from "bun:test";
import { isError, isResult } from "result-interface";
import { virtualMember } from "../lib/bag_federation_reduction";
import { locate, LOCAL_MEMBER } from "../lib/located_query";

const PREFIX = "PREFIX ex: <http://example.org/>";
const REGISTRY = "http://example.org/reg";
const NETWORK = "http://example.org/net";
const LIBRARY = "http://example.org/lib";
const NET_REG =
  "urn:federation:http%3A%2F%2Fexample.org%2Fnet" +
  "_http%3A%2F%2Fexample.org%2Freg";
const LIB_NET =
  "urn:federation:http%3A%2F%2Fexample.org%2Flib" +
  "_http%3A%2F%2Fexample.org%2Fnet";
const LIB_NET_REG =
  "urn:federation:http%3A%2F%2Fexample.org%2Flib" +
  "_http%3A%2F%2Fexample.org%2Fnet" +
  "_http%3A%2F%2Fexample.org%2Freg";

function located(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return {
    head: form.value.head.map((variable) => variable.value),
    semantics: form.value.semantics,
    body: form.value.body.map((pattern) => [
      pattern.location,
      pattern.subject.value,
      pattern.predicate.value,
      pattern.object.value,
    ]),
  };
}

function rejection(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  return isResult(form) ? undefined : form.error.message;
}

test("names a sub-federation of one member after that member", () => {
  expect(virtualMember([REGISTRY])).toBe(REGISTRY);
});

test("names a sub-federation of two members after both", () => {
  expect(virtualMember([REGISTRY, NETWORK])).toBe(NET_REG);
});

test("names a sub-federation of three members after all three", () => {
  expect(virtualMember([REGISTRY, NETWORK, LIBRARY])).toBe(LIB_NET_REG);
});

test("names a sub-federation the same whatever the order of its members", () => {
  expect(virtualMember([NETWORK, REGISTRY])).toBe(NET_REG);
});

test("names a sub-federation the same when a member is repeated", () => {
  expect(virtualMember([REGISTRY, NETWORK, REGISTRY])).toBe(NET_REG);
});

test("names two sub-federations sharing a member differently", () => {
  expect(virtualMember([REGISTRY, NETWORK])).not.toBe(
    virtualMember([NETWORK, LIBRARY]),
  );
});

test("keeps a member holding the separator from splitting into two", () => {
  expect(virtualMember(["http://a", "http://b_http://c"])).not.toBe(
    virtualMember(["http://a", "http://b", "http://c"]),
  );
});

test("reduces a union to its pattern at the virtual member of its branches", () => {
  expect(
    located(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?j } }
    }`),
  ).toEqual({
    head: ["s"],
    semantics: "bag",
    body: [[NET_REG, "s", "http://example.org/job", "j"]],
  });
});

test("reduces the two unions of an exhaustive source assignment", () => {
  expect(
    located(`SELECT * WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?j } }

      { SERVICE ex:reg { ?s ex:birthday ?b } }
      UNION
      { SERVICE ex:net { ?s ex:birthday ?b } }
    }`),
  ).toEqual({
    head: ["b", "j", "s"],
    semantics: "bag",
    body: [
      [NET_REG, "s", "http://example.org/job", "j"],
      [NET_REG, "s", "http://example.org/birthday", "b"],
    ],
  });
});

test("reduces a union over three members to one virtual member", () => {
  expect(
    located(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?j } }
      UNION
      { SERVICE ex:lib { ?s ex:job ?j } }
    }`),
  ).toEqual({
    head: ["s"],
    semantics: "bag",
    body: [[LIB_NET_REG, "s", "http://example.org/job", "j"]],
  });
});

test("locates each conjunct at its member, whatever its sub-federation", () => {
  expect(
    located(`SELECT ?s WHERE {
      ?s ex:name ?n .
      SERVICE ex:reg { ?s ex:city ?c }

      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?j } }
      UNION
      { SERVICE ex:lib { ?s ex:job ?j } }

      { SERVICE ex:reg { ?s ex:age ?a } }
      UNION
      { SERVICE ex:net { ?s ex:age ?a } }

      { SERVICE ex:net { ?s ex:phone ?p } }
      UNION
      { SERVICE ex:lib { ?s ex:phone ?p } }
    }`),
  ).toEqual({
    head: ["s"],
    semantics: "bag",
    body: [
      [LOCAL_MEMBER, "s", "http://example.org/name", "n"],
      [REGISTRY, "s", "http://example.org/city", "c"],
      [LIB_NET_REG, "s", "http://example.org/job", "j"],
      [NET_REG, "s", "http://example.org/age", "a"],
      [LIB_NET, "s", "http://example.org/phone", "p"],
    ],
  });
});

test("reads a union repeating one member under bag-set semantics", () => {
  expect(
    located(`SELECT ?s ?j WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:reg { ?s ex:job ?j } }
    }`),
  ).toEqual({
    head: ["s", "j"],
    semantics: "bag-set",
    body: [[REGISTRY, "s", "http://example.org/job", "j"]],
  });
});

test("reads a query holding no union under bag-set semantics", () => {
  expect(located("SELECT ?s WHERE { ?s ex:birthday ?b }").semantics).toBe(
    "bag-set",
  );
});

test("accepts branches naming a variable local to the union differently", () => {
  expect(
    located(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?k } }
    }`),
  ).toEqual({
    head: ["s"],
    semantics: "bag",
    body: [[NET_REG, "s", "http://example.org/job", "j"]],
  });
});

test("refuses to rename a variable joining outside the union", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      ?j ex:name ?n .
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?k } }
    }`),
  ).toContain("different triple patterns");
});

test("refuses to rename a distinguished variable", () => {
  expect(
    rejection(`SELECT ?s ?j WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?k } }
    }`),
  ).toContain("different triple patterns");
});

test("refuses a renaming that would merge two variables", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      ?s ex:name ?n .
      { SERVICE ex:reg { ?a ex:job ?a } }
      UNION
      { SERVICE ex:net { ?x ex:job ?y } }
    }`),
  ).toContain("different triple patterns");
});

test("refuses to rename a variable joining another union", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?k } }

      { SERVICE ex:reg { ?j ex:name ?s } }
      UNION
      { SERVICE ex:net { ?j ex:name ?s } }
    }`),
  ).toContain("different triple patterns");
});

test("refuses a renaming that would send one variable to two", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      ?s ex:name ?n .
      { SERVICE ex:reg { ?a ex:job ?b } }
      UNION
      { SERVICE ex:net { ?x ex:job ?x } }
    }`),
  ).toContain("different triple patterns");
});

test("refuses a union whose branches evaluate different predicates", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:birthday ?j } }
    }`),
  ).toContain("different triple patterns");
});

test("refuses a union branch evaluating more than one triple pattern", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job ?j . ?s ex:name ?n } }
      UNION
      { SERVICE ex:net { ?s ex:job ?j } }
    }`),
  ).toContain("more than one triple pattern");
});

test("refuses a union branch evaluated at no member", () => {
  expect(
    rejection("SELECT ?s WHERE { { ?s ex:a ?b } UNION { ?s ex:c ?d } }"),
  ).toContain("a union branch holds a bgp");
});

test("refuses a union nested in a SERVICE clause", () => {
  expect(
    rejection(`SELECT ?s WHERE {
      SERVICE ex:reg {
        { SERVICE ex:net { ?s ex:job ?j } }
        UNION
        { SERVICE ex:net { ?s ex:job ?j } }
      }
    }`),
  ).toContain("nested");
});
