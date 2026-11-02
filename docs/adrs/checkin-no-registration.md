# Título: Check-in no serviço de inscrição (registration)
Número do ADR: 002
Data: 2026-11-02
Responsável: Renato
Status: Proposto

## Contexto
Hoje o serviço `registration` faz a inscrição em atividades: regras, pendências como pagamento e projeção do `Participant`. Falta o check-in no dia do evento. Ele pode acontecer meses depois da inscrição, e é preciso decidir se fica no mesmo serviço ou num serviço próprio.

## Decisão
O check-in fica no `registration`, como um aggregate próprio (`Attendance`), separado de `Activity`. Ele só reage a mensagens da `Registration`:
- `RegistrationConfirmed` habilita o check-in;
- `RegistrationCanceled` revoga.

## Justificativa
- Os dados são os mesmos: o check-in depende do status da inscrição, do participante e da atividade. Num serviço à parte, tudo isso teria de ser duplicado por projeção.
- O tempo entre inscrição e check-in não define fronteira de contexto. Fronteira se define por modelo e linguagem, por equipe e por necessidade de escala ou disponibilidade, e nada disso exige separação hoje.
- Em eventos, "credenciamento" costuma significar o próprio check-in e o crachá. O nome do contexto já inclui essa responsabilidade.
- Um aggregate separado não disputa com as inscrições pela concorrência sobre a `Activity` e tem ciclo de vida próprio: entrada, saída, reentrada e presença por atividade.

## Alternativas Consideradas
- **Microsserviço de check-in à parte:** dá deploy e escala independentes e permite operar offline no local. Em troca, duplica a projeção de inscrições e participantes e acrescenta um serviço sem ganho atual.
- **Check-in dentro do aggregate `Activity`:** é mais simples de começar, mas mistura dois ciclos de vida e faz o check-in concorrer com as inscrições.

## Consequências
- Um único serviço concentra inscrição e check-in, com menos infraestrutura e nenhuma projeção duplicada.
- Uma carga alta no check-in afeta as inscrições e vice-versa.
- Como `Attendance` só conversa por mensagens, extraí-lo depois custa pouco. Gatilhos para extrair:
  - precisar operar offline no local, com leitores de QR;
  - pico de carga na abertura que não pode derrubar as inscrições;
  - outra equipe ou outros dispositivos operando o check-in;
  - crescimento da lógica pós-evento, como presença mínima e certificados.

## Referências
- [comunicacao-assincrona.md](comunicacao-assincrona.md)
- [../ddd.md](../ddd.md)
