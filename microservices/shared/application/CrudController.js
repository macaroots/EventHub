import express from 'express';
import { ForbiddenError, NotFoundError } from '../domain/errors.js';

// Adaptador HTTP -> app service. Não acessa o repositório: leitura também passa pelo
// service, que aplica autorização. Comandos que não são CRUD (publicar, cancelar...)
// entram como rotas extras em subclasses (ver addRoutes).
export class CrudController {
    constructor(service) {
        this.service = service;
    }
    getRouter() {
        const router = express.Router();
        this.addRoutes(router);
        router.post('/', this.handle(this.create));
        router.get('/', this.handle(this.list));
        router.get('/:id', this.handle(this.get));
        router.patch('/:id', this.handle(this.update));
        router.delete('/:id', this.handle(this.delete));
        return router;
    }
    addRoutes(router) {}

    // NotFoundError -> 404; ForbiddenError -> 403; demais erros de domínio -> 400.
    handle(fn) {
        return async (req, res) => {
            try {
                await fn.call(this, req, res);
            } catch (e) {
                const status = e instanceof NotFoundError ? 404 : e instanceof ForbiddenError ? 403 : 400;
                res.status(status).send(e.message);
            }
        };
    }
    async create(req, res) {
        const id = await this.service.create(req.body, req.user);
        res.status(201).json({ id });
    }
    async list(req, res) {
        res.json(await this.service.list(req.query, req.user));
    }
    async get(req, res) {
        res.json(await this.service.get(req.params.id, req.user));
    }
    async update(req, res) {
        await this.service.update(req.params.id, req.body, req.user);
        res.status(204).end();
    }
    async delete(req, res) {
        await this.service.delete(req.params.id, req.user);
        res.status(204).end();
    }
}
