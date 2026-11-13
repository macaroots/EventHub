import logging
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger("notification.email")


class EmailSender:
    def __init__(self, settings):
        self.settings = settings

    def send(self, job, recipient):
        if self.settings.email_mode == "log":
            logger.info("EMAIL_LOG id=%s to=%s subject=%s\n%s", job["id"], recipient, job["subject"], job["body"])
            return "logged"
        message = EmailMessage()
        message["From"] = self.settings.smtp_from
        message["To"] = recipient
        message["Subject"] = job["subject"]
        message["Message-ID"] = f"<{job['id']}@eventhub.notification>"
        message.set_content(job["body"])
        factory = smtplib.SMTP_SSL if self.settings.smtp_ssl else smtplib.SMTP
        options = {"timeout": self.settings.smtp_timeout}
        if self.settings.smtp_ssl:
            options["context"] = ssl.create_default_context()
        with factory(self.settings.smtp_host, self.settings.smtp_port, **options) as smtp:
            if self.settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
            if self.settings.smtp_username:
                smtp.login(self.settings.smtp_username, self.settings.smtp_password)
            if smtp.send_message(message):
                raise RuntimeError("Destinatário recusado pelo SMTP")
        return "sent"
