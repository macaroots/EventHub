// Cliente HTTP genérico: repassa o JWT do cookie como Bearer para os serviços.
export const api = (baseUrl) => (path, req, { body, headers, ...opts } = {}) =>
    fetch(baseUrl + path, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(req?.cookies?.token && { authorization: `Bearer ${req.cookies.token}` }),
            ...headers,
        },
        body: body && JSON.stringify(body),
    });
