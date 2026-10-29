import assert from "node:assert/strict";
import { test } from "node:test";
import { MapRepository } from "../infrastructure/map.repository.js";

test("should throw duplicate error", async () => {
  const repository = new MapRepository();
  repository.add({id: 1, name: 'a'});
  
  assert.throws(() => repository.add({id: 1, name: 'a'}), /Duplicated id/);
  const items = repository.list();
  assert.equal(items.length, 1);
});

test("should get by id", async () => {
  const repository = new MapRepository();
  repository.add({id: 1, name: 'a'});
  const item = repository.getById(1);
  assert.equal(!!item, true);
  assert.equal(item.id, 1);
  assert.equal(item.name, 'a');
});
