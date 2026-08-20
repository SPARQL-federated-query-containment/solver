import { type SafePromise, result, isError } from "result-interface";
import { ContainerProcess } from "./container_process";

const QCAN_IMAGE = "qcan";

export interface Canonicaliser {
  canonicalise(query: string): SafePromise<string>;
  close(): Promise<void>;
}

/**
 * QCan driven over a container, rewriting a query into a canonical form, so
 * that two equivalent queries can be recognised by comparing strings.
 */
export function qcanCanonicaliser(container: ContainerProcess): Canonicaliser {
  return {
    async canonicalise(query: string): SafePromise<string> {
      const answered = await container.request("-q", query);

      if (isError(answered)) {
        return answered;
      }

      return result(answered.value);
    },
    close: () => container.close(),
  };
}

/** Starts QCan and keeps it alive. */
export async function startQCan(
  image: string = QCAN_IMAGE,
): SafePromise<Canonicaliser> {
  const started = await ContainerProcess.start(image);

  if (isError(started)) {
    return started;
  }

  return result(qcanCanonicaliser(started.value));
}
