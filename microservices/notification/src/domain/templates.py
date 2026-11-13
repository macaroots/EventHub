def render(kind, data):
    description = data.get("description") or "sua inscrição"
    reason = data.get("reason") or "Não informado pelo serviço de origem."
    reference = data.get("registrationId") or data.get("id") or ""
    if kind in {"CertificateIssued", "CertificateDenied"}:
        activities = ", ".join(activity["name"] for activity in data["activities"])
        if kind == "CertificateIssued":
            return "EventHub — Certificado disponível", f"Seu certificado do evento {data['eventName']} está disponível.\nAtividades com presença: {activities}.\nAcesse a aba Certificados no EventHub para baixar o documento."
        return "EventHub — Certificado não disponível", f"Não foi possível emitir o certificado do evento {data['eventName']}: não há presença registrada nas atividades.\nAtividades inscritas: {activities}.\nEm caso de dúvida, procure a organização."
    messages = {
        "CheckInOpened": ("Código de check-in disponível", f"O check-in da atividade {data.get('activityName') or 'inscrita'} está aberto. Seu código é: {data.get('code')}. Informe-o na sua inscrição. Um novo código invalida o anterior."),
        "PaymentRequested": ("Compra pendente — confirme sua compra", f"Seu pagamento para {description} está pendente. Conclua o pagamento dentro do prazo para confirmar sua compra. A reserva ainda não está confirmada."),
        "PaymentConfirmed": ("Pagamento da compra confirmado", f"Recebemos o pagamento para {description}. Comprovante: {data.get('receipt') or 'consulte seus pagamentos'}. A confirmação definitiva da inscrição será enviada separadamente pelo serviço de inscrições."),
        "PaymentDenied": ("Compra não confirmada — pagamento recusado", f"O pagamento da sua compra foi recusado. Motivo: {reason}\nA compra não foi confirmada. Consulte a inscrição e a disponibilidade antes de tentar novamente."),
        "PaymentExpired": ("Compra não confirmada — prazo expirado", "O prazo para pagar sua compra expirou. A compra não foi confirmada e a reserva deve ser liberada pelo serviço de inscrições. Consulte a disponibilidade antes de realizar uma nova inscrição."),
        "PaymentCanceled": ("Compra cancelada", f"A cobrança da sua compra foi cancelada. Motivo: {reason}\nEste aviso não confirma estorno ou reembolso."),
        "RegistrationCanceled": ("Compra / inscrição cancelada", "Sua inscrição foi cancelada e a vaga liberada. Consulte seus pagamentos se houver valor já pago; este aviso não confirma estorno ou reembolso."),
        "EventCanceledNotice": ("Evento cancelado", "O evento da sua inscrição foi cancelado pela organização. Sua inscrição foi cancelada; consulte seus pagamentos se houver valor já pago."),
        "RegistrationCreated": ("Solicitação de inscrição recebida", "Recebemos sua solicitação de inscrição. Consulte as pendências, o pagamento e a situação da reserva. Este aviso não é uma confirmação de vaga."),
        "RegistrationConfirmed": ("Inscrição confirmada", "Sua inscrição foi confirmada pelo serviço de inscrições. Consulte os detalhes da atividade na plataforma."),
    }
    subject, body = messages[kind]
    amount = data.get("amount")
    if isinstance(amount, (int, float)) and not isinstance(amount, bool):
        body += f"\nValor: R$ {amount:.2f}."
    if data.get("expiresAt"):
        body += f"\nPrazo: {data['expiresAt']}."
    return "EventHub — " + subject, body + f"\nReferência da inscrição: {reference}."
