import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { User } from "../src/domain/user.js";
import { UserSqliteRepository } from "../src/infrastructure/user.sqlite.repository.js";

test("should persist user with password and find by username", () => {
  const repository = new UserSqliteRepository(new DatabaseSync(":memory:"));
  const user = new User("ana", "123", "admin");
  repository.add(user);
  const loaded = repository.getByUsername("ana");
  assert.ok(loaded instanceof User);
  assert.deepEqual([loaded.id, loaded.password, loaded.role], [user.id, "123", "admin"]);
  assert.equal(repository.getByUsername("bia"), undefined);
  assert.throws(() => repository.add(new User("ana", "456")), /UNIQUE/);
});
