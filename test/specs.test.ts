import { test, expect, beforeAll, afterAll } from "bun:test";
import { isError } from "result-interface";
import { specsSolver, startSpecs } from "../lib/specs";
import { ContainerProcess } from "../lib/container_process";
import { locate } from "../lib/located_query";
import type { SetSolver } from "../lib/SetContainmentSolver";

const PREFIX = "PREFIX ex: <http://example.org/>";

let specs: SetSolver;

beforeAll(async () => {
  const started = await startSpecs();

  if (isError(started)) {
    throw started.error;
  }

  specs = started.value;
});

afterAll(async () => {
  await specs.close();
});

function located(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

async function contained(subQuery: string, superQuery: string) {
  const answer = await specs.isContained(located(subQuery), located(superQuery));

  if (isError(answer)) {
    throw answer.error;
  }

  return answer.value;
}

test("reports a query as contained in itself", async () => {
  const query = "SELECT ?s WHERE { ?s ex:job ?j }";

  expect(await contained(query, query)).toBe(true);
});

test("reports a query holding an extra pattern as contained", async () => {
  expect(
    await contained(
      "SELECT ?s WHERE { ?s ex:job ?j . ?s ex:name ?n }",
      "SELECT ?s WHERE { ?s ex:job ?j }",
    ),
  ).toBe(true);
});

test("reports a query missing a pattern as not contained", async () => {
  expect(
    await contained(
      "SELECT ?s WHERE { ?s ex:job ?j }",
      "SELECT ?s WHERE { ?s ex:job ?j . ?s ex:name ?n }",
    ),
  ).toBe(false);
});

test("reads the member each pattern is evaluated at", async () => {
  expect(
    await contained(
      "SELECT ?s ?j WHERE { SERVICE ex:reg { ?s ex:job ?j } }",
      "SELECT ?s ?j WHERE { SERVICE ex:net { ?s ex:job ?j } }",
    ),
  ).toBe(false);
});

test("decides a pair holding a typed literal", async () => {
  const query = `SELECT ?s WHERE { ?s ex:age 42 }`;

  expect(await contained(query, query)).toBe(true);
});

test("decides a pair holding a literal with a language tag", async () => {
  const query = `SELECT ?s WHERE { ?s ex:name "jan"@en }`;

  expect(await contained(query, query)).toBe(true);
});

test("keeps a literal apart from another of a different datatype", async () => {
  expect(
    await contained(
      `SELECT ?s WHERE { ?s ex:age "42" }`,
      `SELECT ?s WHERE { ?s ex:age 42 }`,
    ),
  ).toBe(false);
});

test("answers several pairs on the one process", async () => {
  const query = "SELECT ?s WHERE { ?s ex:job ?j }";

  expect(await contained(query, query)).toBe(true);
  expect(
    await contained(query, "SELECT ?s WHERE { ?s ex:name ?n }"),
  ).toBe(false);
  expect(await contained(query, query)).toBe(true);
});

const ECHO = `${import.meta.dir}/fixtures/echo_solver.ts`;

/** A stand-in container answering with whatever it was asked. */
function echoing() {
  return specsSolver(ContainerProcess.spawn(["bun", ECHO], "echo"));
}

test("reports a verdict it does not recognise", async () => {
  const echo = echoing();
  const query = located("SELECT ?s WHERE { ?s ex:job ?j }");

  const answer = await echo.isContained(query, query);
  await echo.close();

  expect(isError(answer)).toBe(true);
});

test("reports a container that answers nothing", async () => {
  const dead = specsSolver(
    ContainerProcess.spawn(["bun", "-e", "process.exit(0)"], "dead"),
  );
  const query = located("SELECT ?s WHERE { ?s ex:job ?j }");

  const answer = await dead.isContained(query, query);
  await dead.close();

  expect(isError(answer)).toBe(true);
});

test("reports an image it can neither find nor build", async () => {
  expect(isError(await startSpecs("no-such-image-for-a-test"))).toBe(true);
});
