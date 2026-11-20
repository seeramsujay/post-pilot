<p align="center">
  <img src="assets/logo.svg" alt="PostPilot Logo" width="220" />
</p>

<h1 align="center">PostPilot</h1>

<p align="center">
  <strong>Reddit Devvit Interactive Posting Portal, Pre-Submission Rule Validator, &amp; Automated Mod Enforcer.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Reddit_Devvit-FF4500.svg?style=flat-square&logo=reddit" alt="Devvit">
  <img src="https://img.shields.io/badge/Frontend-React_18_%7C_Vite-61DAFB.svg?style=flat-square&logo=react" alt="React & Vite">
  <img src="https://img.shields.io/badge/Cache-Devvit_Redis_KV-DC382D.svg?style=flat-square&logo=redis" alt="Redis">
  <img src="https://img.shields.io/badge/Testing-Vitest-6E9F18.svg?style=flat-square&logo=vitest" alt="Vitest">
  <a href="future.md"><img src="https://img.shields.io/badge/roadmap-future.md-blueviolet.svg?style=flat-square" alt="Roadmap"></a>
</p>

---

## ⚡ Overview

**PostPilot** transforms Reddit community onboarding and quality assurance by replacing standard Reddit submission boxes with an interactive, rich-client posting portal pinned to the top of the subreddit:

- **⚡ Zero-Latency Client Validation**: Real-time validation checklist (title regex, word counts, blacklist) matches subreddit rules as the user types.
- **🛡️ Digital Fortress Backend**: Secondary server-side validation in `main.tsx` checks account age and karma to prevent API spoofing.
- **🔒 Redis NX Idempotency Lock**: A 10-second submission lock eliminates duplicate posts under flaky connections.
- **🤖 Fallback Enforcer Trigger**: A background `PostSubmit` hook instantly quarantines native posts that bypass the portal, replying with an official mod warning.
- **📊 Moderator Telemetry Hub**: Private dashboard for moderators to view approved posts, block rates, and enforcer bypass counts.
- **✍️ Live Markdown Preview**: Custom lightweight parser renders rich text drafts instantly without heavy external dependencies.
- **🔋 Clipboard Pasteurizer**: Intercepts rich text/HTML paste events to strip binary media and prevent large payloads from breaching Devvit's 4MB limit.

---

## 🏗️ Architecture Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Subreddit Member
    participant C as React Client (WebView)
    participant B as Devvit Backend (main.tsx Runner)
    participant R as Reddit API & Redis
    
    User->>C: Open Stickied Portal
    C->>B: window.parent.postMessage('GET_RULES', requestId)
    B->>R: Fetch Subreddit Settings
    R-->>B: Rules Configuration
    B-->>C: ui.webView.postMessage(rules, requestId)
    Note over C: Instant feedback as user types
    User->>C: Click Publish Post
    C->>B: window.parent.postMessage('PUBLISH', { title, body, uuid }, requestId)
    Note over B: Acquire 10s Redis Lock
    B->>R: Verify account age & karma
    B->>R: Submit Post (RunAs: USER) & Apply Flair
    B->>R: Write portal_post:${postId} to Redis (1h TTL)
    B->>R: Increment Approved Stats
    B-->>C: ui.webView.postMessage({ success: true, url }, requestId)
```

---

## ⚙️ Configuration Schema

PostPilot rules are defined declaratively in the `devvit.json` settings schema:

| Setting Key | Type | Description |
| :--- | :--- | :--- |
| `title_regex` | `string` | Regex pattern that post titles must match (e.g., `^\[[a-zA-Z]+\].*$` for bracket tags). |
| `min_body` | `number` | Minimum character length for post markdown text. |
| `flair_id` | `string` | Reddit Flair Template UUID applied automatically upon publication. |
| `keyword_blacklist` | `string` | Comma-separated list of forbidden keywords (e.g. `crypto,scam,spam`). |
| `minimum_account_age` | `number` | Minimum age of the posting user's account in days. |
| `minimum_karma` | `number` | Minimum combined (link + comment) karma of the posting user. |
| `enforcer` | `boolean` | Global toggle to enable/disable the native post bypass enforcer. |

---

## 🚀 Installation & Deployment

### 1. Prerequisites
Ensure you are logged into your Reddit account via the CLI:
```bash
npx devvit login
```

### 2. Scaffold and Build
Install local dependencies and compile the React frontend assets:
```bash
npm install
npm run build
```

### 3. Playtesting (Local Development)
To test and verify changes instantly on your test subreddit before publishing:
```bash
npx devvit playtest <your-test-subreddit>
```

### 4. Publish to Registry
When ready to release your version to the Devvit App Directory, run:
```bash
npx devvit publish
```

### 5. Subreddit Installation
Install the published application on your subreddit:
```bash
npx devvit install <your-subreddit-name>
```

---

## 🧪 Testing Suite

PostPilot features a comprehensive testing system utilizing **Vitest** to isolate and mock Devvit plugins (Redis, Reddit API, and Subreddit Settings).

To execute the test suite:
```bash
npm test
```

---

## 🔮 Engineering Roadmap

To explore planned features including client-side Wasm image compression, on-device ONNX toxicity classification, and cross-subreddit shared moderation federation, read [future.md](future.md).

---

## 📄 License

Distributed under the MIT License.
