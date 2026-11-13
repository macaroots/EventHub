// Eventos criados por testes locais anteriores; preserva os dados e inscrições no serviço.
const hiddenEvents = new Set(['2cb5f8fb-888d-44de-94b2-94682d43fccd', '843f5a28-32c1-406f-9393-89ad4a85396f', '6831ca05-2c00-48e1-a4f1-52f0fa399deb']);
export const isHiddenTestEvent = id => hiddenEvents.has(id);
