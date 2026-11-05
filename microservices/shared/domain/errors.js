export class BlankError extends Error {
    constructor(field) {
        super(`${field} must not be blank`);
    }
}
export class DuplicateError extends Error {
    constructor(field) {
        super(`Duplicated ${field}`);
    }
}
export class NotFoundError extends Error {
    constructor(field) {
        super(`${field} not found`);
    }
}
export class ForbiddenError extends Error {
    constructor(action) {
        super(`Not allowed to ${action}`);
    }
}
// Outra escrita mudou o aggregate depois que ele foi carregado (lock otimista): recarregue e tente de novo.
export class ConcurrencyError extends Error {
    constructor(aggregate) {
        super(`${aggregate} was changed concurrently`);
    }
}
