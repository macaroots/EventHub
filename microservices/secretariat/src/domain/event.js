import { BlankError } from "../../../shared/domain/errors.js"

export class Event {
    id
    name
    organizers = new Set()
    dates
    information

    constructor(data = {}) {
        this.id = data.id || crypto.randomUUID();
        this.update(data);
    }

    update({ name }) {
        if (!name) throw new BlankError('name');
        this.name = name;
    }

    addOrganizer(organizer) { this.organizers.add(organizer); }
    removeOrganizer(organizer) {
        if (this.organizers.size <= 1) throw new Error('Must have at least 1 organizer');
        this.organizers.delete(organizer);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
        }
    }
}
