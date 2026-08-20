import { test, expect } from "bun:test";
import type * as RDF from "@rdfjs/types";
import { isError } from "result-interface";
import {
  identityOnHead,
  isProjectionFree,
  place,
  sameHead,
  variablesOf,
  type Mapping,
} from "../lib/containment_mapping";
import { locate } from "../lib/located_query";

const PREFIX = "PREFIX ex: <http://example.org/>";

function located(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

function pattern(query: string, index = 0) {
  const [found] = located(query).body.slice(index);

  if (found === undefined) {
    throw new Error(`the query holds no pattern at ${String(index)}`);
  }

  return found;
}

function assignments(mapping: Mapping | undefined) {
  return mapping === undefined
    ? undefined
    : Object.fromEntries(
        Array.from(mapping, ([variable, term]) => [variable, term.value]),
      );
}

test("reads the variables of a body, each once", () => {
  expect(
    variablesOf(
      located("SELECT ?s WHERE { ?s ex:job ?j . ?s ex:name ?n }").body,
    ),
  ).toEqual(new Set(["s", "j", "n"]));
});

test("reads no variable from a constant of a body", () => {
  expect(
    variablesOf(located("SELECT ?s WHERE { ?s ex:job ex:cashier }").body),
  ).toEqual(new Set(["s"]));
});

test("a query keeping every variable of its body is projection-free", () => {
  expect(isProjectionFree(located("SELECT ?s ?j WHERE { ?s ex:job ?j }"))).toBe(
    true,
  );
});

test("a query discarding a variable of its body is not projection-free", () => {
  expect(isProjectionFree(located("SELECT ?s WHERE { ?s ex:job ?j }"))).toBe(
    false,
  );
});

test("two queries selecting the same variables have the same head", () => {
  expect(
    sameHead(
      located("SELECT ?s ?j WHERE { ?s ex:job ?j }"),
      located("SELECT ?j ?s WHERE { ?s ex:job ?j }"),
    ),
  ).toBe(true);
});

test("two queries selecting different variables do not", () => {
  expect(
    sameHead(
      located("SELECT ?s WHERE { ?s ex:job ?j }"),
      located("SELECT ?j WHERE { ?s ex:job ?j }"),
    ),
  ).toBe(false);
});

test("a head holding more variables is not the same head", () => {
  expect(
    sameHead(
      located("SELECT ?s ?j WHERE { ?s ex:job ?j }"),
      located("SELECT ?s WHERE { ?s ex:job ?j }"),
    ),
  ).toBe(false);
});

test("the identity assigns every distinguished variable to itself", () => {
  expect(
    assignments(identityOnHead(located("SELECT ?s ?j WHERE { ?s ex:job ?j }"))),
  ).toEqual({ s: "s", j: "j" });
});

test("the identity assigns nothing a query discards", () => {
  expect(
    assignments(identityOnHead(located("SELECT ?s WHERE { ?s ex:job ?j }"))),
  ).toEqual({ s: "s" });
});

test("places a pattern on another, assigning each variable it meets", () => {
  expect(
    assignments(
      place(
        pattern("SELECT ?s WHERE { ?s ex:job ?j }"),
        pattern("SELECT ?s WHERE { ?s ex:job ex:cashier }"),
        new Map(),
      ),
    ),
  ).toEqual({ s: "s", j: "http://example.org/cashier" });
});

test("refuses to place a constant on a different constant", () => {
  expect(
    place(
      pattern("SELECT ?s WHERE { ?s ex:job ex:cashier }"),
      pattern("SELECT ?s WHERE { ?s ex:job ex:barista }"),
      new Map(),
    ),
  ).toBeUndefined();
});

test("refuses to assign a variable a second term", () => {
  const assigned = place(
    pattern("SELECT ?s WHERE { ?s ex:job ?j }"),
    pattern("SELECT ?s WHERE { ?s ex:job ex:cashier }"),
    new Map(),
  );

  expect(assignments(assigned)).toEqual({
    s: "s",
    j: "http://example.org/cashier",
  });

  expect(
    place(
      pattern("SELECT ?s WHERE { ?s ex:job ?j }"),
      pattern("SELECT ?s WHERE { ?s ex:job ex:barista }"),
      assigned ?? new Map<string, RDF.Term>(),
    ),
  ).toBeUndefined();
});

test("leaves the mapping it was given untouched", () => {
  const sigma: Mapping = new Map();

  place(
    pattern("SELECT ?s WHERE { ?s ex:job ?j }"),
    pattern("SELECT ?s WHERE { ?s ex:job ex:cashier }"),
    sigma,
  );

  expect(sigma.size).toBe(0);
});
