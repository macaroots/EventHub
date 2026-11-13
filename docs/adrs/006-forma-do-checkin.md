# Título: Check-in no registration, por código da atividade
Número do ADR: 006
Data: 2026-11-06
Responsável: Renato
Status: Aceito

## Contexto
O RF09 pede registrar a presença dos inscritos sem duplicidade. Essa presença alimenta o comparecimento do RF11 e o critério de presença do RN06 (certificados). Duas perguntas:
- **Onde fica:** o check-in acontece meses depois da inscrição, então surgiu a dúvida se ele merece um serviço próprio.
- **Como funciona:** foram sugeridas duas formas:
  1. **Ingresso assinado:** o participante pede um ingresso (token assinado, sem estado) e um porteiro confere a assinatura na entrada.
  2. **Código no local:** na hora da atividade, o sistema gera um código, e o participante logado o informa para registrar presença.

Check-in aqui não é controle de entrada: ninguém é barrado na porta. O que se quer é saber quem compareceu a cada atividade.

## Decisão
- **Fica no `registration`,** com `CheckIn` e `Attendance` como aggregates próprios, fora da `Activity`. Um check-in não disputa o lock com as inscrições.
- **O check-in lê a inscrição no próprio banco do serviço,** no momento do check-in. Não há projeção alimentada por `RegistrationConfirmed/Canceled`.
- **A presença é por atividade.** Cada inscrição `confirmed` tem no máximo uma `Attendance` (`registrationId` único). Repetir o check-in não cria um segundo registro: devolve o que já existe.
- **O organizador abre o check-in da atividade** (`CheckIn`, um por atividade). Ao abrir, o sistema gera um código curto, que ele mostra na sala (projetor ou quadro). Abrir de novo gera outro código e invalida o anterior. Fechar encerra o check-in.
- **O participante logado informa o código** na página da inscrição. A presença só é registrada se o check-in estiver aberto, o código conferir e a inscrição estiver `confirmed`.
- **Marcação manual:** o organizador marca a presença de um inscrito confirmado, para quem não tem celular ou não conseguiu informar o código. Fica registrado quem marcou (`method: manual`, `checkedInBy`).
- **Mensagem:** cada presença nova publica `AttendanceRegistered {attendanceId, registrationId, activityId, userId, method, checkedInAt}`, usada depois pelos certificados (RN06).

## Justificativa
- **Onde fica:**
  - O check-in depende do status da inscrição, do participante e da atividade, que já estão no `registration`. Num serviço à parte, tudo isso teria de ser duplicado por projeção.
  - O tempo entre inscrição e check-in não define fronteira de contexto. Fronteira se define por modelo e linguagem, por equipe e por necessidade de escala ou disponibilidade, e nada disso exige separação hoje.
  - Em eventos, "credenciamento" costuma significar o próprio check-in e o crachá. O nome do contexto já inclui essa responsabilidade.
- **Como funciona:**
  - O código no local prova que a pessoa estava na sala no momento, sem precisar de porteiro nem de leitor de QR. É o mínimo que o RF09 exige.
  - Gerar um código novo a cada abertura limita o repasse: um código enviado para quem não está na sala vale só enquanto aquela abertura durar.
  - A unicidade por `registrationId` no banco garante que não há duplicidade, mesmo com cliques repetidos ou instâncias concorrentes.

## Alternativas Consideradas
- **Microsserviço de check-in à parte:** dá deploy e escala independentes e permite operar offline no local. Em troca, duplica a projeção de inscrições e participantes e acrescenta um serviço sem ganho atual.
- **Check-in dentro do aggregate `Activity`:** é mais simples de começar, mas mistura dois ciclos de vida e faz o check-in concorrer com as inscrições.
- **Projeção da inscrição alimentada por mensagens, dentro do próprio `registration`:** prepararia a extração, mas duplica dados que o serviço já tem e cria atraso entre a confirmação e o check-in.
- **Ingresso assinado (QR) conferido na entrada:** é sem estado e funciona offline, mas exige porteiro e não mede a presença por atividade. Fica para quando houver controle de acesso de verdade.
- **Código rotativo (TOTP, novo a cada 30 a 60 s):** dificulta ainda mais o repasse, mas exige uma tela sempre atualizada na sala. Pode ser adotado depois sem mudar `Attendance`.
- **Geolocalização ou Wi-Fi do local:** é invasivo, pouco confiável em salas fechadas e depende de permissão do navegador.
- **Só a marcação manual:** não escala em atividades grandes.

## Consequências
- Um único serviço concentra inscrição e check-in, e uma carga alta num afeta o outro.
- **Gatilhos para extrair o check-in** para outro serviço (a leitura da inscrição vira então uma projeção):
  - precisar operar offline no local, com leitores de QR;
  - pico de carga na abertura das atividades que não pode derrubar as inscrições;
  - outra equipe ou outros dispositivos operando o check-in.
- Uma inscrição cancelada depois do check-in mantém a presença, porque ela já aconteceu. O comparecimento conta as presenças sobre os confirmados.
- Ainda não há janela de horário: o organizador abre e fecha o check-in. A projeção da atividade não guarda `startsAt` e `endsAt`, que serão necessários para o RN06.
- Ainda não há como desfazer uma presença marcada por engano.
- Um código repassado durante a abertura ainda permite presença indevida. Mitigação: gerar um código novo ou passar para o código rotativo.

## Referências
- [008-certificados.md](008-certificados.md)
- [../ddd.md](../ddd.md)
- [../../microservices/registration/README.md](../../microservices/registration/README.md)
