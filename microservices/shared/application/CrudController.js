import express from 'express';
import { NotFoundError } from '../domain/errors.js';

export class CrudController {
    constructor(service, repository) {
        this.service = service;
        this.repository = repository;
    }
    getRouter() {
        const router = express.Router();
        router.post('/', this.handle(this.create));
        router.get('/', this.handle(this.list));
        router.get('/:id', this.handle(this.get));
        router.put('/:id', this.handle(this.update));
        router.delete('/:id', this.handle(this.delete));
        return router;
    }
    getBeanFromRequest(req) {
        const bean = req.body;
        return bean;
    }
    // NotFoundError -> 404; demais erros de domínio -> 400.
    handle(fn) {
        return async (req, res) => {
            try {
                await fn.call(this, req, res);
            } catch (e) {
                res.status(e instanceof NotFoundError ? 404 : 400).send(e.message);
            }
        };
    }
    async create(req, res) {
        const id = await this.service.create(this.getBeanFromRequest(req));
        res.status(201).json({id});
    }
    async list(req, res) {
        res.json(await this.repository.list());
    }
    async get(req, res) {
        const bean = await this.repository.getById(req.params.id);
        if (!bean) throw new NotFoundError('id');
        res.json(bean);
    }
    async update(req, res) {
        await this.service.update(req.params.id, this.getBeanFromRequest(req));
        res.status(204).end();
    }
    async delete(req, res) {
        await this.service.delete(req.params.id);
        res.status(204).end();
    }
}
