import { test, expect, beforeAll, afterAll } from "bun:test";
import { isError, isResult } from "result-interface";
import {
  qcanCanonicaliser,
  startQCan,
  type Canonicaliser,
} from "../lib/canonicalize";
import { ContainerProcess } from "../lib/container_process";
import { locate } from "../lib/located_query";

const PREFIX = "PREFIX ex: <http://example.org/>";

let qcan: Canonicaliser;

beforeAll(async () => {
  const started = await startQCan();

  if (isError(started)) {
    throw started.error;
  }

  qcan = started.value;
});

afterAll(async () => {
  await qcan.close();
});

async function canonical(query: string) {
  const answer = await qcan.canonicalise(`${PREFIX} ${query}`);

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
  const answer = await qcan.canonicalise("SELECT ?s WHERE {");

  expect(isError(answer)).toBe(true);
});

test("keeps answering after a query that does not parse", async () => {
  await qcan.canonicalise("SELECT ?s WHERE {");

  expect(await canonical("SELECT ?s WHERE { ?s ex:job ?j }")).toContain(
    "http://example.org/job",
  );
});

test("reports a container that answers nothing", async () => {
  const dead = qcanCanonicaliser(
    ContainerProcess.spawn(["bun", "-e", "process.exit(0)"], "dead"),
  );

  const answer = await dead.canonicalise("SELECT ?s WHERE { ?s ?p ?o }");
  await dead.close();

  expect(isError(answer)).toBe(true);
});

test("reports an image it can neither find nor build", async () => {
  expect(isError(await startQCan("no-such-image-for-a-test"))).toBe(true);
});
