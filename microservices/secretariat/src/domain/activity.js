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

const isDate = (field) => (v) => { if (v != null && isNaN(Date.parse(v))) throw new TypeError(`${field} must be an ISO date`) };

// TODO não gostei dos validators. não seria melhor em um setter privado?
// Um validador por campo: permite alterar só os campos enviados.
const validators = {
    name: (v) => { if (!v) throw new BlankError('name') },
    description: () => {},
    location: () => {},
    startsAt: isDate('startsAt'),
    endsAt: isDate('endsAt'),
    capacity: (v) => { if (!Number.isInteger(v) || v < 0) throw new TypeError('capacity must be an integer >= 0') },
    rules: (v) => {
        if (!Array.isArray(v)) throw new TypeError('rules must be a list');
        for (const rule of v) {
            const validate = ruleValidators[rule?.type];
            if (!validate) throw new TypeError(`Unknown rule ${rule?.type}`);
            validate(rule);
        }
    },
};

// Aggregate separado do Event: muda com frequência (vagas, regras) e é a unidade de inscrição.
// Estado privado: só muda por update(), que valida.
export class Activity {
    // TODO #data? será não é melhor como estava?
    #data = { rules: [] };

    constructor(data = {}) {
        if (!data.eventId) throw new BlankError('eventId');
        this.#data.id = data.id || crypto.randomUUID();
        this.#data.eventId = data.eventId;
        this.update(data);
        validators.name(this.#data.name);
        validators.capacity(this.#data.capacity);
    }
    get id() { return this.#data.id; }
    get eventId() { return this.#data.eventId; }

    // TODO não sei seria feito assim profissionalmente
    // Altera só os campos enviados (PATCH); ignora os desconhecidos.
    update(data) {
        const next = { ...this.#data };
        for (const [field, validate] of Object.entries(validators)) {
            if (data[field] === undefined) continue;
            validate(data[field]);
            next[field] = data[field];
        }
        if (next.startsAt && next.endsAt && next.endsAt < next.startsAt) throw new TypeError('endsAt must be after startsAt');
        this.#data = next;
    }

    // TODO não é melhor como estava?
    toJSON() { return { ...this.#data }; }
}
