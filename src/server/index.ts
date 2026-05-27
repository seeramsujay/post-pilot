import { Hono } from 'hono';
import { reddit, redis, settings, context } from '@devvit/web/server';
import { RunAs } from '@devvit/public-api';

const app = new Hono();

// Helper to calculate account age in days
function getAccountAgeInDays(createdAt: Date): number {
  const diffMs = Date.now() - createdAt.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

// 1. GET /api/rules
app.get('/api/rules', async (c) => {
  try {
    const titleRegex = (await settings.get<string>('title_regex')) || '';
    const minBody = (await settings.get<number>('min_body')) || 0;
    const flairId = (await settings.get<string>('flair_id')) || '';
    const keywordBlacklist = (await settings.get<string>('keyword_blacklist')) || '';
    const minimumAccountAge = (await settings.get<number>('minimum_account_age')) || 0;
    const minimumKarma = (await settings.get<number>('minimum_karma')) || 0;

    return c.json({
      title_regex: titleRegex,
      min_body: minBody,
      flair_id: flairId,
      keyword_blacklist: keywordBlacklist,
      minimum_account_age: minimumAccountAge,
      minimum_karma: minimumKarma,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 2. GET /api/user-status
app.get('/api/user-status', async (c) => {
  try {
    const user = await reddit.getCurrentUser();
    if (!user) {
      return c.json({ isMod: false, username: null });
    }
    const username = user.username;
    const mods = await reddit.getModerators({
      subredditName: context.subredditName!,
      username,
    }).all();
    const isMod = mods.length > 0;
    return c.json({ isMod, username });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 3. POST /api/publish
app.post('/api/publish', async (c) => {
  try {
    const { title, body, uuid } = await c.req.json();

    if (!title || !uuid) {
      return c.json({ error: 'Title and uuid are required' }, 400);
    }

    // A. Idempotency Lock (15s TTL)
    const lockKey = `lock:publish:${uuid}`;
    const acquired = await redis.set(lockKey, 'true', { nx: true, ex: 15 });
    if (!acquired) {
      return c.json({ error: 'Duplicate submission detected' }, 409);
    }

    // B. Fetch author settings and user status
    const titleRegexStr = (await settings.get<string>('title_regex')) || '';
    const minBody = (await settings.get<number>('min_body')) || 0;
    const flairId = (await settings.get<string>('flair_id')) || '';
    const keywordBlacklistStr = (await settings.get<string>('keyword_blacklist')) || '';
    const minimumAccountAge = (await settings.get<number>('minimum_account_age')) || 0;
    const minimumKarma = (await settings.get<number>('minimum_karma')) || 0;

    const user = await reddit.getCurrentUser();
    if (!user) {
      await redis.incr('stats:rejected');
      return c.json({ error: 'Not authenticated with Reddit' }, 401);
    }

    // C. Server-side validation
    // i. Account age & karma validation
    const ageDays = getAccountAgeInDays(user.createdAt);
    const combinedKarma = user.linkKarma + user.commentKarma;

    if (ageDays < minimumAccountAge) {
      await redis.incr('stats:rejected');
      return c.json({ error: `Account age must be at least ${minimumAccountAge} days (yours is ${Math.floor(ageDays)} days)` }, 400);
    }

    if (combinedKarma < minimumKarma) {
      await redis.incr('stats:rejected');
      return c.json({ error: `Combined karma must be at least ${minimumKarma} (yours is ${combinedKarma})` }, 400);
    }

    // ii. Title regex check
    if (titleRegexStr) {
      const titleRegex = new RegExp(titleRegexStr);
      if (!titleRegex.test(title)) {
        await redis.incr('stats:rejected');
        return c.json({ error: `Title does not match required pattern: ${titleRegexStr}` }, 400);
      }
    }

    // iii. Min body length check
    const bodyLen = body ? body.length : 0;
    if (bodyLen < minBody) {
      await redis.incr('stats:rejected');
      return c.json({ error: `Body must be at least ${minBody} characters (yours is ${bodyLen})` }, 400);
    }

    // iv. Blacklisted keywords check
    if (keywordBlacklistStr) {
      const blacklist = keywordBlacklistStr.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
      const lowerTitle = title.toLowerCase();
      const lowerBody = (body || '').toLowerCase();
      const containsForbidden = blacklist.some((word) => lowerTitle.includes(word) || lowerBody.includes(word));
      if (containsForbidden) {
        await redis.incr('stats:rejected');
        return c.json({ error: 'Submission contains forbidden keywords' }, 400);
      }
    }

    // D. Submit post on user's behalf
    const post = await reddit.submitPost({
      title,
      subredditName: context.subredditName!,
      runAs: RunAs.USER,
      userGeneratedContent: {
        text: body || '',
      },
    });

    // E. Apply flair asynchronously
    if (flairId) {
      try {
        await reddit.setPostFlair({
          postId: post.id,
          flairTemplateId: flairId,
        });
      } catch (flairErr: any) {
        console.error(`Failed to set post flair: ${flairErr.message}`);
      }
    }

    // F. Store verification in Redis (1h TTL) to whitelist
    const whitelistKey = `portal_post:${post.id}`;
    await redis.set(whitelistKey, 'true', { ex: 3600 });

    // G. Record success statistics
    await redis.incr('stats:approved');

    return c.json({ success: true, postId: post.id, url: post.permalink });
  } catch (error: any) {
    console.error(`Error in publish endpoint: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// 4. GET /api/stats
app.get('/api/stats', async (c) => {
  try {
    const approved = parseInt((await redis.get('stats:approved')) || '0', 10);
    const rejected = parseInt((await redis.get('stats:rejected')) || '0', 10);
    const enforcerBypassed = parseInt((await redis.get('stats:enforcer_bypassed')) || '0', 10);
    return c.json({
      approved,
      rejected,
      enforcer_bypassed: enforcerBypassed,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 5. POST /internal/on-post-submit
app.post('/internal/on-post-submit', async (c) => {
  try {
    const data = await c.req.json();
    const postId = data.postId;

    if (!postId) {
      return c.json({ success: false, error: 'No postId provided' }, 400);
    }

    // Check enforcer toggle
    const enforcerEnabled = await settings.get<boolean>('enforcer');
    if (enforcerEnabled === false) {
      return c.json({ success: true, message: 'Enforcer is disabled' });
    }

    // Check if post is whitelisted
    const whitelistKey = `portal_post:${postId}`;
    const whitelisted = await redis.get(whitelistKey);

    if (!whitelisted) {
      // 1. Increment bypass statistics
      await redis.incr('stats:enforcer_bypassed');

      // 2. Fetch and remove post
      const post = await reddit.getPostById(postId);
      await post.remove(false);

      // 3. Submit sticky comment response
      const comment = await reddit.submitComment({
        id: postId,
        text: `⚠️ **PostPilot Moderation Portal Enforcer** ⚠️\n\nYour post has been removed because it bypassed this subreddit's mandatory submission verification portal.\n\nPlease submit all new posts using our interactive web portal stickied at the top of the subreddit page.`,
      });
      await comment.distinguish(true);

      return c.json({ success: true, status: 'removed' });
    }

    return c.json({ success: true, status: 'approved' });
  } catch (error: any) {
    console.error(`Error in on-post-submit trigger: ${error.message}`);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 6. POST /internal/menu/deploy
app.post('/internal/menu/deploy', async (c) => {
  try {
    const subredditName = context.subredditName!;

    // A. Submit custom post hosting the portal composer
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '🚀 PostPilot Subreddit Submission Portal',
      entry: 'default',
    });

    // B. Sticky the post in slot 1
    await post.sticky(1);

    return c.json({ success: true, postId: post.id });
  } catch (error: any) {
    console.error(`Error in menu deploy endpoint: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

export default app;
