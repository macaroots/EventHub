// Violação de regra de negócio (HTTP 4xx). Outros erros são falhas internas (HTTP 500).
export class DomainError extends Error {}
export class BlankError extends DomainError {
    constructor(field) {
        super(`${field} must not be blank`);
    }
}
export class DuplicateError extends DomainError {
    constructor(field) {
        super(`Duplicated ${field}`);
    }
}
export class NotFoundError extends DomainError {
    constructor(field) {
        super(`${field} not found`);
    }
}
export class ForbiddenError extends DomainError {
    constructor(action) {
        super(`Not allowed to ${action}`);
    }
}
// Outra escrita mudou o aggregate depois que ele foi carregado (lock otimista): recarregue e tente de novo.
export class ConcurrencyError extends DomainError {
    constructor(aggregate) {
        super(`${aggregate} was changed concurrently`);
    }
}
