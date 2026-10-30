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
    end
    subgraph Certificados
        RF10
    end
    subgraph Catálogo
        RF04
    end
    subgraph Credenciamento 
        RF05
    %% end
    %% subgraph Fila
    %%   direction LR
        RF06
    end
    subgraph Portaria 
        RF09
    end
    subgraph Monitoramento e Relatórios 
        RF11
    end
    subgraph Caixa
      RF07
    end
    subgraph Notificações
      RF08
    end
    RF02 --> RF01
    RF04 --> RF02 &  RF03
    RF06 <--> RF05
    RF05 --> RF03
    RF05 --> RF01
    RF05 --> RF07
    RF05 --> RF08
    RF08 --> RF01
    RF09 --> RF01
    RF10 --> RF01