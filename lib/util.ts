import { Parser } from "@traqula/parser-sparql-1-1";
import { AlgebraFactory } from "@traqula/algebra-transformations-1-1";
import { Generator } from "@traqula/generator-sparql-1-1";
import { type SafePromise, result, error } from "result-interface";

export const FACTORY: AlgebraFactory = new AlgebraFactory();
export const GENERATOR: Generator = new Generator();
export const PARSER = new Parser();

export async function ensureDockerImage(image: string): SafePromise<undefined> {
  const inspect = await Bun.$`docker image inspect ${image}`.nothrow().quiet();

  if (inspect.exitCode === 0) {
    return result();
  }

  const context = `${import.meta.dir}/../${image}`;

  const build = await Bun.$`docker build -t ${image} ${context}`
    .nothrow()
    .quiet();

  if (build.exitCode !== 0) {
    return error(
      new Error(`docker build ${image} failed:\n${build.stderr.toString()}`),
    );
  }
  return result();
}
