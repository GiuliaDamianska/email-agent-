'use strict';

require('dotenv').config();
const { google } = require('googleapis');
const { z } = require('zod');
const { authorize } = require('./auth');

const _Anthropic = require('@anthropic-ai/sdk');
const Anthropic = _Anthropic.default || _Anthropic;
const anthropic = new Anthropic();

// --- Schema ---

const EmailSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  messageId: z.string().optional(),
});

// --- Gmail helpers ---

function decodeBase64Url(data) {
  return Buffer.from(
    data.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf-8');
}

function getHeader(headers, name) {
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function extractBody(payload) {
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback: recurse into nested parts
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return '';
}

async function fetchUnreadEmails(gmail) {
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread newer_than:1d',
    maxResults: 20,
  });

  const messages = list.data.messages || [];
  const emails = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });

    const headers = full.data.payload.headers;
    const from = getHeader(headers, 'From');
    const subject = getHeader(headers, 'Subject') || '(no subject)';
    const messageId = getHeader(headers, 'Message-ID') || undefined;
    const body = extractBody(full.data.payload).slice(0, 4000);

    emails.push(
      EmailSchema.parse({ id: msg.id, threadId: msg.threadId, from, subject, body, messageId })
    );
  }

  return emails;
}

// --- Claude ---

async function generateReply(email) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system:
      'You are a professional email assistant writing on behalf of Giulia. ' +
      'Match her style exactly: short, direct, warm, professional. No filler. ' +
      'Get to the point immediately. Never invent facts. Return email body only.',
    messages: [
      {
        role: 'user',
        content:
          `Reply to this email:\n` +
          `From: ${email.from}\n` +
          `Subject: ${email.subject}\n` +
          `Body: ${email.body}`,
      },
    ],
  });

  const block = response.content.find(b => b.type === 'text');
  return block ? block.text.trim() : '';
}

// --- Draft builder ---

function encodeBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildRawEmail({ to, subject, replyBody, inReplyTo }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ];

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push(`References: ${inReplyTo}`);
  }

  const raw = lines.join('\r\n') + '\r\n\r\n' + 'REVIEW REQUIRED\n\n' + replyBody;
  return encodeBase64Url(raw);
}

async function createDraft(gmail, email, replyBody) {
  const subject = /^re:/i.test(email.subject)
    ? email.subject
    : `Re: ${email.subject}`;

  const raw = buildRawEmail({
    to: email.from,
    subject,
    replyBody,
    inReplyTo: email.messageId,
  });

  await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw,
        threadId: email.threadId,
      },
    },
  });
}

// --- Skip filters ---

const SKIP_SENDER_PATTERNS = [
  'noreply', 'no-reply', 'mailer-daemon', 'notifications@', 'alert@',
  'security@', 'accounts@google.com', 'info@instagram.com', 'info@facebook.com',
];

const SKIP_SUBJECT_PATTERNS = [
  'security alert', 'verification code', 'otp', 'confirm your',
  'welcome to', 'your account is live',
];

function shouldSkip(email) {
  const fromLower = email.from.toLowerCase();
  const subjectLower = email.subject.toLowerCase();

  for (const pattern of SKIP_SENDER_PATTERNS) {
    if (fromLower.includes(pattern)) return `sender matches "${pattern}"`;
  }
  for (const pattern of SKIP_SUBJECT_PATTERNS) {
    if (subjectLower.includes(pattern)) return `subject matches "${pattern}"`;
  }
  return null;
}

// --- Main ---

async function main() {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  console.log('Fetching unread emails...');
  const emails = await fetchUnreadEmails(gmail);

  if (emails.length === 0) {
    console.log('No unread emails found.');
    return;
  }

  console.log(`Found ${emails.length} unread email(s). Generating replies...\n`);

  for (const email of emails) {
    console.log(`→ "${email.subject}"  from  ${email.from}`);
    const skipReason = shouldSkip(email);
    if (skipReason) {
      console.log(`  ↷ Skipped: ${skipReason}\n`);
      continue;
    }
    try {
      const reply = await generateReply(email);
      await createDraft(gmail, email, reply);
      console.log('  ✓ Draft saved\n');
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`);
    }
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
