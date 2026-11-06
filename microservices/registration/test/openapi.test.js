import assert from "node:assert/strict";
import { test } from "node:test";
import { documentedRoutes, sourceRoutes } from "../../shared/test/openapi-coverage.js";

test("every route is documented in openapi.yaml and vice versa", () => {
  const src = new URL("../src", import.meta.url).pathname;
  assert.deepEqual([...documentedRoutes(`${src}/openapi.yaml`)].sort(), [...sourceRoutes(src)].sort());
});
