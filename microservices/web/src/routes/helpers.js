// Ação de formulário (Post/Redirect/Get): chama o serviço e redireciona.
// Em erro, volta para `back` com ?error=<mensagem do serviço>, exibida pelo layout.
export const action = (call, next, back = next) => async (req, res) => {
    const response = await call(req);
    if (response.ok) return res.redirect(await next(req, response));
    const error = encodeURIComponent(await response.text());
    res.redirect(`${back(req)}?error=${error}`);
};

// Lança erro com a mensagem do serviço; o Express 5 repassa ao error handler.
export const json = async (response) => {
    if (!response.ok) throw Object.assign(new Error(await response.text()), { status: response.status });
    return response.json();
};

// Campos vazios do formulário viram null (limpa o campo no PATCH).
export const orNull = (v) => (v === '' || v === undefined ? null : v);
export const numberOrNull = (v) => (orNull(v) == null ? null : Number(v));
