(() => {
    const panel = document.getElementById('panel-reports');
    if (!panel) return;
    const element = id => document.getElementById(`report-${id}`);
    const feedback = element('feedback');
    let loaded = false;
    let loading = false;
    let page = 1;
    let participantLoading = false;
    const number = value => value == null ? 'Não disponível' : Number(value).toLocaleString('pt-BR');
    const percent = value => value == null ? 'Não disponível' : `${number(value)}%`;
    const date = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não disponível';
    const labels = { pending: 'Pendente', confirmed: 'Confirmada', canceled: 'Cancelada', requested: 'Solicitado', approved: 'Aprovado', denied: 'Negado' };
    const status = value => labels[value] || value || 'Não informado';
    const node = (tag, text, className) => {
        const result = document.createElement(tag);
        if (text != null) result.textContent = text;
        if (className) result.className = className;
        return result;
    };
    const table = (headers, rows, empty) => {
        if (!rows.length) return node('p', empty, 'empty-state');
        const wrapper = node('div', null, 'table-scroll');
        const result = node('table', null, 'hub-table');
        const head = node('thead');
        const heading = node('tr');
        headers.forEach(value => { const th = node('th', value); th.scope = 'col'; heading.append(th); });
        head.append(heading);
        const body = node('tbody');
        rows.forEach(values => {
            const row = node('tr');
            values.forEach(value => row.append(node('td', value ?? 'Não informado')));
            body.append(row);
        });
        result.append(head, body);
        wrapper.append(result);
        return wrapper;
    };
    async function request(url) {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(35000) });
        if (response.redirected || response.status === 401) throw new Error('Sua sessão expirou. Entre novamente.');
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Não foi possível carregar o relatório. Tente novamente.');
        }
        return response;
    }
    function render(report) {
        const content = element('content');
        content.replaceChildren();
        content.append(node('p', `Dados atualizados em: ${date(report.dataUpdatedAt)} · Gerado em: ${date(report.generatedAt)}`, 'muted'));
        const counts = report.totals.registrations;
        const metrics = [
            ['Inscrições totais', number(counts.all)], ['Inscrições ativas', number(counts.active)],
            ['Confirmadas', number(counts.confirmed)], ['Pendentes', number(counts.pending)],
            ['Canceladas', number(counts.canceled)], ['Capacidade', number(report.totals.capacity)],
            ['Presenças nas atividades', number(report.totalAttendances)], ['Ocupação', percent(report.totals.occupancyRate)],
            ['Taxa de presença', percent(report.totals.attendanceRate)], ['Taxa de ausência', percent(report.totals.noShowRate)],
        ];
        const cards = node('dl', null, 'report-metrics');
        metrics.forEach(([label, value]) => { const card = node('div'); card.append(node('dt', label), node('dd', value)); cards.append(card); });
        content.append(cards, node('h3', 'Indicadores por atividade'));
        content.append(table(
            ['Atividade', 'Capacidade', 'Ativas', 'Confirmadas', 'Pendentes', 'Canceladas', 'Presenças', 'Ocupação', 'Presença', 'Ausência'],
            (report.activities || []).map(a => [a.name, number(a.capacity), number(a.registrations.active), number(a.registrations.confirmed), number(a.registrations.pending), number(a.registrations.canceled), number(a.totalAttendances), percent(a.occupancyRate), percent(a.attendanceRate), percent(a.noShowRate)]),
            'Nenhuma atividade disponível no relatório.',
        ));
        content.append(node('h3', 'Pagamentos'));
        const payments = report.payments;
        if (payments) {
            const money = value => value == null ? 'Não disponível' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: payments.currency || 'BRL' });
            content.append(table(['Solicitados', 'Aprovados', 'Negados', 'Valor esperado', 'Valor aprovado'], [[number(payments.requested), number(payments.approved), number(payments.denied), money(payments.expectedAmount), money(payments.approvedAmount)]]));
        } else content.append(node('p', 'Informações financeiras não disponíveis.', 'empty-state'));
    }
    async function participants(targetPage = page) {
        if (participantLoading) return;
        participantLoading = true;
        element('previous').disabled = true;
        element('next').disabled = true;
        element('participants-retry').hidden = true;
        element('participants-feedback').textContent = 'Carregando participantes…';
        try {
            const data = await (await request(`${panel.dataset.url}/participants?page=${targetPage}`)).json();
            page = data.page;
            element('participants').replaceChildren(table(
                ['Participante', 'E-mail', 'Atividade', 'Inscrição', 'Check-in', 'Pagamento'],
                data.items.map(p => [p.name || p.userId, p.email, p.activityName || p.activityId, status(p.status), p.checkedInAt ? date(p.checkedInAt) : 'Não realizado', status(p.paymentStatus)]),
                'Nenhum participante encontrado.',
            ));
            const pages = Math.max(1, Math.ceil(data.total / data.limit));
            element('page').textContent = `Página ${page} de ${pages} · ${number(data.total)} inscrições`;
            element('previous').disabled = page <= 1;
            element('next').disabled = page >= pages;
            element('participants-feedback').textContent = '';
        } catch (error) {
            element('participants-feedback').textContent = error.message;
            element('participants-retry').hidden = false;
        } finally { participantLoading = false; }
    }
    async function load() {
        if (loading || loaded) return;
        loading = true;
        feedback.textContent = 'Carregando relatório…';
        element('retry').hidden = true;
        try {
            render(await (await request(panel.dataset.url)).json());
            loaded = true;
            feedback.textContent = '';
            await participants();
        } catch (error) {
            feedback.textContent = error.message;
            element('retry').hidden = false;
        } finally { loading = false; }
    }
    document.addEventListener('event-tab-activated', event => { if (event.detail === 'panel-reports') load(); });
    element('retry').addEventListener('click', load);
    element('previous').addEventListener('click', () => participants(page - 1));
    element('next').addEventListener('click', () => participants(page + 1));
    element('participants-retry').addEventListener('click', () => participants());
    element('download').addEventListener('click', async () => {
        const button = element('download');
        button.disabled = true;
        button.textContent = 'Baixando…';
        try {
            const response = await request(`${panel.dataset.url}/download`);
            const url = URL.createObjectURL(await response.blob());
            const link = node('a');
            link.href = url;
            link.download = 'relatorio.xlsx';
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            feedback.textContent = 'Relatório baixado.';
        } catch (error) { feedback.textContent = error.message; }
        finally { button.disabled = false; button.textContent = 'Baixar relatório'; }
    });
})();
