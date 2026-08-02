/**
 * WhatsApp messaging service.
 *
 * Right now no WhatsApp credentials exist, so every message is "stubbed":
 * it is logged to the console and saved in the whatsapp_logs table with
 * status = 'stubbed', but nothing is sent over the network.
 *
 * When you're ready to go live, set WHATSAPP_PROVIDER in .env to either
 * "twilio" or "meta" and fill in the matching credentials below — no
 * other code in the app needs to change, because every caller just
 * calls sendMessage({ to, message, type, patientId }).
 */
const db = require('../db/connection');

const PROVIDER = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase();

async function sendViaTwilio(to, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+14155238886'

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: fromNumber,
    Body: message,
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function sendViaMeta(to, message) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

/**
 * Send a WhatsApp message (or stub it) and log the attempt.
 * @param {Object} opts
 * @param {string} opts.to - phone number in international format, e.g. +9198xxxxxxx
 * @param {string} opts.message - message body
 * @param {string} [opts.type] - one of vaccine_reminder | appointment_reminder | fee_reminder | payment_confirmation | general
 * @param {number} [opts.patientId]
 */
async function sendMessage({ to, message, type = 'general', patientId = null }) {
  let status = 'stubbed';
  let providerResponse = null;

  try {
    if (PROVIDER === 'twilio') {
      providerResponse = await sendViaTwilio(to, message);
      status = 'sent';
    } else if (PROVIDER === 'meta') {
      providerResponse = await sendViaMeta(to, message);
      status = 'sent';
    } else {
      // No provider configured yet — just log it.
      console.log(`[WhatsApp STUB] To: ${to} | Type: ${type} | Message: ${message}`);
    }
  } catch (err) {
    status = 'failed';
    providerResponse = { error: err.message };
    console.error(`[WhatsApp ERROR] To: ${to} | Type: ${type} |`, err.message);
  }

  db.prepare(
    `INSERT INTO whatsapp_logs (patient_id, phone, message, message_type, status, provider_response)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(patientId, to, message, type, status, providerResponse ? JSON.stringify(providerResponse) : null);

  return { status, providerResponse };
}

module.exports = { sendMessage, PROVIDER };
