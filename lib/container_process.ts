import type { ReadableStreamDefaultReader } from "node:stream/web";
import { type SafePromise, result, error, isError } from "result-interface";
import { ensureDockerImage } from "./util";

const encode = (field: string) => Buffer.from(field, "utf8").toString("base64");
const decode = (field: string) => Buffer.from(field, "base64").toString("utf8");

/**
 * A solver kept alive in a container, one request per line on stdin and one
 * response per line on stdout, with base64 fields so that a multi-line SPARQL
 * query survives the framing.
 */
type Piped = Bun.Subprocess<"pipe", "pipe", "pipe">;

export class ContainerProcess {
  private stdout: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  private decoder = new TextDecoder();
  private pending = "";
  private diagnostics = "";
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly image: string,
    private readonly proc: Piped,
  ) {
    this.stdout = proc.stdout.getReader();
    void this.drainStderr();
  }

  static async start(image: string): SafePromise<ContainerProcess> {
    const built = await ensureDockerImage(image);

    if (isError(built)) {
      return built;
    }

    return result(
      ContainerProcess.spawn(["docker", "run", "--rm", "-i", image], image),
    );
  }

  // Any command speaking the protocol, which lets the protocol be tested
  // without a container.
  static spawn(command: string[], name: string): ContainerProcess {
    const proc = Bun.spawn(command, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    return new ContainerProcess(name, proc);
  }

  // Serialised: specs writes formula.smt into its working directory, so
  // parallel requests to one process would race on it.
  request(...fields: string[]): SafePromise<string> {
    const answered = this.queue.then(() => this.exchange(fields));
    this.queue = answered.then(
      () => undefined,
      () => undefined,
    );
    return answered;
  }

  async close(): Promise<void> {
    await this.proc.stdin.end();
    this.proc.kill();
    await this.proc.exited;
  }

  private async exchange(fields: string[]): SafePromise<string> {
    await this.proc.stdin.write(`${fields.map(encode).join(" ")}\n`);
    await this.proc.stdin.flush();

    const line = await this.readLine();

    if (line === null) {
      return error(
        Error(`${this.image} closed its output:\n${this.diagnostics.trim()}`),
      );
    }

    const [status, payload] = line.split(" ", 2);

    switch (status) {
      case "OK":
        return result(decode(payload ?? ""));
      case "ERR":
        return error(Error(`${this.image}: ${decode(payload ?? "")}`));
      default:
        return error(
          Error(`${this.image} produced an unframed response: "${line}"`),
        );
    }
  }

  private async readLine(): Promise<string | null> {
    for (;;) {
      const end = this.pending.indexOf("\n");

      if (end !== -1) {
        const line = this.pending.slice(0, end);
        this.pending = this.pending.slice(end + 1);
        return line;
      }

      const { done, value } = await this.stdout.read();

      if (done) {
        return null;
      }

      this.pending += this.decoder.decode(value, { stream: true });
    }
  }

  // Left undrained, the stderr pipe fills and blocks the container. Diagnostics
  // are best-effort, so a broken stream must not reject into the caller.
  private async drainStderr(): Promise<void> {
    const decoder = new TextDecoder();

    try {
      for await (const chunk of this.proc.stderr) {
        this.diagnostics = (
          this.diagnostics + decoder.decode(chunk, { stream: true })
        ).slice(-4096);
      }
    } catch {
      this.diagnostics = `${this.diagnostics}\n${this.image} closed its diagnostics`;
    }
  }
}
