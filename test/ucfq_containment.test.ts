import { test, expect } from "bun:test";
import { isError, result, error } from "result-interface";
import { decideUcfqContainment } from "../lib/ucfq_containment";
import { locate } from "../lib/located_query";
import type { SetContainmentSolver } from "../lib/SetContainmentSolver";

const PREFIX = `PREFIX schema: <http://schema.org/> PREFIX ex: <http://example.org/>`;

function located(sparql: string) {
  const form = locate(`${PREFIX} ${sparql}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

function setSolver(verdict: boolean) {
  const calls = { count: 0 };

  const decide: SetContainmentSolver = () => {
    calls.count += 1;
    return Promise.resolve(result(verdict));
  };

  return { decide, calls };
}

const ESA = `SELECT * WHERE {
  { SERVICE ex:jobRegistry { ?s schema:jobTitle ?job } }
  UNION
  { SERVICE ex:socialNetwork { ?s schema:jobTitle ?job } }

  { SERVICE ex:jobRegistry { ?s schema:birthDate ?birthDate } }
  UNION
  { SERVICE ex:socialNetwork { ?s schema:birthDate ?birthDate } }
}`;

test("rejects a pair whose heads differ", async () => {
  const answer = await decideUcfqContainment(
    located("SELECT ?s WHERE { ?s schema:birthDate ?b }"),
    located("SELECT ?b WHERE { ?s schema:birthDate ?b }"),
    setSolver(true).decide,
  );

  expect(answer).toEqual({ value: "not contained" });
});

test("accepts a UCFQ against itself without consulting the solver", async () => {
  const solver = setSolver(false);
  const query = located(ESA);

  expect(await decideUcfqContainment(query, query, solver.decide)).toEqual({
    value: "contained",
  });
  expect(solver.calls.count).toBe(0);
});

test("rejects a UCFQ pair reading a pattern at another sub-federation", async () => {
  const solver = setSolver(true);
  const subQuery = located(`SELECT ?s ?job WHERE {
    { SERVICE ex:jobRegistry { ?s schema:jobTitle ?job } }
    UNION
    { SERVICE ex:socialNetwork { ?s schema:jobTitle ?job } }
  }`);
  const superQuery = located(`SELECT ?s ?job WHERE {
    { SERVICE ex:jobRegistry { ?s schema:jobTitle ?job } }
    UNION
    { SERVICE ex:library { ?s schema:jobTitle ?job } }
  }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, solver.decide),
  ).toEqual({ value: "not contained" });
  expect(solver.calls.count).toBe(0);
});

test("rejects an extra conjunct the bag can duplicate, which bag-set semantics accepts", async () => {
  const solver = setSolver(true);
  const subQuery = located(`SELECT ?s ?j WHERE {
    { SERVICE ex:jobRegistry { ?s schema:jobTitle ?j } }
    UNION
    { SERVICE ex:socialNetwork { ?s schema:jobTitle ?j } }

    { SERVICE ex:jobRegistry { ?s schema:name ?j } }
    UNION
    { SERVICE ex:socialNetwork { ?s schema:name ?j } }
  }`);
  const superQuery = located(`SELECT ?s ?j WHERE {
    { SERVICE ex:jobRegistry { ?s schema:jobTitle ?j } }
    UNION
    { SERVICE ex:socialNetwork { ?s schema:jobTitle ?j } }
  }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, solver.decide),
  ).toEqual({ value: "not contained" });
  expect(solver.calls.count).toBe(0);
});

test("answers unknown on a projecting pair the solver reports as set contained", async () => {
  const answer = await decideUcfqContainment(
    located(`SELECT ?s WHERE {
      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?j } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?j } }

      { SERVICE ex:jobRegistry { ?s schema:name ?n } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:name ?n } }
    }`),
    located(`SELECT ?s WHERE {
      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?x } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?x } }

      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?y } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?y } }
    }`),
    setSolver(true).decide,
  );

  expect(answer).toEqual({ value: "unknown" });
});

test("rejects a projecting pair the solver reports as not set contained", async () => {
  const answer = await decideUcfqContainment(
    located(`SELECT ?s WHERE {
      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?j } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?j } }

      { SERVICE ex:jobRegistry { ?s schema:name ?n } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:name ?n } }
    }`),
    located(`SELECT ?s WHERE {
      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?x } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?x } }

      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?y } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?y } }
    }`),
    setSolver(false).decide,
  );

  expect(answer).toEqual({ value: "not contained" });
});

test("carries an error of the solver to the caller", async () => {
  const failing: SetContainmentSolver = () =>
    Promise.resolve(error(new Error("z3 is not executable")));

  const answer = await decideUcfqContainment(
    located(`SELECT ?s WHERE {
      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?j } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?j } }

      { SERVICE ex:jobRegistry { ?s schema:name ?n } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:name ?n } }
    }`),
    located(`SELECT ?s WHERE {
      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?x } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?x } }

      { SERVICE ex:jobRegistry { ?s schema:jobTitle ?y } }
      UNION
      { SERVICE ex:socialNetwork { ?s schema:jobTitle ?y } }
    }`),
    failing,
  );

  expect(isError(answer)).toBe(true);
});
