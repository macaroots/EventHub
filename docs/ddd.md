# Modelo DDD + Microserviços

## Linguagem ubíqua

Eventos acadêmicos e profissionais, como congressos, seminários, workshops e minicursos.

Organizações criam eventos, publicam atividades e disponibilizam inscrições.

Participantes consultam a programação, inscrevem-se em atividades, realizam pagamentos quando necessário, recebem comunicações, fazem check-in e podem obter certificados.

Organizadores acompanham ocupação, presença e indicadores operacionais.

O sistema será utilizado por múltiplas organizações. Um evento pode conter várias atividades, com datas, horários, preços e capacidades diferentes. Algumas atividades são gratuitas; outras exigem pagamento. O número de acessos pode variar intensamente durante a abertura de inscrições.

## Sequência para inscrição

### Fila (RF06) controla o acesso ao formulário de inscrição
    ouve "nova atividade" anota a capacidade
    ouve "nova inscricao"
        diminui a capacidade
        chama o próximo

GET /atividade/:id/inscricao - pedir pra ver o form
    entra na fila
        gera e anota senha. 
        recebe a senha da fila. depois o guichê confere a assinatura.
    quando for sua vez, é chamado por websocket. ou se recarregar, basta mostrar a senha da fila
        senha da fila
        recebe o formulário baseado na atividade

### Credenciamento (RF05)

POST /atividade/:id/inscricao
    formulário de inscrição + regras da atividade + senha da fila
        checa senha
            espere sua vez
        cria a inscricao
            status = confirmado
            roda as regras
                regra pode devolver pendências ou indeferimento
            se ok
                se houver pendencias
                    status = pendente
                    publicar Pendencia
                publica inscricaoCriada
            se houver impedimentos
                status = cancelada
    recebe a inscrição com status.

    
POST /pagamentos/:id/confirmar
    confirmar pagamento
            
    


## IdentidadeMS - usuários e autenticação

Usuário
    id = UUID()
    nome
    username
    senha
    email

UsuariosService
    crud
    autenticar(username, senha): token
    autencicar(tokenPorEmail): token // alteração futura

## EventosPublicosMS
    
EventosCatalogoPublico
    listar()
    buscarPorNome()

## EventosMS - gerência de eventos e relatórios

Evento
    id
    nome
    organizadores
    periodo
    informacoes
    adicionarResponsavel()
    programacao: List<Atividade>
    regras_inscricao: string | List<Regra>

EventosCatalogo (usa pra escrita)
    crud
    publicar()
    cancelar()

Atividade (Programação)
    id
    id_evento
    nome
    horario
    organizadores
    locais
    regras_inscricao: string | List<Regra>
    vagas
    inscrever(usuario)
        inscricao = Inscricao()
            inscricao.status = 'pendente'
        checaVagas()
        cobraPagamento()
    fila: FilaCompra(vagas)

Regra
    descricao
    aplicar()

RegraCapacidade
    vagas

RegraIdadeMinima: Regra
    idade

CertificadosService
    ouve "CertificadoCriado"  

RegraTicketEspecial: Regra

RegraPagamento: Regra
    preco (0 == gratis)
    aplicar()
        emite "RequerPagamento" preco

/* Só para organizadores */
Relatorio
    atividades()
        inscricoes
        pagamentos
        ocupação
        lista de presença

## CredenciamentoMS

Inscricao
    id
    id_atividade
    id_usuario
    status - (listaEspera | aguardandoPagamento | confirmada, cancelada)
    confirmar([comprovantePagamento]) // RN02
    cancelar(motivo) // RN02, RN03

InscricoesAppService
    inscrever(inscricao) // RN01 - reserva vaga, entra em fila de espera.
        atividade.inscrever()
    consultar()
    confirmar()
        ouve "PagamentoConfirmado"
        inscricao.confirmar()
    cancelar()
        ouve "PagamentoExpirado"
        ouve "PagamentoRecusado"
        inscricao.cancelar()

InscricoesAppService
    confirmar(inscricao[, comprovantePagamentoAtividades])
    cancelar(inscricao, motivo)

Checkin
    registrarPresenca()
        marca ingresso com um token

CertificadosService
    emitirCertificado
        confereToken()
        c = new Certificado()
        repo.inserir(c)

## Fila

Fila
    entrar(id_atividade, id_usuario): senhaNumeroNaFila
    proximo(): id_usuario

## CaixaMS

Pagamento
    id
    status
    processar()
        emite "PagamentoConfirmado" | "PagamentoCancelado"
    expirar()
        emite "PagamentoExpirado"

PagamentoAppService
    cobrar()
        p = new Pagamento()
        p.processar()
        repo.insere(p)
        publicar(id_inscricao, resultado: (confirmado, recusado, expirado))

## NotificacoesMS

NotificacoesService
    ouve:
        inscricaoConfirmada
        inscricaoCancelada
    notificarInscricao(id_inscricao, mensagem) // mensagem = confirmada | cancelada | vaga // RN04, RN05
