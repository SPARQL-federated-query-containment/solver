import { test, expect } from "bun:test";

const SCRIPT = `${import.meta.dir}/../scripts/validate_query.ts`;
const QUERIES = `${import.meta.dir}/fixtures/queries`;

async function validate(...paths: string[]) {
  const process = Bun.spawn(["bun", SCRIPT, ...paths], {
    stdout: "pipe",
    stderr: "ignore",
  });

  const [status, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);

  return { status, stdout };
}

test("accepts a query of the fragment", async () => {
  const { status, stdout } = await validate(`${QUERIES}/accepted.sparql`);

  expect(status).toBe(0);
  expect(stdout.trim()).toBe(`${QUERIES}/accepted.sparql\taccepted\tbag-set`);
});

test("rejects a query outside the fragment, naming the operator", async () => {
  const { status, stdout } = await validate(`${QUERIES}/rejected.sparql`);

  expect(status).toBe(1);
  expect(stdout).toContain("leftjoin");
});

test("reports every query it is given and rejects the run", async () => {
  const { status, stdout } = await validate(
    `${QUERIES}/accepted.sparql`,
    `${QUERIES}/rejected.sparql`,
  );

  expect(status).toBe(1);
  expect(stdout.trim().split("\n")).toHaveLength(2);
});
