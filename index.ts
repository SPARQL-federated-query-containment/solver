import { program } from "commander";
import { isError } from "result-interface";
import { startQCan } from "./lib/canonicalize";
import { locate } from "./lib/located_query";
import { decideSetContainment } from "./lib/federated_containment";
import { decideUcfqContainment } from "./lib/ucfq_containment";
import { startSpecs } from "./lib/specs";
import { assign } from "./lib/util_cli";

program
  .description(
    "Determine the containment of two federated SPARQL queries under the semantic SPARQL evaluates.",
  )
  .argument("<string>", "subquery")
  .argument("<string>", "superquery")
  .option("-c, --canonicalise", "decide on the canonical form of the queries")
  .option(
    "--federation-sub <members>",
    "comma separated federation the subquery is evaluated over",
  )
  .option(
    "--federation-super <members>",
    "comma separated federation the superquery is evaluated over",
  )
  .version("0.0.0");

program.parse();

let [subQuery, superQuery] = program.args;

if (subQuery === undefined || superQuery === undefined) {
  program.help({ error: true });
}

const canonicalising = program.opts().canonicalise === true;

const [qcanResult, specsResult] = await Promise.all([
  canonicalising ? startQCan() : undefined,
  startSpecs(),
]);

async function close(): Promise<void> {
  if (qcanResult !== undefined && !isError(qcanResult)) {
    await qcanResult.value.close();
  }

  if (!isError(specsResult)) {
    await specsResult.value.close();
  }
}

if (qcanResult !== undefined && isError(qcanResult)) {
  await close();
  console.error(qcanResult.error.message);
  process.exit(1);
}

if (isError(specsResult)) {
  await close();
  console.error(specsResult.error.message);
  process.exit(1);
}

if (qcanResult !== undefined) {
  const canonicalSubQueryResult = await qcanResult.value.canonicalise(subQuery);
  const canonicalSuperQueryResult =
    await qcanResult.value.canonicalise(superQuery);

  if (isError(canonicalSubQueryResult)) {
    await close();
    console.error(`subquery: ${canonicalSubQueryResult.error.message}`);
    process.exit(2);
  }

  if (isError(canonicalSuperQueryResult)) {
    await close();
    console.error(`superquery: ${canonicalSuperQueryResult.error.message}`);
    process.exit(2);
  }

  if (canonicalSubQueryResult.value === canonicalSuperQueryResult.value) {
    await close();
    console.log("contained");
    process.exit(0);
  }

  subQuery = canonicalSubQueryResult.value;
  superQuery = canonicalSuperQueryResult.value;
}

const subQueryResult = locate(subQuery);
const superQueryResult = locate(superQuery);

if (isError(subQueryResult)) {
  await close();
  console.error(`subquery: ${subQueryResult.error.message}`);
  process.exit(2);
}

if (isError(superQueryResult)) {
  await close();
  console.error(`superquery: ${superQueryResult.error.message}`);
  process.exit(2);
}

const options = program.opts<{
  federationSub?: string;
  federationSuper?: string;
}>();

const subFederated = assign(subQueryResult.value, options.federationSub);
const superFederated = assign(superQueryResult.value, options.federationSuper);

if (isError(subFederated)) {
  await close();
  console.error(`subquery: ${subFederated.error.message}`);
  process.exit(2);
}

if (isError(superFederated)) {
  await close();
  console.error(`superquery: ${superFederated.error.message}`);
  process.exit(2);
}

// A virtual member holds a BKG, so a pair holding one is decided under bag
// semantics and any other under bag-set semantics.
const decide =
  subFederated.value.semantics === "bag" ||
  superFederated.value.semantics === "bag"
    ? decideUcfqContainment
    : decideSetContainment;

const containmentResult = await decide(
  subFederated.value,
  superFederated.value,
  specsResult.value.isContained,
);

await close();

if (isError(containmentResult)) {
  console.error(containmentResult.error.message);
  process.exit(1);
}

console.log(containmentResult.value);
