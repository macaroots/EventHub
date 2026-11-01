import { CrudController } from "../../../shared/application/CrudController.js";

// CRUD + comandos do ciclo de vida do evento.
export class EventController extends CrudController {
    addRoutes(router) {
        router.post('/:id/publish', this.handle(this.publish));
        router.post('/:id/cancel', this.handle(this.cancel));
        router.post('/:id/organizers', this.handle(this.addOrganizer));
        router.delete('/:id/organizers/:userId', this.handle(this.removeOrganizer));
    }
    async publish(req, res) {
        await this.service.publish(req.params.id, req.user);
        res.status(204).end();
    }
    async cancel(req, res) {
        await this.service.cancel(req.params.id, req.body, req.user);
        res.status(204).end();
    }
    async addOrganizer(req, res) {
        await this.service.addOrganizer(req.params.id, req.body, req.user);
        res.status(204).end();
    }
    async removeOrganizer(req, res) {
        await this.service.removeOrganizer(req.params.id, req.params.userId, req.user);
        res.status(204).end();
    }
}
