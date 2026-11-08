# Título: Comunicação entre serviços
Número do ADR: 001
Data: 2026-10-30
Responsável: 
Status: 

## Contexto
No início do projeto, precisamos definir a comunicação entre os serviços.

## Decisão

Comunicação assíncrona através de um broker de mensagens, RabbitMq.

## Justificativa

Priorizando desacoplamento entre serviços, para que cada time possa trabalhar nos seu serviço sem conhecer os outros.

## Alternativas Consideradas

- Kafka
- Comunicação síncrona com HTTP

## Consequências

- Complexidade para acompanhar o fluxo completo.
- Desacoplamento.

## Referências
