import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { EventSqliteRepository } from '../src/infrastructure/event.sqlite.repository.js';
import { EventAppService } from '../src/application/event.app-service.js';
import { InMemoryMessageBus } from '../../shared/messaging/in-memory-message-bus.js';

test('local do evento é salvo e exibido no catálogo público', async () => {
 const db = new DatabaseSync(':memory:');
 // Banco legado, anterior à coluna location.
 db.exec(`CREATE TABLE events(id TEXT PRIMARY KEY,name TEXT NOT NULL,information TEXT,startDate TEXT,endDate TEXT,status TEXT NOT NULL,cancelReason TEXT,createdBy TEXT NOT NULL,organizers TEXT NOT NULL) STRICT`);
 const repo = new EventSqliteRepository(db);
 const service = new EventAppService(repo,{listByEvent:()=>[{id:'a1',name:'Oficina',capacity:10,price:0,rules:[]}]},new InMemoryMessageBus());
 const user = {id:'u1'};
 const id = await service.create({name:'Evento',location:'Auditório central',startDate:'2030-01-01'}, user);
 assert.equal((await service.get(id,user)).location,'Auditório central');
 await service.update(id,{location:'Sala 2'},user);
 await service.publish(id,user);
 assert.equal((await service.getPublished(id)).location,'Sala 2');
 assert.equal((await service.listPublished())[0].location,'Sala 2');
 db.close();
});
