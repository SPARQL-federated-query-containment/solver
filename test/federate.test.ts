import { test, expect } from "bun:test";
import { isError } from "result-interface";
import { federate } from "../lib/federate";
import { locate, LOCAL_MEMBER } from "../lib/located_query";

const PREFIX = "PREFIX ex: <http://example.org/>";
const REGISTRY = "http://example.org/reg";
const NETWORK = "http://example.org/net";
const BOTH =
  "urn:federation:http%3A%2F%2Fexample.org%2Fnet" +
  "_http%3A%2F%2Fexample.org%2Freg";

function located(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

function assigned(query: string, members: string[]) {
  const federated = federate(located(query), members);

  if (isError(federated)) {
    throw federated.error;
  }

  return {
    head: federated.value.head.map((variable) => variable.value),
    semantics: federated.value.semantics,
    body: federated.value.body.map((pattern) => [
      pattern.location,
      pattern.subject.value,
      pattern.predicate.value,
      pattern.object.value,
    ]),
  };
}

function rejection(query: string, members: string[]) {
  const federated = federate(located(query), members);

  return isError(federated) ? federated.error.message : undefined;
}

test("reads every pattern at the virtual member of the federation", () => {
  expect(
    assigned("SELECT ?s WHERE { ?s ex:job ?j . ?s ex:name ?n }", [
      REGISTRY,
      NETWORK,
    ]),
  ).toEqual({
    head: ["s"],
    semantics: "bag",
    body: [
      [BOTH, "s", "http://example.org/job", "j"],
      [BOTH, "s", "http://example.org/name", "n"],
    ],
  });
});

test("reads under bag-set semantics when the federation holds one member", () => {
  expect(
    assigned("SELECT ?s ?j WHERE { ?s ex:job ?j }", [REGISTRY]),
  ).toEqual({
    head: ["s", "j"],
    semantics: "bag-set",
    body: [[REGISTRY, "s", "http://example.org/job", "j"]],
  });
});

test("reads under bag-set semantics when a member is repeated", () => {
  expect(
    assigned("SELECT ?s ?j WHERE { ?s ex:job ?j }", [REGISTRY, REGISTRY]),
  ).toEqual({
    head: ["s", "j"],
    semantics: "bag-set",
    body: [[REGISTRY, "s", "http://example.org/job", "j"]],
  });
});

test("keeps a constant of the body apart from a variable", () => {
  expect(
    assigned('SELECT ?s WHERE { ?s ex:job "cashier" }', [REGISTRY, NETWORK]),
  ).toEqual({
    head: ["s"],
    semantics: "bag",
    body: [[BOTH, "s", "http://example.org/job", "cashier"]],
  });
});

test("assigns the federation whatever the order of its members", () => {
  expect(
    assigned("SELECT ?s WHERE { ?s ex:job ?j }", [NETWORK, REGISTRY]),
  ).toEqual(assigned("SELECT ?s WHERE { ?s ex:job ?j }", [REGISTRY, NETWORK]));
});

test("refuses a query already reading at a member", () => {
  expect(
    rejection("SELECT ?s ?j WHERE { SERVICE ex:reg { ?s ex:job ?j } }", [
      NETWORK,
    ]),
  ).toContain("already reads at a federation member");
});

test("refuses a federation holding no member", () => {
  expect(rejection("SELECT ?s WHERE { ?s ex:job ?j }", [])).toContain(
    "no member",
  );
});

test("assigns the member queried locally like any other", () => {
  expect(
    assigned("SELECT ?s ?j WHERE { ?s ex:job ?j }", [LOCAL_MEMBER]),
  ).toEqual({
    head: ["s", "j"],
    semantics: "bag-set",
    body: [[LOCAL_MEMBER, "s", "http://example.org/job", "j"]],
  });
});
