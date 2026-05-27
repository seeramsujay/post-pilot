import { Devvit, RunAs } from '@devvit/public-api';

// Configure Devvit application settings schema
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// 1. Moderator Deploy Menu Item
Devvit.addMenuItem({
  label: 'Deploy PostPilot Interactive Portal',
  description: 'Submit a stickied custom post hosting the PostPilot composer.',
  location: 'subreddit',
  forUserType: 'moderator',
  async onPress(event, context) {
    const subredditName = context.subredditName!;

    try {
      // Submit custom post hosting the portal composer
      const post = await context.reddit.submitCustomPost({
        subredditName,
        title: '🚀 PostPilot Subreddit Submission Portal',
        entrypoint: 'default',
      });

      // Sticky the post in slot 1
      await post.sticky(1);

      context.ui.showToast({
        text: 'PostPilot composer portal successfully deployed!',
        appearance: 'success',
      });
    } catch (err: any) {
      console.error('Failed to deploy PostPilot portal:', err);
      context.ui.showToast({
        text: `Failed to deploy portal: ${err.message || err}`,
        appearance: 'destructive',
      });
    }
  },
});

// 2. Global Fallback PostSubmit Enforcer Trigger
Devvit.addTrigger({
  event: 'PostSubmit',
  async onEvent(event, context) {
    const postId = event.post?.id;
    if (!postId) return;

    try {
      // Check enforcer toggle
      const enforcerEnabled = await context.settings.get<boolean>('enforcer');
      if (enforcerEnabled === false) return;

      // Check if post is whitelisted
      const whitelistKey = `portal_post:${postId}`;
      const whitelisted = await context.redis.get(whitelistKey);

      if (!whitelisted) {
        // Increment bypass statistics
        await context.redis.incr('stats:enforcer_bypassed');

        // Fetch and remove post
        const post = await context.reddit.getPostById(postId);
        await post.remove(false);

        // Submit sticky comment response
        const comment = await context.reddit.submitComment({
          id: postId,
          text: `⚠️ **PostPilot Moderation Portal Enforcer** ⚠️\n\nYour post has been removed because it bypassed this subreddit's mandatory submission verification portal.\n\nPlease submit all new posts using our interactive web portal stickied at the top of the subreddit page.`,
        });
        await comment.distinguish(true);
      }
    } catch (err) {
      console.error(`Enforcer failed on post ${postId}:`, err);
    }
  },
});

