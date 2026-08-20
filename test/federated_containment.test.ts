import { test, expect } from "bun:test";
import { isError, result, error } from "result-interface";
import { decideSetContainment } from "../lib/federated_containment";
import type { SetContainmentSolver } from "../lib/SetContainmentSolver";
import { locate } from "../lib/located_query";

const PREFIX = `PREFIX schema: <http://schema.org/> PREFIX ex: <http://example.org/>`;

function located(sparql: string) {
  const form = locate(`${PREFIX} ${sparql}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

/** A stand-in solver returning a fixed verdict and counting its calls. */
function setSolver(verdict: boolean) {
  const calls = { count: 0 };

  const decide: SetContainmentSolver = () => {
    calls.count += 1;
    return Promise.resolve(result(verdict));
  };

  return { decide, calls };
}

test("rejects a pair whose heads differ", async () => {
  const answer = await decideSetContainment(
    located("SELECT ?s WHERE { ?s schema:birthDate ?b }"),
    located("SELECT ?b WHERE { ?s schema:birthDate ?b }"),
    setSolver(true).decide,
  );

  expect(answer).toEqual({ value: "not contained" });
});

test("rejects on the federation before consulting the solver", async () => {
  const solver = setSolver(true);
  const answer = await decideSetContainment(
    located("SELECT ?s ?job WHERE { ?s schema:jobTitle ?job }"),
    located(
      "SELECT ?s ?job WHERE { SERVICE ex:jobRegistry { ?s schema:jobTitle ?job } }",
    ),
    solver.decide,
  );

  expect(answer).toEqual({ value: "not contained" });
  expect(solver.calls.count).toBe(0);
});

test("rejects on a fresh variable before consulting the solver", async () => {
  const solver = setSolver(true);
  const answer = await decideSetContainment(
    located(`SELECT ?s ?birthDate WHERE {
      ?s schema:birthDate ?birthDate .
      SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
    }`),
    located("SELECT ?s ?birthDate WHERE { ?s schema:birthDate ?birthDate }"),
    solver.decide,
  );

  expect(answer).toEqual({ value: "not contained" });
  expect(solver.calls.count).toBe(0);
});

test("rejects on the variable count before consulting the solver", async () => {
  const solver = setSolver(true);
  const answer = await decideSetContainment(
    located(`SELECT ?s WHERE {
      ?s schema:birthDate ?b .
      ?s schema:jobTitle ?j .
      ?s schema:name ?n .
    }`),
    located("SELECT ?s WHERE { ?s schema:birthDate ?b }"),
    solver.decide,
  );

  expect(answer).toEqual({ value: "not contained" });
  expect(solver.calls.count).toBe(0);
});

test("decides a projection-free pair without consulting the solver", async () => {
  const solver = setSolver(false);
  const answer = await decideSetContainment(
    located(`SELECT ?s ?b WHERE {
      ?s schema:birthDate ?b .
      ?s schema:knows ?b .
    }`),
    located("SELECT ?s ?b WHERE { ?s schema:birthDate ?b }"),
    solver.decide,
  );

  expect(answer).toEqual({ value: "contained" });
  expect(solver.calls.count).toBe(0);
});

test("rejects a projection-free pair holding no variable-onto mapping", async () => {
  const solver = setSolver(true);
  const answer = await decideSetContainment(
    located("SELECT ?s ?b WHERE { ?s schema:jobTitle ?b }"),
    located("SELECT ?s ?b WHERE { ?s schema:birthDate ?b }"),
    solver.decide,
  );

  expect(answer).toEqual({ value: "not contained" });
  expect(solver.calls.count).toBe(0);
});

test("answers with the solver when only the contained query is projection-free", async () => {
  const subQuery = located("SELECT ?s ?j WHERE { ?s schema:jobTitle ?j }");
  const superQuery = located(`SELECT ?s ?j WHERE {
    ?s schema:jobTitle ?j .
    ?s schema:knows ?k .
  }`);

  expect(
    await decideSetContainment(subQuery, superQuery, setSolver(false).decide),
  ).toEqual({ value: "not contained" });

  expect(
    await decideSetContainment(subQuery, superQuery, setSolver(true).decide),
  ).toEqual({ value: "contained" });
});

test("accepts a projecting pair that is set contained and variable-onto", async () => {
  const q = located(`SELECT ?s WHERE {
    ?s schema:jobTitle ?x .
    ?s schema:name ?n .
  }`);
  const solver = setSolver(true);

  expect(await decideSetContainment(q, q, solver.decide)).toEqual({
    value: "contained",
  });
  expect(solver.calls.count).toBe(1);
});

test("answers unknown on a projecting pair that is set contained without a variable-onto mapping", async () => {
  const answer = await decideSetContainment(
    located(`SELECT ?s WHERE {
      ?s schema:jobTitle ?j .
      ?s schema:name ?n .
    }`),
    located(`SELECT ?s WHERE {
      ?s schema:jobTitle ?x .
      ?s schema:jobTitle ?y .
      ?s schema:jobTitle ?z .
    }`),
    setSolver(true).decide,
  );

  expect(answer).toEqual({ value: "unknown" });
});

test("rejects a projecting pair the solver reports as not set contained", async () => {
  const answer = await decideSetContainment(
    located(`SELECT ?s WHERE {
      ?s schema:jobTitle ?j .
      ?s schema:name ?n .
    }`),
    located(`SELECT ?s WHERE {
      ?s schema:jobTitle ?x .
      ?s schema:jobTitle ?y .
      ?s schema:jobTitle ?z .
    }`),
    setSolver(false).decide,
  );

  expect(answer).toEqual({ value: "not contained" });
});

test("carries an error of the solver to the caller", async () => {
  const failing: SetContainmentSolver = () =>
    Promise.resolve(error(new Error("z3 is not executable")));

  const answer = await decideSetContainment(
    located("SELECT ?s WHERE { ?s schema:jobTitle ?j }"),
    located("SELECT ?s WHERE { ?s schema:jobTitle ?x }"),
    failing,
  );

  expect(isError(answer)).toBe(true);
});
