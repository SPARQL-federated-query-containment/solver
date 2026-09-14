import { test, expect } from "bun:test";
import { isError } from "result-interface";
import { specsIsContained, specsVerdictOf } from "../lib/specs";
import { locate } from "../lib/located_query";

const PREFIX = "PREFIX ex: <http://example.org/>";

function located(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

async function contained(subQuery: string, superQuery: string) {
  const answer = await specsIsContained(located(subQuery), located(superQuery));

  if (isError(answer)) {
    throw answer.error;
  }

  return answer.value;
}

test("reports a query as contained in itself", async () => {
  const query = "SELECT ?s WHERE { ?s ex:job ?j }";

  expect(await contained(query, query)).toBe("contained");
});

test("reports a query holding an extra pattern as contained", async () => {
  expect(
    await contained(
      "SELECT ?s WHERE { ?s ex:job ?j . ?s ex:name ?n }",
      "SELECT ?s WHERE { ?s ex:job ?j }",
    ),
  ).toBe("contained");
});

test("reports a query missing a pattern as not contained", async () => {
  expect(
    await contained(
      "SELECT ?s WHERE { ?s ex:job ?j }",
      "SELECT ?s WHERE { ?s ex:job ?j . ?s ex:name ?n }",
    ),
  ).toBe("not contained");
});

test("reads the member each pattern is evaluated at", async () => {
  expect(
    await contained(
      "SELECT ?s ?j WHERE { SERVICE ex:reg { ?s ex:job ?j } }",
      "SELECT ?s ?j WHERE { SERVICE ex:net { ?s ex:job ?j } }",
    ),
  ).toBe("not contained");
});

test("decides a pair holding a typed literal", async () => {
  const query = `SELECT ?s WHERE { ?s ex:age 42 }`;

  expect(await contained(query, query)).toBe("contained");
});

test("decides a pair holding a literal with a language tag", async () => {
  const query = `SELECT ?s WHERE { ?s ex:name "jan"@en }`;

  expect(await contained(query, query)).toBe("contained");
});

test("keeps a literal apart from another of a different datatype", async () => {
  expect(
    await contained(
      `SELECT ?s WHERE { ?s ex:age "42" }`,
      `SELECT ?s WHERE { ?s ex:age 42 }`,
    ),
  ).toBe("not contained");
});

test("reports a verdict it does not recognise", () => {
  const answer = specsVerdictOf("nonsense");

  expect(isError(answer)).toBe(true);
});
