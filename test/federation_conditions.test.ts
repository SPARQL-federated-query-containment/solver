import { test, expect } from "bun:test";
import { isError } from "result-interface";
import {
  subQueryContactsEveryMember,
  extraMembersBindNoFreshVariable,
  federationOf,
  fresh,
} from "../lib/federation_conditions";
import { locate, LOCAL_MEMBER } from "../lib/located_query";

const PREFIX = `PREFIX schema: <http://schema.org/> PREFIX ex: <http://example.org/>`;
const REGISTRY = "http://example.org/jobRegistry";
const NETWORK = "http://example.org/socialNetwork";

function located(query: string) {
  const form = locate(`${PREFIX} ${query}`);

  if (isError(form)) {
    throw form.error;
  }

  return form.value;
}

// The two pairs of the figure on the extra member of a contained query, where
// the contained query reads the job at the registry and the containing one
// does not read it at all (a) or reads it locally (b).
const PROJECTED_SUB = located(`SELECT ?s ?birthDate WHERE {
  ?s schema:birthDate ?birthDate .
  SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
}`);

const PROJECTED_SUPER = located(`SELECT ?s ?birthDate WHERE {
  ?s schema:birthDate ?birthDate .
}`);

const IN_HEAD_SUB = located(`SELECT ?s ?birthDate ?job WHERE {
  ?s schema:birthDate ?birthDate .
  SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
}`);

const IN_HEAD_SUPER = located(`SELECT ?s ?birthDate ?job WHERE {
  ?s schema:birthDate ?birthDate ;
     schema:jobTitle ?job .
}`);

test("reads the federation off the locations of the body", () => {
  expect(federationOf(PROJECTED_SUB)).toEqual(
    new Set([LOCAL_MEMBER, REGISTRY]),
  );
});

test("a variable a member binds alone and the head discards is fresh", () => {
  expect(fresh(PROJECTED_SUB, REGISTRY)).toEqual(new Set(["job"]));
});

test("a distinguished variable is not fresh", () => {
  expect(fresh(IN_HEAD_SUB, REGISTRY)).toEqual(new Set());
});

test("a variable another member also binds is not fresh", () => {
  const query = located(`SELECT ?s WHERE {
    ?job schema:name ?name .
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
  }`);

  expect(fresh(query, REGISTRY)).toEqual(new Set());
});

test("a member the query does not contact binds nothing", () => {
  expect(fresh(PROJECTED_SUB, NETWORK)).toEqual(new Set());
});

test("the member queried locally binds fresh variables like any other", () => {
  const query = located(`SELECT ?s WHERE {
    ?s schema:birthDate ?birthDate .
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
  }`);

  expect(fresh(query, LOCAL_MEMBER)).toEqual(new Set(["birthDate"]));
});

test("rejects a containing query contacting a member the contained one does not", () => {
  expect(subQueryContactsEveryMember(PROJECTED_SUPER, PROJECTED_SUB)).toBe(false);
});

test("accepts a contained query contacting a member the containing one does not", () => {
  expect(subQueryContactsEveryMember(PROJECTED_SUB, PROJECTED_SUPER)).toBe(true);
});

test("accepts a pair contacting the same members", () => {
  expect(subQueryContactsEveryMember(PROJECTED_SUB, PROJECTED_SUB)).toBe(true);
});

test("rejects an extra member binding a variable the head discards", () => {
  expect(
    extraMembersBindNoFreshVariable(PROJECTED_SUB, PROJECTED_SUPER),
  ).toBe(false);
});

test("accepts an extra member whose variable the head keeps", () => {
  expect(extraMembersBindNoFreshVariable(IN_HEAD_SUB, IN_HEAD_SUPER)).toBe(
    true,
  );
});

test("accepts an extra member binding only variables bound elsewhere", () => {
  const subQuery = located(`SELECT ?s ?birthDate WHERE {
    ?s schema:birthDate ?birthDate .
    SERVICE ex:jobRegistry { ?s schema:knows ?birthDate }
  }`);

  expect(
    extraMembersBindNoFreshVariable(subQuery, PROJECTED_SUPER),
  ).toBe(true);
});

test("accepts a pair with no extra member", () => {
  expect(
    extraMembersBindNoFreshVariable(PROJECTED_SUB, PROJECTED_SUB),
  ).toBe(true);
});

test("gathers two SERVICE clauses on one endpoint into a single member", () => {
  const query = located(`SELECT ?s WHERE {
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
    SERVICE ex:jobRegistry { ?job schema:name ?name }
  }`);

  expect(federationOf(query)).toEqual(new Set([REGISTRY]));
  expect(fresh(query, REGISTRY)).toEqual(new Set(["job", "name"]));
});

test("rejects one extra member among several when it binds a fresh variable", () => {
  const subQuery = located(`SELECT ?s ?birthDate WHERE {
    ?s schema:birthDate ?birthDate .
    SERVICE ex:socialNetwork { ?s schema:birthDate ?birthDate }
    SERVICE ex:jobRegistry { ?s schema:jobTitle ?job }
  }`);

  expect(
    extraMembersBindNoFreshVariable(subQuery, PROJECTED_SUPER),
  ).toBe(false);
});
