import { test, expect } from "bun:test";
import { isError, result, error } from "result-interface";
import { decideUcfqContainment } from "../lib/ucfq_containment";
import { locate } from "../lib/located_query";
import type {
  SetContainmentResult,
  SetContainmentSolver,
} from "../lib/SetContainmentSolver";

const PREFIX = `PREFIX schema: <http://schema.org/> PREFIX ex: <http://example.org/>`;

function located(sparql: string) {
  const form = locate(`${PREFIX} ${sparql}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

function setSolver(verdict: SetContainmentResult) {
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
    setSolver("contained").decide,
  );

  expect(answer).toEqual({ value: "not contained" });
});

test("accepts a UCFQ against itself without consulting the solver", async () => {
  const solver = setSolver("not contained");
  const query = located(ESA);

  expect(await decideUcfqContainment(query, query, solver.decide)).toEqual({
    value: "contained",
  });
  expect(solver.calls.count).toBe(0);
});

test("rejects a UCFQ pair reading a pattern at another sub-federation", async () => {
  const solver = setSolver("contained");
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
  const solver = setSolver("contained");
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
    setSolver("contained").decide,
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
    setSolver("not contained").decide,
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

/** One clause read over a BKG, which is what makes the pair a bag one. */
const OVER_A_BKG = `{ SERVICE ex:a { ?x ex:p ?y } } UNION { SERVICE ex:b { ?x ex:p ?y } }`;

test("a conjunct read at one member does not rule out containment", async () => {
  // It is evaluated over that member's graph, a set, so it filters the
  // solutions of the contained query without duplicating any of them.
  const subQuery = located(`SELECT ?x ?y WHERE {
    ${OVER_A_BKG}
    SERVICE ex:a { ?x ex:q ?y }
  }`);
  const superQuery = located(`SELECT ?x ?y WHERE { ${OVER_A_BKG} }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, setSolver("contained").decide),
  ).toEqual(result("contained"));
});

test("a conjunct read over a BKG does rule it out, as it duplicates", async () => {
  const subQuery = located(`SELECT ?x ?y WHERE {
    ${OVER_A_BKG}
    { SERVICE ex:a { ?x ex:q ?y } } UNION { SERVICE ex:b { ?x ex:q ?y } }
  }`);
  const superQuery = located(`SELECT ?x ?y WHERE { ${OVER_A_BKG} }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, setSolver("contained").decide),
  ).toEqual(result("not contained"));
});

test("the containing query still has to answer for every solution", async () => {
  // Its clause reads another predicate, so no mapping places it at all and no
  // conjunct being duplicating makes up for that.
  const subQuery = located(`SELECT ?x ?y WHERE { ${OVER_A_BKG} }`);
  const superQuery = located(`SELECT ?x ?y WHERE {
    { SERVICE ex:a { ?x ex:other ?y } } UNION { SERVICE ex:b { ?x ex:other ?y } }
  }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, setSolver("contained").decide),
  ).toEqual(result("not contained"));
});
