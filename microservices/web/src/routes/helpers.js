const responseError = async (response) => {
    const text = await response.text();
    if (!text) return `Não foi possível concluir a operação (erro ${response.status}).`;
    try {
        const data = JSON.parse(text);
        return data.error?.message || data.message || data.error || text;
    } catch {
        return text;
    }
};

// Ação de formulário (Post/Redirect/Get): chama o serviço e redireciona.
// Em erro, volta para `back` com uma mensagem legível exibida pelo layout.
export const action = (call, next, back = next) => async (req, res) => {
    try {
        const response = await call(req);
        if (response.ok) return res.redirect(await next(req, response));
        const error = encodeURIComponent(await responseError(response));
        return res.redirect(`${back(req)}?error=${error}`);
    } catch (err) {
        console.error('Form action failed:', err);
        const error = encodeURIComponent('Não foi possível conectar ao serviço. Tente novamente.');
        return res.redirect(`${back(req)}?error=${error}`);
    }
};

// Lança erro com a mensagem do serviço; o Express 5 repassa ao error handler.
export const json = async (response) => {
    if (!response.ok) throw Object.assign(new Error(await response.text()), { status: response.status });
    return response.json();
};

// Campos vazios do formulário viram null (limpa o campo no PATCH).
export const orNull = (v) => (v === '' || v === undefined ? null : v);
export const numberOrNull = (v) => (orNull(v) == null ? null : Number(v));
