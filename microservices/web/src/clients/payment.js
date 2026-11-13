import { api } from './http.js';

const call = api(process.env.PAYMENT_URL || 'http://payment:3000');
const id = encodeURIComponent;

export const listPayments = (req) => call('/payments', req);
export const getPayment = (req, paymentId) => call(`/payments/${id(paymentId)}`, req);
export const pay = (req, paymentId, receipt, simulateStatus = 'success') => call(`/payments/${id(paymentId)}/pay`, req, { method: 'POST', body: { receipt, simulateStatus } });
