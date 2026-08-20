import { test, expect, afterEach } from "bun:test";
import { isError } from "result-interface";
import { ContainerProcess } from "../lib/container_process";

const FIXTURE = `${import.meta.dir}/fixtures/echo_solver.ts`;

let solver: ContainerProcess | undefined;

function start(): ContainerProcess {
  solver = ContainerProcess.spawn(["bun", FIXTURE], "echo");
  return solver;
}

afterEach(async () => {
  await solver?.close();
  solver = undefined;
});

test("reports an image it can neither find nor build", async () => {
  expect(isError(await ContainerProcess.start("no-such-image-for-a-test"))).toBe(
    true,
  );
});

test("returns the payload of a framed response", async () => {
  const answer = await start().request("hello");

  expect(isError(answer)).toBe(false);
  expect(answer).toEqual({ value: "hello" });
});

test("carries several fields", async () => {
  const answer = await start().request("one", "two", "three");

  expect(answer).toEqual({ value: "one|two|three" });
});

test("carries a multi-line query without breaking the framing", async () => {
  const query = "SELECT ?s WHERE {\n  ?s <http://p> ?o .\n}";
  const answer = await start().request(query);

  expect(answer).toEqual({ value: query });
});

test("carries non-ascii terms", async () => {
  const query = 'SELECT ?s WHERE { ?s <http://p> "Ávila œuf 東京" }';
  const answer = await start().request(query);

  expect(answer).toEqual({ value: query });
});

test("reports a solver error as an error result", async () => {
  const answer = await start().request("fail", "z3 is not executable");

  expect(isError(answer)).toBe(true);
  expect((answer as { error: Error }).error.message).toBe(
    "echo: z3 is not executable",
  );
});

test("reports an unframed response rather than parsing it", async () => {
  const answer = await start().request("unframed");

  expect(isError(answer)).toBe(true);
  expect((answer as { error: Error }).error.message).toContain("what?");
});

test("reports a solver that closes its output, with its diagnostics", async () => {
  const process = start();

  await process.request("complain", "z3 missing");
  const answer = await process.request("die");

  expect(isError(answer)).toBe(true);
  expect((answer as { error: Error }).error.message).toContain("z3 missing");
});

test("answers concurrent requests each with its own response", async () => {
  const process = start();

  const answers = await Promise.all([
    process.request("slow", "30", "first"),
    process.request("second"),
    process.request("third"),
  ]);

  expect(answers).toEqual([
    { value: "first" },
    { value: "second" },
    { value: "third" },
  ]);
});

test("keeps answering after a failed request", async () => {
  const process = start();

  await process.request("fail", "boom");
  const answer = await process.request("still here");

  expect(answer).toEqual({ value: "still here" });
});
