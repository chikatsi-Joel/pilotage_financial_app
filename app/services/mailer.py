"""Envoi d'emails via le serveur SMTP configuré (`SMTP_*` dans `.env`).

Sans `SMTP_HOST`, le message est simplement écrit dans les logs du serveur :
pratique en développement, à ne jamais laisser ainsi en production.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings
from app.services.errors import EmailDeliveryError

log = logging.getLogger(__name__)


def _send_blocking(message: EmailMessage) -> None:
    host, port = settings.smtp_host, settings.smtp_port
    context = ssl.create_default_context()
    if settings.smtp_security == "ssl":
        server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=settings.smtp_timeout, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=settings.smtp_timeout)
    with server:
        if settings.smtp_security == "starttls":
            server.starttls(context=context)
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


async def send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        log.warning("SMTP non configuré : email à %s (%s)\n%s", to, subject, body)
        return
    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_username
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        await asyncio.to_thread(_send_blocking, message)
    except (OSError, smtplib.SMTPException):
        log.exception("Échec d'envoi d'email à %s", to)
        raise EmailDeliveryError("Impossible d'envoyer l'email pour le moment") from None
