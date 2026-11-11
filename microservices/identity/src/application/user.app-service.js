import { User } from '../domain/user.js';

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };

export class UserAppService {
    constructor(repository, hasher, tokens) {
        Object.assign(this, { repository, hasher, tokens });
    }
    async register({ name, username, email, password }, requestId) {
        const user = new User({ name: name.trim(), username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), passwordHash: await this.hasher.hash(password) });
        await this.repository.transaction(async repository => {
            await repository.add(user);
            await repository.publish('UserRegistered', this.eventData(user), requestId);
        });
        return user.toJSON();
    }
    async login({ username, password }) {
        const login = username.trim().toLowerCase();
        const user = await (login.includes('@') ? this.repository.getByEmail(login) : this.repository.getByUsername(login));
        if (!user?.active || !await this.hasher.compare(password, user.passwordHash)) fail(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos');
        return { token: this.tokens.sign({ userId: user.id, name: user.name }), expiresIn: this.tokens.expiresInSeconds() };
    }
    eventData(user) {
        return { userId: user.id, name: user.name, username: user.username, email: user.email };
    }
    async requireUser(id) {
        const user = await this.repository.getById(id);
        if (!user?.active) fail(404, 'USER_NOT_FOUND', 'Usuário não encontrado');
        return user;
    }
    async getMe(id) { return (await this.requireUser(id)).toJSON(); }
    async getInternalById(id) { return this.getMe(id); }
    async findInternalByEmail(email) { return (await this.repository.findByEmail(email)).map(user => user.toJSON()); }
    async findInternalByIds(ids) { return (await this.repository.findByIds(ids)).map(user => user.toJSON()); }
    async updateMe(id, changes, requestId) {
        const user = await this.requireUser(id);
        if (changes.name !== undefined) user.name = changes.name.trim();
        if (changes.email !== undefined) user.email = changes.email.trim().toLowerCase();
        await this.repository.transaction(async repository => {
            await repository.update(user);
            await repository.publish('UserUpdated', this.eventData(user), requestId);
        });
        return user.toJSON();
    }
    async changePassword(id, { currentPassword, newPassword }) {
        const user = await this.requireUser(id);
        if (!await this.hasher.compare(currentPassword, user.passwordHash)) fail(401, 'INVALID_CREDENTIALS', 'Senha atual inválida');
        user.passwordHash = await this.hasher.hash(newPassword);
        await this.repository.update(user);
    }
    async deactivateMe(id, requestId) {
        const user = await this.requireUser(id);
        user.active = false;
        await this.repository.transaction(async repository => {
            await repository.update(user);
            await repository.publish('UserDeactivated', this.eventData(user), requestId);
        });
    }
}