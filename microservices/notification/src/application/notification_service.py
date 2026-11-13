import asyncio
import logging
import time

logger = logging.getLogger("notification.delivery")


class NotificationService:
    def __init__(self, repository, sender, settings):
        self.repository, self.sender, self.settings = repository, sender, settings

    async def deliver_one(self):
        job = self.repository.claim(max(300, self.settings.smtp_timeout * 10))
        if not job:
            return False
        contact = job["contact"]
        if contact and not contact["active"]:
            self.repository.finish(job, "skipped", error="Conta desativada")
            return True
        if not contact or not contact["email"]:
            expired = time.time()-job["created_at"] >= self.settings.contact_wait
            self.repository.finish(job, "failed" if expired else "waiting_contact", delay=30, error="Contato não disponível")
            return True
        attempts = job["attempts"] + 1
        try:
            status = await asyncio.to_thread(self.sender.send, job, contact["email"])
        except Exception:
            logger.warning("Falha no envio id=%s tentativa=%s", job["id"], attempts)
            self.repository.finish(job, "failed" if attempts >= self.settings.max_attempts else "retry",
                attempts=attempts, delay=min(3600, self.settings.retry_base * 2**min(attempts-1, 12)),
                error="Não foi possível enviar a mensagem pelo SMTP", recipient=contact["email"])
        else:
            self.repository.finish(job, status, attempts=attempts, recipient=contact["email"])
        return True
