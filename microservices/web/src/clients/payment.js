import { api } from './http.js';

const call = api(process.env.PAYMENT_URL || 'http://payment:3004');
const id = encodeURIComponent;

export const getPayment = (req, paymentId) => call(`/payments/${id(paymentId)}`, req);
export const pay = (req, paymentId, receipt) => call(`/payments/${id(paymentId)}/pay`, req, { method: 'POST', body: { receipt } });
