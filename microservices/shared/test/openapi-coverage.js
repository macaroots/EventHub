// Testes de cobertura da documentação: toda rota do código está no src/openapi.yaml e vice-versa.
// Lê o YAML por linhas (paths com 2 espaços, métodos com 4), sem dependência de parser.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const key = (method, path) => `${method.toUpperCase()} ${path.replace(/:(\w+)/g, '{$1}')}`;

export function documentedRoutes(specFile) {
    const routes = new Set();
    let path;
    for (const line of readFileSync(specFile, 'utf8').split('\n')) {
        const p = line.match(/^  (\/\S*):\s*$/);
        if (p) { path = p[1]; continue; }
        const m = line.match(/^    (\w+):/);
        if (path && m && METHODS.includes(m[1])) routes.add(key(m[1], path));
        if (/^\S/.test(line)) path = undefined; // saiu de paths:
    }
    return routes;
}

// Rotas declaradas literalmente: app.get('/x', ...) ou router.post('/y', ...).
export function sourceRoutes(srcDir) {
    const routes = new Set();
    for (const file of readdirSync(srcDir, { recursive: true }).filter(f => f.endsWith('.js'))) {
        const code = readFileSync(join(srcDir, file), 'utf8');
        for (const [, method, path] of code.matchAll(/(?:app|router)\.(get|post|put|patch|delete)\(\s*['`]([^'`$]+)['`]/g)) {
            routes.add(key(method, path));
        }
    }
    return routes;
}

// Rotas de um express.Router já montado (ex.: as geradas pelo CrudController).
export function routerRoutes(router) {
    return new Set(router.stack.filter(l => l.route).flatMap(l => Object.keys(l.route.methods).map(m => key(m, l.route.path))));
}
