%% swimlane-beta LR
architecture-beta
   group api(cloud)[API]
   group gerencia(cloud)[Gerencia]
   group gerencia2(cloud)[Gerencia2] in gerencia


   service rf01(server)[RF01 Usuarios e perfis] in gerencia
   service rf02(server)[RF02 Eventos] in api
   service rf03(server)[RF03 Programacao] in api
   service rf04(server)[RF04 Consulta e busca] in api
   service rf05(server)[RF05 Inscricoes] in api
   service rf06(server)[RF06 Capacidade e espera] in api
   service rf07(server)[RF07 Pagamentos] in api
   service rf08(server)[RF08 Notificacoes] in api
   service rf09(server)[RF09 Checkin] in api
   service rf10(server)[RF10 Certificados] in api
   service rf11(server)[RF11 Relatorios] in api


   rf04:R -- L:rf02
   %% rf04:L -- R:rf03
   rf05:L -- R:rf01
   %% rf05:B -- R:rf02
   %% rf05:T -- R:rf06
   %% rf05:R -- R:rf07
   %% rf05:L -- R:rf08
   %% rf09:L -- R:rf05
   %% rf10:L -- R:rf09