// 3. Custom Post Type Rendering WebView & Handling Messages
Devvit.addCustomPostType({
  name: 'postpilot_portal',
  render: (context) => {
    return (
      <vstack grow>
        <webview
          id="portal_webview"
          url="index.html"
          grow
          onMessage={async (msg, { ui }) => {
            const message = msg as { type: string; requestId: number; payload?: any };
            const { type, requestId, payload } = message;

            const sendResponse = (data: any = null, error: string | null = null) => {
              ui.webView.postMessage('portal_webview', {
                requestId,
                payload: data,
                error,
              });
            };

            try {
              if (type === 'GET_RULES') {
                const rules = {
                  title_regex: (await context.settings.get<string>('title_regex')) || '',
                  min_body: (await context.settings.get<number>('min_body')) || 0,
                  flair_id: (await context.settings.get<string>('flair_id')) || '',
                  keyword_blacklist: (await context.settings.get<string>('keyword_blacklist')) || '',
                  minimum_account_age: (await context.settings.get<number>('minimum_account_age')) || 0,
                  minimum_karma: (await context.settings.get<number>('minimum_karma')) || 0,
                };
                sendResponse(rules);
              } else if (type === 'GET_USER_STATUS') {
                const user = await context.reddit.getCurrentUser();
                if (!user) {
                  sendResponse({ isMod: false, username: null });
                  return;
                }
                const username = user.username;
                const mods = await context.reddit.getModerators({
                  subredditName: context.subredditName!,
                  username,
                }).all();
                const isMod = mods.length > 0;
                sendResponse({ isMod, username });
              } else if (type === 'GET_STATS') {
                const approved = parseInt((await context.redis.get('stats:approved')) || '0', 10);
                const rejected = parseInt((await context.redis.get('stats:rejected')) || '0', 10);
                const enforcerBypassed = parseInt((await context.redis.get('stats:enforcer_bypassed')) || '0', 10);
                sendResponse({
                  approved,
                  rejected,
                  enforcer_bypassed: enforcerBypassed,
                });
              } else if (type === 'PUBLISH') {
                const { title, body, uuid } = payload;

                // Idempotency Lock
                const lockKey = `submit_lock:${uuid}`;
                const acquired = await context.redis.set(lockKey, 'locked', {
                  expiration: new Date(Date.now() + 10000), // 10s TTL
                  nx: true,
                });
                if (!acquired) {
                  sendResponse(null, 'Duplicate submission request ignored.');
                  return;
                }

                // Fetch settings rules
                const titleRegex = (await context.settings.get<string>('title_regex')) || '';
                const minBody = (await context.settings.get<number>('min_body')) || 0;
                const keywordBlacklist = (await context.settings.get<string>('keyword_blacklist')) || '';
                const minimumAccountAge = (await context.settings.get<number>('minimum_account_age')) || 0;
                const minimumKarma = (await context.settings.get<number>('minimum_karma')) || 0;

                // User verification
                const user = await context.reddit.getCurrentUser();
                if (!user) {
                  sendResponse(null, 'User not authenticated.');
                  return;
                }

                // Age Verification
                const accountAge = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                if (accountAge < minimumAccountAge) {
                  await context.redis.incr('stats:rejected');
                  sendResponse(null, `Account age (${Math.floor(accountAge)} days) does not meet minimum age restriction (${minimumAccountAge} days).`);
                  return;
                }

                // Combined Karma Verification
                const combinedKarma = (user.linkKarma || 0) + (user.commentKarma || 0);
                if (combinedKarma < minimumKarma) {
                  await context.redis.incr('stats:rejected');
                  sendResponse(null, `User combined karma (${combinedKarma}) does not meet the minimum combined karma threshold (${minimumKarma}).`);
                  return;
                }

                // Title Validation
                if (titleRegex) {
                  const regex = new RegExp(titleRegex);
                  if (!regex.test(title)) {
                    await context.redis.incr('stats:rejected');
                    sendResponse(null, 'Title does not match submission format requirements.');
                    return;
                  }
                }

                // Body Length Validation
                if (body.length < minBody) {
                  await context.redis.incr('stats:rejected');
                  sendResponse(null, `Body text must be at least ${minBody} characters long.`);
                  return;
                }

                // Keyword Blacklist
                if (keywordBlacklist) {
                  const blacklist = keywordBlacklist.split(',').map((w) => w.trim().toLowerCase());
                  const content = `${title} ${body}`.toLowerCase();
                  const found = blacklist.filter((word) => word && content.includes(word));
                  if (found.length > 0) {
                    await context.redis.incr('stats:rejected');
                    sendResponse(null, `Submission contains blacklisted keywords: ${found.join(', ')}.`);
                    return;
                  }
                }

                // Submit Post to Subreddit on user's behalf
                const post = await context.reddit.submitPost({
                  title,
                  subredditName: context.subredditName!,
                  runAs: RunAs.USER,
                  userGeneratedContent: {
                    text: body || '',
                  },
                });

                // Auto-assign Flair
                const flairId = await context.settings.get<string>('flair_id');
                if (flairId) {
                  try {
                    await context.reddit.setPostFlair({
                      postId: post.id,
                      flairTemplateId: flairId,
                    });
                  } catch (flairErr: any) {
                    console.error(`Failed to set post flair: ${flairErr.message}`);
                  }
                }

                // Add to Whitelist
                const whitelistKey = `portal_post:${post.id}`;
                await context.redis.set(whitelistKey, 'true', { ex: 3600 }); // 1h whitelist TTL

                // Increment approved metrics
                await context.redis.incr('stats:approved');

                sendResponse({ success: true, url: post.permalink });
              }
            } catch (err: any) {
              console.error(`Error handling webview message type ${type}:`, err);
              sendResponse(null, err.message || 'Server error occurred.');
            }
          }}
        />
      </vstack>
    );
  },
});

export default Devvit;
