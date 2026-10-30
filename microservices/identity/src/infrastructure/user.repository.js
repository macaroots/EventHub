import { MapRepository } from "../../../shared/infrastructure/map.repository.js"
export class UserRepository extends MapRepository {
    getByUsername(username) { return this.list().find((e) => e.username === username); }
}