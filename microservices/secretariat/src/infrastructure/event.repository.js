import { MapRepository } from "../../../shared/infrastructure/map.repository.js"
export class EventRepository extends MapRepository {
    findByName(name) { return this.list().find((e) => e.name === name); }
}