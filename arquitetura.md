
architecture-beta
   group usuarios(cloud)[usuarios]
   group eventos(cloud)[Eventos]
   group pagamento(cloud)[Pagamento]
   group relatorio(cloud)[relatorio]
   group notificacoes(cloud)[notificacoes]
   group certificados(cloud)[certificados]
   group publico(cloud)[publico]

   service rf01(server)[RF01 Usuarios e perfis] in usuarios
   service rf02(server)[RF02 Eventos] in eventos
   service rf03(server)[RF03 Programacao] in eventos
   service rf04(server)[RF04 Consulta e busca] in publico
   service rf05(server)[RF05 Inscricoes] in eventos
   service rf06(server)[RF06 Capacidade e espera] in eventos
   service rf07(server)[RF07 Pagamentos] in pagamento
   service rf08(server)[RF08 Notificacoes] in notificacoes
   service rf09(server)[RF09 Checkin] in eventos
   service rf10(server)[RF10 Certificados] in certificados
   service rf11(server)[RF11 Relatorios] in relatorio


   rf02:B -- T:rf03
   rf04:R -- L:rf02
   rf04:R -- L:rf03
   rf05:R -- L:rf01
   rf05:T -- B:rf03
   rf05:B -- T:rf06
   rf09:R -- L:rf05
   rf10:R -- L:rf09