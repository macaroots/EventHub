# Modelo DDD


Usuário
    id = UUID()
    nome
    username
    senha
    email

UsuariosService
    crud
    autenticar(username, senha)
    autencicar(tokenPorEmail) // alteração futura

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

Regra
    aplicar()

RegraCapacidade
    vagas

RegraIdadeMinima: Regra
    idade

RegraTicketEspecial: Regra

RegraPagamento: Regra
    preco (0 == gratis)
    aplicar()
        dispara evento RequerPagamento preco

Inscricao
    id
    id_atividade
    id_usuario
    status - (listaEspera | aguardandoPagamento | confirmada, cancelada)
    confirmar([comprovantePagamento]) // RN02
    cancelar(motivo) // RN02, RN03

InscricoesCatalogo
    inscrever(inscricao) // RN01 - reserva vaga, entra em fila de espera.
        atividade.inscrever()
    consultar()
    cancelar()

ListaEspera | FilaComprar
    entrar(id_atividade, id_usuario): senhaNumeroNaFila
    proximo(): id_usuario


AtividadesService


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
    escuta:
        inscricaoConfirmada
        inscricaoCancelada
    notificarInscricao(id_inscricao, status) // status = confirmada | cancelada | vaga // RN04, RN05

/*
escuta: eventoTerminou(id_evento, presentes)
*/
CertificadosService
