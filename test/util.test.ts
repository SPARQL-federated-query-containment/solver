import { test, expect } from "bun:test";
import { isError, isResult } from "result-interface";
import { ensureDockerImage } from "../lib/util";

test("accepts an image that is already built", async () => {
  expect(isResult(await ensureDockerImage("specs"))).toBe(true);
});

test("reports an image it can neither find nor build", async () => {
  const built = await ensureDockerImage("no-such-image-for-a-test");

  expect(isError(built)).toBe(true);
});
