import { test, expect } from "bun:test";
import { isError } from "result-interface";
import { assign, membersOf } from "../lib/util_cli";
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

function assigned(query: string, federation: string | undefined) {
  const federated = assign(located(query), federation);

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

test("reads a federation naming several members", () => {
  expect(membersOf(`${REGISTRY},${NETWORK}`)).toEqual([REGISTRY, NETWORK]);
});

test("reads a federation naming one member", () => {
  expect(membersOf(REGISTRY)).toEqual([REGISTRY]);
});

test("reads members written between brackets", () => {
  expect(membersOf(`<${REGISTRY}>,<${NETWORK}>`)).toEqual([REGISTRY, NETWORK]);
});

test("reads members written around spaces", () => {
  expect(membersOf(` ${REGISTRY} , ${NETWORK} `)).toEqual([REGISTRY, NETWORK]);
});

test("reads no member from an empty federation", () => {
  expect(membersOf(" , ")).toEqual([]);
});

test("leaves the query alone when no federation is given", () => {
  expect(assigned("SELECT ?s WHERE { ?s ex:job ?j }", undefined)).toEqual({
    head: ["s"],
    semantics: "bag-set",
    body: [[LOCAL_MEMBER, "s", "http://example.org/job", "j"]],
  });
});

test("reads the query over the federation it is given", () => {
  expect(
    assigned("SELECT ?s WHERE { ?s ex:job ?j }", `${REGISTRY},${NETWORK}`),
  ).toEqual({
    head: ["s"],
    semantics: "bag",
    body: [[BOTH, "s", "http://example.org/job", "j"]],
  });
});

test("carries the refusal of a query already reading at a member", () => {
  const federated = assign(
    located("SELECT ?s ?j WHERE { SERVICE ex:reg { ?s ex:job ?j } }"),
    NETWORK,
  );

  expect(isError(federated)).toBe(true);
});
