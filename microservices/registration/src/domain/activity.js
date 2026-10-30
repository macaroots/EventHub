import { DuplicateError } from "../../../shared/domain/errors.js";

export class ActivityLine {
    activity;
    releasedTokens = [];
    register(token, registration) {
        if (this.isTokenReleased(token)) {
            throw new Error('Wait your turn');
        }
        this.activity.register(registration);
    }
    isTokenReleased(token) {
        return this.releasedTokens.some(t => t.id = token.id);
    }
    releaseToken(token) {
        this.releasedTokens.push(token);
    }
}

// Entity + AggregateRoot
export class Activity {
    #id;
    #capacity;
    #registrations = [];
    #registrationRules = [];

    constructor(capacity, rules=[], id=crypto.randomUUID()) {
        this.#id = id;
        this.setCapacity(capacity);
        rules.unshift(new CapacityRule());
        this.#registrationRules = rules;
    }
    get id() { return this.#id; }
    
    get capacity() { return this.#capacity; }
    setCapacity(capacity) {
        if (capacity < 0) throw new TypeError('Must not be lower than 0');
        this.#capacity = capacity;
    }
    get registrations() { return this.#registrations; }
    toJSON() {
        return {
            id: this.#id,
            capacity: this.#capacity,
            registrations: this.#registrations,
            registrationRules: this.#registrationRules
        }
    }

    register(registration) {
        if (this.isRegistered(registration.user)) throw new DuplicateError('user');
        for (const rule of this.#registrationRules) {
            try {
                rule.apply(registration);
            } catch (e) {
                registration.cancel(e.message);
            }
        }
        registration.confirm();
        this.#registrations.push(registration);
    }
    getOccupation() {
        return this.#registrations.filter(r => r.status != 'canceled').length;
    }
    getConfirmedOccupation() {
        return this.#registrations.filter(r => r.status == 'confirmed').length;
    }
    isFull() {
        return this.getOccupation() >= this.capacity;
    }
    isFullConfirmed() {
        return this.getConfirmedOccupation() >= this.capacity;
    }
    addRule(rule) {
        this.#registrationRules.push(rule);
    }
    getRules() {
        this.#registrationRules;
    }
    isRegistered(user) {
        return this.#registrations.some(r => r.user.id == user.id);
    }
}
export class User {
    id;
    constructor(id=crypto.randomUUID()) {
        this.id = id;
    }
}

// Entity
export class Registration {
    id;
    user;
    activity;
    status;
    reasons = [];
    constructor(user, activity, status='registered', id=crypto.randomUUID()) {
        this.id = id;
        this.user = user;
        this.activity = activity;
        this.status = status;
    }
    proccess() {
        try {
            this.confirm();
        } catch (e) {
            this.cancel(e.message);
        }
    }
    cancel(reason) {
        this.status = 'canceled';
        this.reasons.push(reason);
    }
    confirm() {        
        if (this.status == 'canceled') return false
        if (this.hasPendingItems()) return false
        this.status = 'confirmed';
        return true;
    }
    addPendingItem(item) {        
        if (this.status == 'canceled') return;
        this.status = 'pending';
        this.reasons.push(item);
    }
    getReasons() {
        return this.reasons;
    }
    hasPendingItems() {
        return this.reasons.length > 0;
    }
}


export class CapacityRule {
    apply(registration) {        
        const activity = registration.activity;
        if (activity.isFullConfirmed()) {
            registration.cancel('Full occupation');
            return;
        }
        if (activity.isFull()) {
            registration.addPendingItem({type: 'wait list'});
        }
    }
}

export class PaymentRule {
    constructor(amount) {
        this.amount = amount;
    }
    apply(registration) {
        registration.addPendingItem({type: 'payment', amount: this.amount});
    }
}