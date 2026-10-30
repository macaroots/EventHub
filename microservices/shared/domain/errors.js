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