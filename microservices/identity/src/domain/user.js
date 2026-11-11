import { randomUUID } from 'node:crypto';

export class User {
    constructor({ id = randomUUID(), name, username, email, passwordHash, active = true, createdAt = new Date().toISOString() }) {
        Object.assign(this, { id, name, username, email, passwordHash, active, createdAt });
    }
    toJSON() {
        const { id, name, username, email, active, createdAt } = this;
        return { id, name, username, email, active, createdAt };
    }
}