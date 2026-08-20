import { basename, dirname, join } from "node:path";
import { program } from "commander";
import { isError } from "result-interface";
import { locate } from "../lib/located_query";

program
  .description(
    "Report whether SPARQL queries lie in the fragment the procedures decide.",
  )
  .argument("<queries...>", "query files, or globs the shell did not expand")
  .version("0.0.0")
  .exitOverride((usage) => {
    process.exit(usage.exitCode === 0 ? 0 : 2);
  });

program.parse();

/**
 * The files an argument names, expanding it as a glob when it matches no file,
 * so that a quoted pattern works as well as one the shell expanded.
 */
async function filesOf(argument: string): Promise<string[]> {
  if (await Bun.file(argument).exists()) {
    return [argument];
  }

  const directory = dirname(argument);
  const matches = Array.from(
    new Bun.Glob(basename(argument)).scanSync({ cwd: directory }),
  ).sort();

  return matches.length === 0
    ? [argument]
    : matches.map((match) => join(directory, match));
}

const paths: string[] = [];

for (const argument of program.args) {
  paths.push(...(await filesOf(argument)));
}

let rejected = 0;
let unreadable = 0;

// The path is printed as given, so the first column can be fed straight to cp.
for (const path of paths) {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    console.error(`${path}\tunreadable`);
    unreadable += 1;
    continue;
  }

  const form = locate(await file.text());

  if (isError(form)) {
    console.log(`${path}\trejected\t${form.error.message}`);
    rejected += 1;
    continue;
  }

  console.log(`${path}\taccepted\t${form.value.semantics}`);
}

if (unreadable > 0) {
  process.exit(2);
}

process.exit(rejected > 0 ? 1 : 0);
