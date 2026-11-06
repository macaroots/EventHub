# Título: Relatórios a partir do registro de todos os eventos
Número do ADR: 005
Data: 2026-11-03
Responsável: Renato
Status: Proposto

## Contexto
É preciso responder perguntas que cruzam serviços, como "quantos eventos?", "quantos usuários?" e "quantas inscrições?", sem consultar o banco de cada serviço.

## Decisão
Criar um microsserviço `report` que:
- recebe todos os eventos por uma fila própria ligada a `#` no exchange `topic`;
- grava cada evento bruto numa tabela só de inserção (`id`, `type`, `source`, `time`, `data` JSON);
- responde a consultas fixas (SQL ou projeções) sobre esses eventos. Consultas livres, inclusive em linguagem natural, ficam para depois.

Para isso, o `publish` do bus inclui `id`, `source` e `time` em toda mensagem ([envelope](../../microservices/contracts/README.md#envelope)).

## Justificativa
- Nenhum serviço muda: o exchange `topic` já permite assinar todos os eventos.
- Guardar o evento bruto permite criar relatórios novos reprocessando o histórico.
- Com o `id`, um evento entregue em duplicidade é descartado e não é contado duas vezes.

## Alternativas Consideradas
- **Consultar a API ou o banco de cada serviço:** acopla os relatórios aos modelos internos e põe carga nos serviços.
- **Cada serviço com seus relatórios:** não responde perguntas que cruzam serviços.
- **Ferramenta de BI ou data warehouse:** pode ser o destino no futuro, mas é desproporcional agora.

## Consequências
- **Começar a gravar cedo:** o RabbitMQ não guarda histórico, e eventos anteriores ao serviço se perdem.
- Os números ficam um pouco atrasados em relação aos serviços; o relatório não é fonte da verdade.
- A qualidade dos relatórios depende do conteúdo dos eventos. Eventos que trazem pouco dado limitam as perguntas possíveis.
- **LGPD:** o serviço guarda cópia de dados pessoais. Gravar só o necessário, de preferência ids.

## Referências
- [comunicacao-assincrona.md](comunicacao-assincrona.md)
- [monitoramento.md](monitoramento.md)
