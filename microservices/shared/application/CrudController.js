import express from 'express';

export class CrudController {
    constructor(service, repository) {
        this.service = service;
        this.repository = repository;
    }
    getRouter() {
        const router = express.Router();
        router.post('/', this.create.bind(this));
        router.get('/', this.list.bind(this));
        router.get('/:id', this.get.bind(this));
        router.put('/:id', this.update.bind(this));
        router.delete('/:id', this.delete.bind(this));
        return router;
    }
    getBeanFromRequest(req) {
        const bean = req.body;
        return bean;
    }
    async create(req, res) {
        const bean = this.getBeanFromRequest(req)
        try {
            const id = await this.service.create(bean);
            res.status(201).json({id})
        } catch (e) {
            res.status(400).send(e.message);
        }
    }

    async list(req, res) {
        const beans = await this.repository.list();
        res.json(beans);
    }
    async get(req, res) {
        const id = req.params.id;
        const bean = await this.repository.getById(id);
        res.json(bean);
    }
    async update(req, res) {
        const id = req.params.id;
        const bean = this.getBeanFromRequest(req);
        await this.service.update(id, bean);
        res.json('bean alterado com sucesso!');
    }
    async delete(req, res) {
        const id = req.params.id;
        this.service.delete(id);
        res.json(`#${id} apagado com sucesso`);
    }
}