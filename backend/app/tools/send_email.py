import logging

from app.config import settings

logger = logging.getLogger("app.tools.send_email")


async def send_email(to: str, subject: str, body: str) -> dict:
    """ALLOW / approval_required / MEDIUM risk.

    EMAIL_MODE=demo is the only mode implemented this dispatch: never sends
    externally, just logs and returns a demo-sent confirmation.
    """
    if settings.email_mode != "demo":
        raise NotImplementedError(f"EMAIL_MODE={settings.email_mode!r} not implemented; only 'demo' is supported")
    logger.info("DEMO EMAIL SENT to=%s subject=%s", to, subject)
    return {"status": "sent", "mode": "demo", "to": to, "subject": subject}
