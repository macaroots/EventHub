import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { currentUser } from '../src/middleware/authenticate.js';
test('account display never exposes generated identifiers as names', () => {
 process.env.JWT_SECRET = 'account-test-secret';
 const get = claims => currentUser({cookies:{token:jwt.sign(claims, process.env.JWT_SECRET)}});
 const id='86b71142ae7a446cbd9355c20e1508';
 assert.equal(get({userId:id,username:id,email:'gabriel@teste1.com'}).name,'gabriel');
 assert.equal(get({userId:id,name:id,username:'Gabriel',email:'gabriel@teste1.com'}).name,'Gabriel');
 assert.equal(get({userId:id,username:id}).name,'Usuário');
});
