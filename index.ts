import { program } from "commander";
import { isError } from "result-interface";
import { canonicalise } from "./lib/canonicalize";
import { locate } from "./lib/located_query";
import { decideBagSetContainment } from "./lib/bag_set_containment";
import { decideUcfqContainment } from "./lib/ucfq_containment";
import { specsIsContained } from "./lib/specs";
import type { ContainmentSolver } from "./lib/containment_solver";
import { assign } from "./lib/util_cli";

program
  .description(
    "Determine the containment of two federated SPARQL queries under the semantic SPARQL evaluates.",
  )
  .argument("<subquery>", "subquery, or a path to a file holding it with --file")
  .argument("<superquery>", "superquery, or a path to a file holding it with --file")
  .option("-c, --canonicalise", "decide on the canonical form of the queries")
  .option(
    "-f, --file",
    "read the subquery and superquery arguments as paths to files holding them, instead of inline text",
  )
  .option(
    "--federation-sub <members>",
    "comma separated federation the subquery is evaluated over",
  )
  .option(
    "--federation-super <members>",
    "comma separated federation the superquery is evaluated over",
  )
  .option("--z3-timeout <seconds>", "z3 timeout inside the SpeCS", Number)
  .option("--z3-memory <mb>", "z3 virtual memory limit inside the SpeCS", Number)
  .option("--engine <bfc|specs>", "bfc, the bag-set engine, or specs, the set engine, directly", "bfc")
  .version("0.0.0");

program.parse();

let [subQuery, superQuery] = program.args;

if (subQuery === undefined || superQuery === undefined) {
  program.help({ error: true });
}

const opts = program.opts<{
  canonicalise?: boolean;
  file?: boolean;
  federationSub?: string;
  federationSuper?: string;
  z3Timeout?: number;
  z3Memory?: number;
  engine: string;
}>();

const canonicalising = opts.canonicalise === true;
const { federationSub, federationSuper, z3Timeout, z3Memory, engine } = opts;

if (engine !== "bfc" && engine !== "specs") {
  console.error(`--engine must be "bfc" or "specs", got "${engine}"`);
  process.exit(2);
}

if (opts.file === true) {
  try {
    [subQuery, superQuery] = await Promise.all([
      Bun.file(subQuery).text(),
      Bun.file(superQuery).text(),
    ]);
  } catch (thrown) {
    console.error(`--file: ${(thrown as Error).message}`);
    process.exit(2);
  }
}

const setContained: ContainmentSolver = (sub, superQuery) =>
  specsIsContained(sub, superQuery, z3Timeout, z3Memory);

if (canonicalising) {
  const canonicalSubQueryResult = await canonicalise(subQuery);
  const canonicalSuperQueryResult = await canonicalise(superQuery);

  if (isError(canonicalSubQueryResult)) {
    console.error(`subquery: ${canonicalSubQueryResult.error.message}`);
    process.exit(2);
  }

  if (isError(canonicalSuperQueryResult)) {
    console.error(`superquery: ${canonicalSuperQueryResult.error.message}`);
    process.exit(2);
  }

  if (canonicalSubQueryResult.value === canonicalSuperQueryResult.value) {
    console.log("contained");
    process.exit(0);
  }

  subQuery = canonicalSubQueryResult.value;
  superQuery = canonicalSuperQueryResult.value;
}

const subQueryResult = locate(subQuery);
const superQueryResult = locate(superQuery);

if (isError(subQueryResult)) {
  console.error(`subquery: ${subQueryResult.error.message}`);
  process.exit(2);
}

if (isError(superQueryResult)) {
  console.error(`superquery: ${superQueryResult.error.message}`);
  process.exit(2);
}

const subFederated = assign(subQueryResult.value, federationSub);
const superFederated = assign(superQueryResult.value, federationSuper);

if (isError(subFederated)) {
  console.error(`subquery: ${subFederated.error.message}`);
  process.exit(2);
}

if (isError(superFederated)) {
  console.error(`superquery: ${superFederated.error.message}`);
  process.exit(2);
}

// A virtual member holds a BKG, so a pair holding one is decided under bag
// semantics and any other under bag-set semantics.
const decide =
  subFederated.value.semantics === "bag" ||
  superFederated.value.semantics === "bag"
    ? decideUcfqContainment
    : decideBagSetContainment;

const containmentResult =
  engine === "specs"
    ? await setContained(subFederated.value, superFederated.value)
    : await decide(subFederated.value, superFederated.value, setContained);

if (isError(containmentResult)) {
  console.error(containmentResult.error.message);
  process.exit(1);
}

console.log(containmentResult.value);
