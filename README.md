# solver

Decides whether a federated SPARQL query is contained in another, under bag-set semantics (the semantics of SPARQL) rather than set semantics.
A verdict is one of `contained`, `not contained`, `unknown`, `timeout` or `out of memory`.

## Requirements

- [Bun](https://bun.com)
- [Docker](https://www.docker.com/)

```bash
git clone --recurse-submodules git@github.com:SPARQL-federated-query-containment/solver.git
cd solver
bun install
```

The required Docker images are only built when they are missing.
After updating a submodule, rebuild them yourself with:

```bash
docker build -t specs specs
docker build -t qcan qcan
```

## Command line

```console
$ bun run index.ts --help

Usage: index [options] <subquery> <superquery>

Determine the containment of two federated SPARQL queries under the semantic SPARQL evaluates.

Arguments:
  subquery                      subquery, or a path to a file holding it with --file
  superquery                    superquery, or a path to a file holding it with --file

Options:
  -c, --canonicalise            decide on the canonical form of the queries
  -f, --file                    read the subquery and superquery arguments as paths to files holding them, instead of inline text
  --federation-sub <members>    comma separated federation the subquery is evaluated over
  --federation-super <members>  comma separated federation the superquery is evaluated over
  --z3-timeout <seconds>        z3 timeout inside the SpeCS
  --z3-memory <mb>              z3 virtual memory limit inside the SpeCS
  --engine <bfc|specs>          bfc, the bag-set engine, or specs, the set engine, directly (default: "bfc")
  -V, --version                 output the version number
  -h, --help                    display help for command
```

The verdict is printed on stdout. The exit code is `0` when a verdict is
printed, `1` when the solver fails, and `2` when the input is invalid.

### Examples

A person with a job title is a person with a birth date, so the subquery is
contained under set semantics. It is not contained under bag-set semantics,
because each job title repeats the `?s ?birthDate` solution:

```console
$ SUB='PREFIX schema: <http://schema.org/>
SELECT ?s ?birthDate WHERE { ?s schema:jobTitle ?job ; schema:birthDate ?birthDate . }'
$ SUP='PREFIX schema: <http://schema.org/>
SELECT ?s ?birthDate WHERE { ?s schema:birthDate ?birthDate . }'

$ bun run index.ts "$SUB" "$SUP"
not contained

$ bun run index.ts --engine specs "$SUB" "$SUP"
contained
```

Here the same pair is evaluated over a federation of two members using automatic source selection:

```console
$ FED=http://example.org/jobRegistry,http://example.org/socialNetwork
$ bun run index.ts --federation-sub "$FED" --federation-super "$FED" "$SUB" "$SUP"
unknown
```

From files, where `sub.rq` and `super.rq` hold the two queries above:

```console
$ bun run index.ts --file sub.rq super.rq
not contained
```

An invalid query is reported on stderr with exit code `2`:

```console
$ bun run index.ts 'SELECT' 'x'
subquery: the query does not parse: Error: Parse error
Expecting: one of these possible Token sequences:
  1. [*]
  2. [Var1]
  3. [Var2]
  4. [(]
but found: ''
$ echo $?
2
```

## Library


```ts
import { isError } from "result-interface";
import { locate } from "./lib/located_query";
import { assign } from "./lib/util_cli";
import { decideBagSetContainment } from "./lib/bag_set_containment";
import { decideUcfqContainment } from "./lib/ucfq_containment";
import { specsIsContained } from "./lib/specs";

// 1. Parse a federated CQ into its located form.
const sub = locate(`PREFIX schema: <http://schema.org/>
  SELECT ?s ?birthDate WHERE { ?s schema:jobTitle ?job ; schema:birthDate ?birthDate . }`);
const sup = locate(`PREFIX schema: <http://schema.org/>
  SELECT ?s ?birthDate WHERE { ?s schema:birthDate ?birthDate . }`);
if (isError(sub) || isError(sup)) throw new Error("not a federated CQ");

// 2. Optionally evaluate it over a federation (undefined keeps it as written).
const federation = "http://example.org/jobRegistry,http://example.org/socialNetwork";
const subFederated = assign(sub.value, federation);
const supFederated = assign(sup.value, federation);
if (isError(subFederated) || isError(supFederated)) {
  throw new Error("invalid federation");
}

// 3. A pattern over several members puts the pair under bag semantics.
const decide =
  subFederated.value.semantics === "bag" || supFederated.value.semantics === "bag"
    ? decideUcfqContainment
    : decideBagSetContainment;

const verdict = await decide(subFederated.value, supFederated.value, specsIsContained);
console.log(isError(verdict) ? verdict.error.message : verdict.value); // unknown
```

Other entry points:

- `canonicalise(query)` in `lib/canonicalize.ts` returns QCan's canonical form
  of a query string.
- `specsIsContained(sub, sup, z3TimeoutSeconds?, z3MemoryMb?)` in `lib/specs.ts`
  decides using set containment.

## Development

```bash
bun test            # tests
bun run typecheck   # tsc --noEmit
bun run lint        # eslint
bun scripts/validate_query.ts <query files or globs>   # report which queries are in the supported fragment
```
