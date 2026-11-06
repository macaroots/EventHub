// Regras de elegibilidade: avaliam e retornam { deny: motivo } | { require: pendência } | undefined.
// Não alteram a Registration nem publicam mensagens (sem efeito colateral).
// Capacidade e preço não são regras: são atributos da Activity.
// Sem data de nascimento na projeção de Participant: vira pendência de verificação.
export class MinimumAgeRule {
    constructor(age) {
        this.age = age;
    }
    evaluate() {
        return { require: { type: 'age verification', minimumAge: this.age } };
    }
    toJSON() {
        return { type: 'minimumAge', age: this.age };
    }
}
