import { type Result, type SafePromise, result, error, isError } from "result-interface";
import { runContainer } from "./container_process";
import { toSparql } from "./located_query";
import type { ContainmentResult } from "./containment_solver";
import type { LocatedQuery } from "./containment_mapping";

export const SPECS_IMAGE = "specs";

export function specsVerdictOf(value: string): Result<ContainmentResult> {
  // "unsat" means the containment holds
  switch (value) {
    case "unsat":
      return result("contained");
    case "sat":
      return result("not contained");
    case "timeout":
      return result("timeout");
    case "unknown":
      return result("unknown");
    case "out of memory":
      return result("out of memory");
    default:
      return error(new Error(`${SPECS_IMAGE} produced an unknown verdict: "${value}"`));
  }
}

export async function specsIsContained(
  subQuery: LocatedQuery,
  superQuery: LocatedQuery,
  z3TimeoutSeconds?: number,
  z3MemoryMb?: number,
): SafePromise<ContainmentResult> {
  // -qc checks containment rather than subsumption.
  const answered = await runContainer(
    SPECS_IMAGE,
    [
      "-qc",
      "-rename",
      "-superquery",
      toSparql(superQuery),
      "-subquery",
      toSparql(subQuery),
    ],
    { z3TimeoutSeconds, z3MemoryMb, name: SPECS_IMAGE },
  );

  if (isError(answered)) {
    return answered;
  }

  return specsVerdictOf(answered.value);
}
