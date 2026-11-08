// Projeção do User do identity (UserCreated). Só para leitura (listagens, crachá);
// as regras de inscrição não dependem dela.
export class Participant {
    constructor({ id, username }) {
        this.id = id;
        this.username = username;
    }
}
