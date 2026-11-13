import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { router } from '../src/routes/payment.js';

test('aba pagamentos autentica e apresenta apenas pagamentos da conta', async () => {
    process.env.JWT_SECRET='teste-pagamentos-chave';
    const token=jwt.sign({userId:'u1',username:'ana'},process.env.JWT_SECRET);
    const req={cookies:{token},method:'GET',originalUrl:'/payments'};
    const res={set(){return this}, layout(view,data){this.view=view;this.data=data;return this}, status(status){this.statusCode=status;return this}, clearCookie(){}, redirect(){throw new Error('redirecionamento inesperado')}};
    const oldFetch=globalThis.fetch;
    globalThis.fetch=async url=>{
        if (url.endsWith('/payments')) return Response.json([{id:'p1',registrationId:'r1',userId:'u1',amount:25,status:'paid'},{id:'p2',registrationId:'r2',userId:'u2',amount:10,status:'paid'}]);
        if (url.endsWith('/registrations')) return Response.json([{id:'r1',userId:'u1',event:{name:'Evento'}},{id:'r2',userId:'u2'}]);
        throw new Error(`Chamada inesperada: ${url}`);
    };
    try {
        const layer=router.stack.find(item=>item.route?.path==='/payments');
        assert.ok(layer);
        layer.route.stack[0].handle(req,res,()=>{});
        await layer.route.stack[1].handle(req,res,()=>{});
        assert.equal(res.view,'payments/list');
        assert.deepEqual(res.data.payments.map(p=>p.id),['p1']);
        assert.equal(res.data.payments[0].registration.event.name,'Evento');
    } finally {globalThis.fetch=oldFetch}
});
