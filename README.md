# PostPilot

Proactive Reddit moderation: validate and enforce subreddit rules inside a client-side React sandbox before the post is submitted.

Traditional Reddit moderation is reactive—bots scan and delete rule-breaking content after it pollutes the database. PostPilot shifts moderation left. Deployed as a stickied Devvit Web application, it provides an isolated drafting portal that enforces regex matching, length constraints, blacklists, and mandatory flairs locally. Posts that bypass the portal are aggressively removed by asynchronous backend triggers.

## Install

```bash
npm install -g @devvit/cli
devvit login
npm install
npm run build
devvit upload
devvit install <your-test-subreddit>
```

## Usage

Deploy the portal to your community via the native Mod Menu:

> In the Reddit UI, click the Mod Menu on your subreddit.
> Select "Deploy PostPilot Interactive Portal".
> The system generates a stickied post containing the React webview.

## How It Works

**Client-Side Validation:** The React frontend (bundled via Vite) fetches the subreddit's exact ruleset from a Redis Hash on mount. Input validation occurs locally in the Virtual DOM, providing instant feedback without network latency.

**Proxy Submission:** Upon validation, the draft is sent to the Devvit Node.js serverless proxy. The backend establishes a Redis NX idempotency lock to prevent duplicate submissions, verifies user karma/age, then executes `reddit.submitPost()` on the user's behalf.

**The Enforcer:** A global `PostSubmit` event trigger operates asynchronously in the background. It checks incoming post IDs against a Redis whitelist of portal-generated posts. Unverified native submissions are instantly removed and replied to with a distinguished warning.

## Status

Production. Features complete strict Devvit Web compliance, flat state machine routing, and Redis-backed telemetry. Media uploads (images/video) are intentionally disabled to respect strict 4MB serverless payload constraints.

## Contributing

Ensure all state management remains flat and centralized in `App.tsx`. Do not introduce native external packages requiring C++ bindings, as the Devvit V8 isolate environment will reject them.
