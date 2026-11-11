// Projeção do User do identity (UserRegistered/UserUpdated). Só para leitura (listagens, crachá);
// as regras de inscrição não dependem dela.
export class Participant {
    constructor({ id, name }) {
        this.id = id;
        this.name = name;
    }
}
