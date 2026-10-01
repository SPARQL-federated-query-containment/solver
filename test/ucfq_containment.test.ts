import { test, expect } from "bun:test";
import { isError, result, error } from "result-interface";
import { decideUcfqContainment } from "../lib/ucfq_containment";
import { locate } from "../lib/located_query";
import type {
  ContainmentResult,
  ContainmentSolver,
} from "../lib/containment_solver";

const PREFIX = `PREFIX schema: <http://schema.org/> PREFIX ex: <http://example.org/>`;

function located(sparql: string) {
  const form = locate(`${PREFIX} ${sparql}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

function setSolver(verdict: ContainmentResult) {
  const calls = { count: 0 };

  const decide: ContainmentSolver = () => {
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
  const solver = setSolver("not contained");
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
  expect(solver.calls.count).toBe(1);
});

test("leaves unknown an extra conjunct the bag can duplicate, which set containment accepts", async () => {
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
  ).toEqual({ value: "unknown" });
  expect(solver.calls.count).toBe(1);
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
  const failing: ContainmentSolver = () =>
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

test("a conjunct read over a BKG needs a cover, as it may duplicate", async () => {
  const subQuery = located(`SELECT ?x ?y WHERE {
    ${OVER_A_BKG}
    { SERVICE ex:a { ?x ex:q ?y } } UNION { SERVICE ex:b { ?x ex:q ?y } }
  }`);
  const superQuery = located(`SELECT ?x ?y WHERE { ${OVER_A_BKG} }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, setSolver("contained").decide),
  ).toEqual(result("unknown"));
});

test("accepts the example of the paper without a subgoals-onto mapping", async () => {
  // Section 6.2 of https://github.com/constraintAutomaton/Bag-Semantics-and-Query-Containment-in-SPARQL-Federation
  const subQuery = located(`SELECT * WHERE {
    ${OVER_A_BKG}
    SERVICE ex:c { ?x ex:q ?y }
  }`);
  const superQuery = located(`SELECT * WHERE { ${OVER_A_BKG} }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, setSolver("contained").decide),
  ).toEqual(result("contained"));
});

test("answers unknown, not 'not contained', when sub-federations overlap", async () => {
  // Contained, as (a + b) * c <= (a + c) * (b + c) for the members holding the
  // triple, yet no conjunct of the containing query covers the one at {a, b}.
  const subQuery = located(`SELECT * WHERE {
    ${OVER_A_BKG}
    SERVICE ex:c { ?x ex:p ?y }
  }`);
  const superQuery = located(`SELECT * WHERE {
    { SERVICE ex:a { ?x ex:p ?y } } UNION { SERVICE ex:c { ?x ex:p ?y } }
    { SERVICE ex:b { ?x ex:p ?y } } UNION { SERVICE ex:c { ?x ex:p ?y } }
  }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, setSolver("contained").decide),
  ).toEqual(result("unknown"));
});

test("the containing query still has to answer for every solution", async () => {
  // Its clause reads another predicate, so no mapping places it at all and no
  // conjunct being duplicating makes up for that.
  const subQuery = located(`SELECT ?x ?y WHERE { ${OVER_A_BKG} }`);
  const superQuery = located(`SELECT ?x ?y WHERE {
    { SERVICE ex:a { ?x ex:other ?y } } UNION { SERVICE ex:b { ?x ex:other ?y } }
  }`);

  expect(
    await decideUcfqContainment(subQuery, superQuery, setSolver("not contained").decide),
  ).toEqual(result("not contained"));
});
