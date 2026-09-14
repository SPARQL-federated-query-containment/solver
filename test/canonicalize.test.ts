import { test, expect } from "bun:test";
import { isError, isResult } from "result-interface";
import { canonicalise } from "../lib/canonicalize";
import { locate } from "../lib/located_query";

const PREFIX = "PREFIX ex: <http://example.org/>";

async function canonical(query: string) {
  const answer = await canonicalise(`${PREFIX} ${query}`);

  if (isError(answer)) {
    throw answer.error;
  }

  return answer.value;
}

test("gives two queries differing only by variable names one form", async () => {
  expect(await canonical("SELECT ?s WHERE { ?s ex:job ?j }")).toBe(
    await canonical("SELECT ?x WHERE { ?x ex:job ?y }"),
  );
});

test("gives two queries reading a different predicate different forms", async () => {
  expect(await canonical("SELECT ?s WHERE { ?s ex:job ?j }")).not.toBe(
    await canonical("SELECT ?s WHERE { ?s ex:name ?j }"),
  );
});

test("keeps the endpoint of a SERVICE clause", async () => {
  expect(
    await canonical("SELECT ?s WHERE { SERVICE ex:reg { ?s ex:job ?j } }"),
  ).toContain("http://example.org/reg");
});

test("gives two queries reading at a different member different forms", async () => {
  expect(
    await canonical("SELECT ?s WHERE { SERVICE ex:reg { ?s ex:job ?j } }"),
  ).not.toBe(
    await canonical("SELECT ?s WHERE { SERVICE ex:net { ?s ex:job ?j } }"),
  );
});

test("returns a form the located query still reads", async () => {
  const form = locate(
    await canonical(`SELECT ?s WHERE {
      { SERVICE ex:reg { ?s ex:job ?j } }
      UNION
      { SERVICE ex:net { ?s ex:job ?j } }
    }`),
  );

  expect(isResult(form)).toBe(true);
});

test("reports a query that does not parse as an error", async () => {
  const answer = await canonicalise("SELECT ?s WHERE {");

  expect(isError(answer)).toBe(true);
});

test("answers a following call after a query that does not parse", async () => {
  await canonicalise("SELECT ?s WHERE {");

  expect(await canonical("SELECT ?s WHERE { ?s ex:job ?j }")).toContain(
    "http://example.org/job",
  );
});

