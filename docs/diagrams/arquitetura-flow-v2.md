---
config:
  layout: dagre
---
flowchart RL
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
    subgraph Eventos
        RF02
        RF03
        RF11
    end
    subgraph Público
        RF04
    end
    subgraph Credenciamento 
        RF10
        RF05
        RF09
    end
    subgraph Bilheteria
        RF06
    end
    subgraph Notificações
        RF08
    end
    subgraph Caixa
      RF07
    end
    RF02 --> RF01
    RF04 --> RF02 &  RF03
    RF05 --> RF01 &  RF03
    RF06 o--o RF05
    RF06 --> RF07
    RF05 --> RF08
    RF09 --> RF05
    RF09 --> RF01
    RF10 --> RF01
    RF10 --> RF09

