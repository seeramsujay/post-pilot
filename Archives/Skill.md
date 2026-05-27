# Skill: deploy-devvit-app

## When to use
You need to compile the Vite React frontend and Node.js backend into a unified Devvit bundle and upload it to the Reddit platform.

## Prerequisites
- Devvit CLI installed globally (`npm install -g @devvit/cli`)
- Authenticated with Reddit via `devvit login`
- Subreddit available for testing with developer permissions

## Steps
1. Run `npm run build` in the project root to trigger the Vite bundler.
2. Run `devvit upload` to push the bundled assets to the Reddit developer servers.
3. Run `devvit install <subreddit-name>` to deploy the uploaded version to a specific test subreddit.

## Output
CLI success message confirming the new version string and a direct link to the installed application on the target subreddit.

## Failure modes
- **"No edge context provided for app settings"**: The settings schema is incorrectly placed in code instead of `devvit.json`. Move all settings to `devvit.json`.
- **"Bundle exceeds 4MB limit"**: The client payload is too large. Ensure media uploads are disabled and large libraries are excluded from the client dist.
