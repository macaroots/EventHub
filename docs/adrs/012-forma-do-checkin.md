# Título: Check-in por código da atividade, com marcação manual pelo organizador
Número do ADR: 012
Data: 2026-11-06
Responsável: Renato
Status: Aceito

## Contexto
O RF09 pede registrar a presença dos inscritos sem duplicidade. Essa presença alimenta o comparecimento do RF11 e o critério de presença do RN06 (certificados). Foram sugeridas duas formas:
1. **Ingresso assinado:** o participante pede um ingresso (token assinado, sem estado) e um porteiro confere a assinatura na entrada.
2. **Código no local:** na hora da atividade, o sistema gera um código, e o participante logado o informa para registrar presença.

Check-in aqui não é controle de entrada: ninguém é barrado na porta. O que se quer é saber quem compareceu a cada atividade.

## Decisão
- **A presença é por atividade.** Cada inscrição `confirmed` tem no máximo uma `Attendance` (`registrationId` único). Repetir o check-in não cria um segundo registro: devolve o que já existe.
- **O organizador abre o check-in da atividade** (`CheckIn`, um por atividade). Ao abrir, o sistema gera um código curto, que ele mostra na sala (projetor ou quadro). Abrir de novo gera outro código e invalida o anterior. Fechar encerra o check-in.
- **O participante logado informa o código** na página da inscrição. A presença só é registrada se o check-in estiver aberto, o código conferir e a inscrição estiver `confirmed`.
- **Marcação manual:** o organizador marca a presença de um inscrito confirmado, para quem não tem celular ou não conseguiu informar o código. Fica registrado quem marcou (`method: manual`, `checkedInBy`).
- **Mensagem:** cada presença nova publica `AttendanceRegistered {attendanceId, registrationId, activityId, userId, method, checkedInAt}`, que mais tarde será usada pelos certificados (RN06).
- **Onde fica:** no `registration`, como o [ADR 002](002-checkin-no-registration.md) já decidiu. `CheckIn` e `Attendance` ficam fora do aggregate `Activity`, então um check-in não disputa o lock com as inscrições.

## Justificativa
- O código no local prova que a pessoa estava na sala no momento, sem precisar de porteiro nem de leitor de QR. É o mínimo que o RF09 exige.
- O ingresso assinado (opção 1) resolve a entrada no evento, não a presença em cada atividade, e precisa de alguém validando. Ficaria para quando houver controle de acesso de verdade.
- Gerar um código novo a cada abertura limita o repasse: um código enviado para quem não está na sala vale só enquanto aquela abertura durar.
- A unicidade por `registrationId` no banco garante que não há duplicidade, mesmo com cliques repetidos ou instâncias concorrentes.

## Alternativas Consideradas
- **Ingresso assinado (QR) conferido na entrada:** é sem estado e funciona offline, mas exige porteiro e não mede a presença por atividade.
- **Código rotativo (TOTP, novo a cada 30 a 60 s):** dificulta ainda mais o repasse, mas exige uma tela sempre atualizada na sala. Pode ser adotado depois sem mudar `Attendance`.
- **Geolocalização ou Wi-Fi do local:** é invasivo, pouco confiável em salas fechadas e depende de permissão do navegador.
- **Só a marcação manual:** não escala em atividades grandes.

## Consequências
- **Muda o [ADR 002](002-checkin-no-registration.md):** o check-in lê a inscrição no próprio banco do serviço, no momento do check-in, em vez de manter uma projeção alimentada por `RegistrationConfirmed/Canceled`. Se o check-in for extraído para outro serviço, essa leitura vira uma projeção.
- Uma inscrição cancelada depois do check-in mantém a presença, porque ela já aconteceu. O comparecimento conta as presenças sobre os confirmados.
- Ainda não há janela de horário: o organizador abre e fecha o check-in. A projeção da atividade não guarda `startsAt` e `endsAt`, que serão necessários para o RN06.
- Ainda não há como desfazer uma presença marcada por engano.
- Um código repassado durante a abertura ainda permite presença indevida. Mitigação: gerar um código novo ou passar para o código rotativo.

## Referências
- [002-checkin-no-registration.md](002-checkin-no-registration.md)
- [003-certificados.md](003-certificados.md)
- [../../microservices/registration/README.md](../../microservices/registration/README.md)
