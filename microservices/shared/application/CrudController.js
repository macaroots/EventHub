import express from 'express';
import { ForbiddenError, NotFoundError } from '../domain/errors.js';

// Adaptador HTTP -> app service. Não acessa o repositório: leitura também passa pelo
// service, que aplica autorização. Gera o CRUD em basePath (como `resources` do Rails);
// rotas extras (publicar, cancelar, aninhadas...) entram em addRoutes com path absoluto.
// O router é montado na raiz: app.use(controller.getRouter()).
export class CrudController {
    constructor(service, basePath) {
        this.service = service;
        this.basePath = basePath;
    }
    getRouter() {
        const router = express.Router();
        const base = this.basePath;
        this.addRoutes(router);
        router.post(base, this.handle(this.create));
        router.get(base, this.handle(this.list));
        router.get(`${base}/:id`, this.handle(this.get));
        router.patch(`${base}/:id`, this.handle(this.update));
        router.delete(`${base}/:id`, this.handle(this.delete));
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
