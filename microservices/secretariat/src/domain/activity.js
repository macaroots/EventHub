import { BlankError } from "../../../shared/domain/errors.js"

export class Activity {
    id
    eventId
    name
    capacity
    price

    constructor(data = {}) {
        this.id = data.id || crypto.randomUUID();
        if (!data.eventId) throw new BlankError('eventId');
        this.eventId = data.eventId;
        this.update(data);
    }

    update({ name, capacity, price = 0 }) {
        // TODO aqui é uma projeção. precisa da validação de novo? 
        // se sim, não é melhor colocar a validação em um setter? ou só torna
        // TODO alterar só os campos enviados, ignorar os outros.
        if (!name) throw new BlankError('name');
        if (!Number.isInteger(capacity) || capacity < 0) throw new TypeError('capacity must be an integer >= 0');
        if (typeof price != 'number' || price < 0) throw new TypeError('price must be >= 0');
        this.name = name;
        this.capacity = capacity;
        this.price = price;
    }

    toJSON() {
        return {
            id: this.id,
            eventId: this.eventId,
            name: this.name,
            capacity: this.capacity,
            price: this.price,
        }
    }
}
