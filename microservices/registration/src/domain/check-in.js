// Sem 0/O, 1/I/L: fácil de ler no projetor e de digitar.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const generateCode = () => Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)), b => ALPHABET[b % ALPHABET.length]).join('');

// Entity. Check-in de uma atividade (id = activityId), aberto pelo organizador (ADR 012).
// Cada abertura gera um código novo, que invalida o anterior.
export class CheckIn {
    constructor({ id, status = 'closed', code = null, openedAt = null }) {
        Object.assign(this, { id, status, code, openedAt });
    }
    open(now = new Date()) {
        this.status = 'open';
        this.code = generateCode();
        this.openedAt = now.toISOString();
    }
    close() {
        this.status = 'closed';
    }
    // Sem diferença de maiúsculas e espaços.
    accepts(code) {
        return this.status == 'open' && String(code ?? '').trim().toUpperCase() == this.code;
    }
}
