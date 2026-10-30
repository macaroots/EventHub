import { BlankError } from "../../../../shared/domain/errors.js"

export class Event {
    id
    name
    organizers = []
    period
    information
    schedule = []
    registrationRules = new Set();

    constructor(data = {}) {
        this.id = data.id || crypto.randomUUID();
        if (!data.name) throw new BlankError('name');
        this.name = data.name;
    }

    addOrganizer(organizer) { this.organizers.add(organizer); }
    removeOrganizer(organizer) { 
        if (this.organizers.length <= 1) throw new Error('Must have at leat 1 organizer');
        this.organizers.delete(organizer);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
        }
    }
}