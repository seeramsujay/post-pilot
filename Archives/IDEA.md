# Idea: PostPilot

## The Thing
A proactive Reddit moderation portal built on the Devvit Web framework. It intercepts the user's intent to publish by replacing the native Reddit composer with a stickied, interactive React webview. Users must draft their content inside this portal, which validates regex rules, blacklists, flairs, and minimum word counts locally before the content ever touches the Reddit API.

## The End Result
A user clicks a stickied post at the top of a subreddit. An embedded webview loads instantly. As they type their post title and body, dynamic red error states appear if their title lacks a required bracketed tag, if they use a blacklisted word, or if their word count is too low. The "Publish" button remains locked until the draft is perfect. If they try to ignore the portal and use the native Reddit post button, a background trigger instantly deletes their post and leaves an official moderator comment redirecting them back to the portal. Moderators get a private dashboard tracking exactly how much spam the portal has blocked.

## Why This Matters
Traditional moderation relies on AutoModerator reacting to bad posts after they hit the database. This creates a massive computational overhead, fills the subreddit with transient garbage, clutters the moderation queue, and pisses off users who spend 20 minutes formatting a post only to have it instantly deleted because they forgot a flair. Intercepting the submission at the client level fixes the root cause, transforming moderation from a janitorial task into architectural enforcement.

## Acceptable Tradeoffs
Rich media integration. Image and video uploads are completely stripped from this application. Pushing binary payloads through the Devvit server proxy risks hitting the hard 4MB payload limit and 30-second execution timeouts. Users are forced to use Markdown and host images externally (e.g., Imgur). We trade multimedia convenience for absolute structural control over the text.

## Non-Negotiables
Idempotency locks and backend verification. The Reddit API rate limits are aggressive. If a user spam-clicks the submit button on a slow connection, it cannot trigger multiple API calls. Redis NX locks are mandatory for every publish event. Furthermore, all client-side validation must be strictly re-verified on the backend (e.g., account age, karma) because client state can be manipulated. All legacy UI Block routing is strictly forbidden; this must utilize the Vite React webview architecture.

## The Mentality (Soul)
You are building a digital fortress. Assume the user will try to paste a 10MB base64 image into the text area. Assume 50 people will click publish at the exact same millisecond. Assume users will actively try to bypass the portal using the standard Reddit app. Trust absolutely nothing from the client, lock down the API gateway with Redis, and forcefully corral users into the validated sandbox. Defend the subreddit's integrity and the API rate limits like your life depends on it.
