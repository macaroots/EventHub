import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { documentedRoutes, sourceRoutes } from "../../shared/test/openapi-coverage.js";

test("every route is documented in openapi.yaml and vice versa", () => {
  const src = fileURLToPath(new URL("../src", import.meta.url));
  assert.deepEqual([...documentedRoutes(`${src}/openapi.yaml`)].sort(), [...sourceRoutes(src)].sort());
});
