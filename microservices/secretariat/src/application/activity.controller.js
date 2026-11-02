import { CrudController } from "../../../shared/application/CrudController.js";

// CRUD em /activities + listagem aninhada no evento.
export class ActivityController extends CrudController {
    constructor(service) {
        super(service, '/activities');
    }
    addRoutes(router) {
        router.get('/events/:eventId/activities', this.handle(this.listByEvent));
    }
    async listByEvent(req, res) {
        res.json(await this.service.list({ eventId: req.params.eventId }, req.user));
    }
}
