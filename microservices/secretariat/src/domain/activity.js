import { BlankError } from "../../../shared/domain/errors.js"

// Regras de inscrição: a secretaria só as configura; quem as aplica é o registration.
const ruleValidators = {
    payment: ({ amount, description }) => {
        if (typeof amount != 'number' || amount <= 0) throw new TypeError('payment amount must be > 0');
        if (!description) throw new BlankError('payment description');
    },
    minimumAge: ({ age }) => {
        if (!Number.isInteger(age) || age <= 0) throw new TypeError('minimumAge age must be an integer > 0');
    },
};

const assertDate = (field, v) => { if (v != null && isNaN(Date.parse(v))) throw new TypeError(`${field} must be an ISO date`) };

// Aggregate separado do Event: muda com frequência (vagas, regras) e é a unidade de inscrição.
// Estado privado: só muda pelos setters privados, que validam.
export class Activity {
    #id;
    #eventId;
    #name;
    #description;
    #location;
    #startsAt;
    #endsAt;
    #capacity;
    #rules = [];

    // Reconstituição (banco). Para uma atividade nova, use Activity.create().
    constructor({ id, eventId, name, description, location, startsAt, endsAt, capacity, rules = [] }) {
        if (!id) throw new BlankError('id');
        if (!eventId) throw new BlankError('eventId');
        this.#id = id;
        this.#eventId = eventId;
        this.#setName(name);
        this.#description = description;
        this.#location = location;
        this.#setPeriod(startsAt, endsAt);
        this.#setCapacity(capacity);
        this.#setRules(rules);
    }
    static create(data) {
        return new Activity({ ...data, id: crypto.randomUUID()});
    }

    get id() { return this.#id; }
    get eventId() { return this.#eventId; }

    // PATCH: altera só os campos enviados; os desconhecidos (id, eventId...) são ignorados.
    update({ name, description, location, startsAt, endsAt, capacity, rules }) {
        if (name !== undefined) this.#setName(name);
        if (description !== undefined) this.#description = description;
        if (location !== undefined) this.#location = location;
        if (startsAt !== undefined || endsAt !== undefined) this.#setPeriod(startsAt === undefined ? this.#startsAt : startsAt, endsAt === undefined ? this.#endsAt : endsAt);
        if (capacity !== undefined) this.#setCapacity(capacity);
        if (rules !== undefined) this.#setRules(rules);
    }

    #setName(name) {
        if (!name) throw new BlankError('name');
        this.#name = name;
    }
    #setPeriod(startsAt, endsAt) {
        assertDate('startsAt', startsAt);
        assertDate('endsAt', endsAt);
        if (startsAt && endsAt && endsAt < startsAt) throw new TypeError('endsAt must be after startsAt');
        this.#startsAt = startsAt;
        this.#endsAt = endsAt;
    }
    #setCapacity(capacity) {
        if (!Number.isInteger(capacity) || capacity < 0) throw new TypeError('capacity must be an integer >= 0');
        this.#capacity = capacity;
    }
    #setRules(rules) {
        if (!Array.isArray(rules)) throw new TypeError('rules must be a list');
        for (const rule of rules) {
            const validate = ruleValidators[rule?.type];
            if (!validate) throw new TypeError(`Unknown rule ${rule?.type}`);
            validate(rule);
        }
        this.#rules = rules.map(r => ({ ...r }));
    }

    toJSON() {
        return {
            id: this.#id,
            eventId: this.#eventId,
            name: this.#name,
            description: this.#description,
            location: this.#location,
            startsAt: this.#startsAt,
            endsAt: this.#endsAt,
            capacity: this.#capacity,
            rules: this.#rules.map(r => ({ ...r })),
        };
    }
}
