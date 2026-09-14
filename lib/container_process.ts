import { type SafePromise, result, error, isError } from "result-interface";
import { ensureDockerImage } from "./util";

const encode = (field: string) => Buffer.from(field, "utf8").toString("base64");
const decode = (field: string) => Buffer.from(field, "base64").toString("utf8");

export interface ContainerOptions {
  z3TimeoutSeconds?: number;
  z3MemoryMb?: number;
  name?: string;
}

export async function runCommand(
  command: string[],
  name: string,
  fields: string[],
): SafePromise<string> {
  const proc = Bun.spawn(command, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.stdin.write(`${fields.map(encode).join(" ")}\n`);
  await proc.stdin.end();

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  if (stdout.length === 0) {
    return error(new Error(`${name} closed its output:\n${stderr.trim()}`));
  }

  const line = stdout.split("\n", 1)[0] ?? "";
  const [status, payload] = line.split(" ", 2);

  switch (status) {
    case "OK":
      return result(decode(payload ?? ""));
    case "ERR":
      return error(Error(`${name}: ${decode(payload ?? "")}`));
    default:
      return error(
        Error(`${name} produced an unframed response: "${line}"`),
      );
  }
}

export async function runContainer(
  image: string,
  fields: string[],
  options: ContainerOptions = {},
): SafePromise<string> {
  const built = await ensureDockerImage(image);

  if (isError(built)) {
    return built;
  }

  const env: string[] = [];
  if (options.z3TimeoutSeconds !== undefined) {
    env.push("-e", `SPECS_Z3_TIMEOUT=${options.z3TimeoutSeconds.toFixed()}`);
  }
  if (options.z3MemoryMb !== undefined) {
    env.push("-e", `SPECS_Z3_MEMORY=${options.z3MemoryMb.toFixed()}`);
  }
  if (options.name !== undefined) {
    env.push("--name", options.name);
  }

  return runCommand(["docker", "run", "--rm", "-i", ...env, image], image, fields);
}
