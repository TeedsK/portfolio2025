# backend/app.py
import logging
import os
import re
import smtplib
from email.message import EmailMessage
from email.utils import formatdate
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

import model_loader

load_dotenv()

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.DEBUG,
                    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
app.logger.setLevel(logging.DEBUG)

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _clean_str(data: dict, key: str) -> str:
    value = data.get(key, "")
    return value.strip() if isinstance(value, str) else ""


def _send_contact_email(name: str, sender_email: str, subject: str, message: str) -> None:
    recipient_email = os.getenv("CONTACT_TO_EMAIL", "ttkremer@gmail.com")
    from_email = os.getenv("CONTACT_FROM_EMAIL")
    smtp_username = os.getenv("SMTP_USERNAME") or from_email
    smtp_password = (
        os.getenv("SMTP_PASSWORD")
        or os.getenv("CONTACT_FROM_PASSWORD")
        or os.getenv("CONTACT_EMAIL_PASSWORD")
    )
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_use_ssl = _env_bool("SMTP_USE_SSL", False)
    smtp_use_tls = _env_bool("SMTP_USE_TLS", not smtp_use_ssl)

    if not from_email:
        raise RuntimeError("Missing CONTACT_FROM_EMAIL.")
    if not smtp_username:
        raise RuntimeError("Missing SMTP username.")
    if not smtp_password:
        raise RuntimeError("Missing SMTP password.")

    outbound = EmailMessage()
    outbound["Subject"] = f"[Portfolio Contact] {subject}"
    outbound["From"] = from_email
    outbound["To"] = recipient_email
    outbound["Reply-To"] = sender_email
    outbound.set_content(
        "New contact form submission from ttkremer.com\n\n"
        f"Name: {name}\n"
        f"Email: {sender_email}\n"
        f"Submitted: {formatdate(localtime=True)}\n\n"
        "Message:\n"
        f"{message}\n"
    )

    if smtp_use_ssl:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as server:
            server.login(smtp_username, smtp_password)
            server.send_message(outbound)
        return

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.ehlo()
        if smtp_use_tls:
            server.starttls()
            server.ehlo()
        server.login(smtp_username, smtp_password)
        server.send_message(outbound)


# --- load model once ---
with app.app_context():
    ok = model_loader.load_model()
    app.logger.info("Model init: %s", "success" if ok else "FAILED")

# ------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health_check():
    status = model_loader.symspell_model is not None
    return jsonify({
        "status": "healthy" if status else "unhealthy",
        "model_loaded": status,
        "model_name": model_loader.MODEL_NAME
    }), 200 if status else 500

# ------------------------------------------------------------------
@app.route("/api/check_typos", methods=["POST"])
def check_typos_endpoint():
    if model_loader.symspell_model is None:
        return jsonify({"error": "Model unavailable."}), 503

    data = request.get_json(silent=True) or {}
    sentence = data.get("sentence", "")
    top_k     = int(data.get("top_k", 3))

    if not isinstance(sentence, str):
        return jsonify({"error": "'sentence' must be a string"}), 400
    if not sentence.strip():
        return jsonify({
            "original_sentence": sentence,
            "corrected_sentence": "",
            "token_details": [],
            "model_name": model_loader.MODEL_NAME,
            "processing_time_ms": 0.0,
            "corrections_made": False,
            "message": "Input sentence was empty."
        }), 200

    corrected, ms, changed, token_info = model_loader.correct_text(sentence, top_k)

    return jsonify({
        "original_sentence":   sentence,
        "corrected_sentence":  corrected,
        "token_details":       token_info,      # NEW: per-token probs
        "model_name":          model_loader.MODEL_NAME,
        "processing_time_ms":  round(ms, 2),
        "corrections_made":    changed,
        "message":             "Typos checked successfully."
    }), 200

# ------------------------------------------------------------------
@app.route("/api/contact", methods=["POST"])
def contact_email_endpoint():
    data = request.get_json(silent=True) or {}

    name = _clean_str(data, "name")
    sender_email = _clean_str(data, "email")
    subject = _clean_str(data, "subject")
    message = _clean_str(data, "message")
    company = _clean_str(data, "company")

    # Honeypot spam trap: pretend success, skip delivery.
    if company:
        app.logger.info("Contact form honeypot triggered; message skipped.")
        return jsonify({"message": "Email sent successfully."}), 200

    if not name or not sender_email or not subject or not message:
        return jsonify({"error": "Missing required fields."}), 400

    if not EMAIL_REGEX.match(sender_email):
        return jsonify({"error": "A valid email address is required."}), 400

    if len(name) > 120 or len(sender_email) > 160 or len(subject) > 180 or len(message) > 5000:
        return jsonify({"error": "One or more fields exceed allowed length."}), 400

    try:
        _send_contact_email(name, sender_email, subject, message)
    except Exception as err:
        app.logger.exception("Failed to deliver contact email: %s", err)
        return jsonify({"error": "Unable to send email right now. Please try again shortly."}), 500

    return jsonify({"message": "Email sent successfully."}), 200


# ------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
