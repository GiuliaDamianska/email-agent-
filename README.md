# Gmail AI Draft Reply Agent

Automatically generates draft email replies using Claude AI and saves them to your Gmail Drafts folder for review before sending.

## What it does

- Fetches unread emails from the last 24 hours (up to 20)
- Skips automated senders (noreply, alerts, notifications, etc.)
- Generates a concise, professional reply using Claude claude-opus-4-6
- Saves each reply as a draft in Gmail with a **REVIEW REQUIRED** prefix
- Nothing is sent automatically — every draft requires manual review and approval

## How it works

1. Authenticates with Gmail via OAuth2
2. Fetches unread emails using the Gmail API
3. Filters out automated/irrelevant senders and subjects
4. Sends each email to Claude claude-opus-4-6 for reply generation
5. Creates a Gmail draft in the correct thread, ready for your review

## Tech stack

- **Node.js** — runtime
- **Gmail API** (`googleapis`) — read emails, create drafts
- **Anthropic Claude API** (`@anthropic-ai/sdk`) — generate replies (claude-opus-4-6)
- **Zod** — runtime schema validation for email data
- **dotenv** — environment variable management

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd email-agent
npm install
```

### 2. Google Cloud OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Gmail API**
4. Go to **APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID**
5. Set application type to **Desktop app**
6. Download the credentials — you'll need the Client ID and Client Secret

### 3. Configure `.env`

Create a `.env` file in the project root:

```env
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REDIRECT_URI=http://localhost
GMAIL_REFRESH_TOKEN=           # leave blank for now
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Get your Anthropic API key at [console.anthropic.com](https://console.anthropic.com/).

### 4. Authorize Gmail access

Run the auth script without arguments — it will print an authorization URL:

```bash
node auth.js
```

Visit the URL, approve access, then copy the `code` from the redirect URL and run:

```bash
node auth.js <authorization_code>
```

Copy the printed `GMAIL_REFRESH_TOKEN` into your `.env` file.

### 5. Run the agent

```bash
node index.js
```

The agent will fetch unread emails, generate replies, and save drafts. Check your Gmail Drafts folder to review and send.

## Security notes

- **OAuth scope used:** `https://www.googleapis.com/auth/gmail.modify` — allows reading emails and creating drafts, but not deleting or sending
- **Nothing sends automatically** — every generated reply is saved as a draft with a `REVIEW REQUIRED` prefix and must be manually reviewed before sending
- **No credentials are stored in code** — all secrets are read from `.env` (never commit this file)
- **`.env` and `credentials.json` should be in `.gitignore`** to avoid leaking credentials
