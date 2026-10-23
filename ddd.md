# Modelo DDD


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

Evento
    id
    nome
    responsaveis
    periodo
    informacoes
    adicionarResponsavel()
    programacao: List<Atividade>
    regras_inscricao: string | List<Regra>

EventosCatalogo (usa pra escrita)
    crud
    publicar()
    cancelar()

EventosCatalogoPublico
    listar()
    buscarPorNome()

Atividade (Programação)
    id
    id_evento
    nome
    horario
    responsaveis
    locais
    regras_inscricao: string | List<Regra>
    vagas
    inscrever(usuario)
        inscricao = Inscricao()
            inscricao.status = 'pendente'
        checaVagas()
        cobraPagamento()
    fila: FilaCompra(vagas)
    checkin(usuario)
    emitirCertificados()
        para cada participante
            emite "CertificadoCriado"

Regra
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


ListaEspera | FilaComprar
    entrar(id_atividade, id_usuario): senhaNumeroNaFila
    proximo(): id_usuario

Pagamento
    id
    status
    processar()
        emite "PagamentoConfirmado" | "PagamentoCancelado"

PagamentoAppService
    cobrar()
        p = Pagamento()
        repo.salvar(p)
        publicar(p.eventos)

NotificacoesService
    notificar(inscricao, mensagem)

Checkin
    registrarPresenca()

InscricoesAppService
    confirmar(inscricao[, comprovantePagamentoAtividades])
    cancelar(inscricao, motivo)


UsuáriosService
    crud
    autenticar(): token

EventosCatalogoService
    crud
    publicar()
    cancelar()
    buscar(): Evento

Pagamento
    processar()

PagamentosService
    pagar(id_inscricao, valor)
        p = new Pagamento()
        p.processar()
        repo.insere(p)
        publicar(id_inscricao, resultado: (confirmado, recusado, expirado))


NotificacoesService
    ouve:
        inscricaoConfirmada
        inscricaoCancelada
    notificarInscricao(id_inscricao, status) // status = confirmada | cancelada | vaga // RN04, RN05


CertificadosService
    ouve "CertificadoCriado"
        repo.inserir(c)
    /* só a inscrição do usuário */
    get(inscricao): Certificado

/* Só para organizadores */
Relatorio
    atividades()
        inscricoes
        pagamentos
        ocupação
        lista de presença