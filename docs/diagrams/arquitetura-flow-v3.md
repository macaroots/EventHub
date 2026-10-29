---
config:
  layout: dagre
---
flowchart LR
    RF01[RF01: Usuários e perfis]
    RF02[RF02: Eventos]
    RF03[RF03: Programação]
    RF04[RF04: Consulta e busca]
    RF05[RF05: Inscrições]
    RF06[RF06: Capacidade e espera]
    RF07[RF07: Pagamentos]
    RF08[RF08: Notificações]
    RF09[RF09: Check-in]
    RF10[RF10: Certificados]
    RF11[RF11: Relatórios]
    subgraph Identidade
        RF01
    end
    subgraph Secretaria
        RF02
        RF03
        RF11
    end
    subgraph Catálogo
        RF04
    end
    subgraph Credenciamento 
        RF05
        RF09
        RF06
    end
    subgraph Certificado 
        RF10
    end
    %% subgraph Fila
    %%   direction LR
    %%     RF06
    %%     RF06_9[RF06: Fila Check-in]
    %%     RF06_10[RF06: Fila Certificado]
    %% end
    subgraph Caixa
      RF07
    end
    subgraph Notificações
      RF08
    end
    RF02 --> RF01
    RF04 --> RF02 &  RF03
    RF06 --> RF05
    %% RF06_9 --> RF09
    %% RF06_10 --> RF10
    RF05 --> RF03
    RF05 --> RF01
    RF05 --> RF07
    RF05 --> RF08
    RF09 --> RF05
    RF08 --> RF01
    RF09 --> RF01
    RF10 --> RF01
    %% RF10 --> RF09
    %% RF09 --> RF10

    %% RF11 --> RF05
    %% RF11 --> RF09

