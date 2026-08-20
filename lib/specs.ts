import { type SafePromise, result, error, isError } from "result-interface";
import { ContainerProcess } from "./container_process";
import { toSparql } from "./located_query";
import type { SetContainmentSolver, SetSolver } from "./SetContainmentSolver";
import type { LocatedQuery } from "./containment_mapping";

const SPECS_IMAGE = "specs";

/** SpeCS driven over a container, deciding set containment of located queries. */
export function specsSolver(container: ContainerProcess): SetSolver {
  const isContained: SetContainmentSolver = async (
    subQuery: LocatedQuery,
    superQuery: LocatedQuery,
  ) => {
    // -qc checks containment rather than subsumption; -rename lets the two
    // queries name their projection variables differently.
    const answered = await container.request(
      "-qc",
      "-rename",
      "-superquery",
      toSparql(superQuery),
      "-subquery",
      toSparql(subQuery),
    );

    if (isError(answered)) {
      return answered;
    }

    // "unsat" means the containment holds, "sat" that a counter-model exists.
    switch (answered.value) {
      case "unsat":
        return result(true);
      case "sat":
        return result(false);
      default:
        return error(
          new Error(
            `${SPECS_IMAGE} produced an unknown verdict: "${answered.value}"`,
          ),
        );
    }
  };

  return { isContained, close: () => container.close() };
}

/** Starts SpeCS and keeps it alive. */
export async function startSpecs(
  image: string = SPECS_IMAGE,
): SafePromise<SetSolver> {
  const started = await ContainerProcess.start(image);

  if (isError(started)) {
    return started;
  }

  return result(specsSolver(started.value));
}
