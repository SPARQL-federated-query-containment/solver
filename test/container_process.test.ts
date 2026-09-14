import { test, expect } from "bun:test";
import { isError } from "result-interface";
import { runCommand, runContainer } from "../lib/container_process";

const FIXTURE = `${import.meta.dir}/fixtures/echo_solver.ts`;

function run(...fields: string[]) {
  return runCommand(["bun", FIXTURE], "echo", fields);
}

test("reports an image it can neither find nor build", async () => {
  expect(isError(await runContainer("no-such-image-for-a-test", []))).toBe(
    true,
  );
});

test("returns the payload of a framed response", async () => {
  const answer = await run("hello");

  expect(answer).toEqual({ value: "hello" });
});

test("carries several fields", async () => {
  const answer = await run("one", "two", "three");

  expect(answer).toEqual({ value: "one|two|three" });
});

test("carries a multi-line query without breaking the framing", async () => {
  const query = "SELECT ?s WHERE {\n  ?s <http://p> ?o .\n}";
  const answer = await run(query);

  expect(answer).toEqual({ value: query });
});

test("carries non-ascii terms", async () => {
  const query = 'SELECT ?s WHERE { ?s <http://p> "Ávila œuf 東京" }';
  const answer = await run(query);

  expect(answer).toEqual({ value: query });
});

test("reports a solver error as an error result", async () => {
  const answer = await run("fail", "z3 is not executable");

  expect(isError(answer)).toBe(true);
  expect((answer as { error: Error }).error.message).toBe(
    "echo: z3 is not executable",
  );
});

test("reports an unframed response rather than parsing it", async () => {
  const answer = await run("unframed");

  expect(isError(answer)).toBe(true);
  expect((answer as { error: Error }).error.message).toContain("what?");
});

test("reports a solver that closes its output, with its diagnostics", async () => {
  const answer = await run("crash", "z3 missing");

  expect(isError(answer)).toBe(true);
  expect((answer as { error: Error }).error.message).toContain("z3 missing");
});
