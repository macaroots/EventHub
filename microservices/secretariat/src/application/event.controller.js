import { CrudController } from "../../../shared/application/CrudController.js";

export class EventController extends CrudController {
    list(req, res) {
        if (req.query.name) {
            res.json(this.repository.findByName(req.query.name));
        }
        else {
            super.list(req, res);
        }
    }
}