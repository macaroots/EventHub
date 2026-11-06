import assert from "node:assert/strict";
import { test } from "node:test";
import { documentedRoutes, routerRoutes } from "../../shared/test/openapi-coverage.js";
import { EventController } from "../src/application/event.controller.js";
import { ActivityController } from "../src/application/activity.controller.js";

// As rotas vêm dos routers reais: o CrudController gera o CRUD em tempo de execução.
test("every route is documented in openapi.yaml and vice versa", () => {
  const events = new EventController({}), activities = new ActivityController({});
  const code = new Set([...routerRoutes(events.getPublicRouter()), ...routerRoutes(events.getRouter()), ...routerRoutes(activities.getRouter())]);
  const spec = new URL("../src/openapi.yaml", import.meta.url).pathname;
  assert.deepEqual([...documentedRoutes(spec)].sort(), [...code].sort());
});
