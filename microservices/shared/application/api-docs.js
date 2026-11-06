import express from 'express';
import swaggerUi from 'swagger-ui-express';

// Documentação da API: o contrato é um openapi.yaml escrito à mão em cada serviço (src/openapi.yaml).
// Serve o arquivo em /openapi.yaml e o Swagger UI em /docs. Montar antes do authenticate (é público).
export function apiDocs(specPath) {
    const router = express.Router();
    router.get('/openapi.yaml', (req, res) => res.type('text/yaml').sendFile(specPath));
    router.use('/docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerOptions: { url: '/openapi.yaml' } }));
    return router;
}
