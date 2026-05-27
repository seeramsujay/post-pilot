import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Setup mocks for Devvit dependencies
vi.mock('@devvit/web/server', () => {
  return {
    reddit: {
      getCurrentUser: vi.fn(),
      getModerators: vi.fn(),
      submitPost: vi.fn(),
      setPostFlair: vi.fn(),
      getPostById: vi.fn(),
      submitComment: vi.fn(),
      submitCustomPost: vi.fn(),
    },
    redis: {
      get: vi.fn(),
      set: vi.fn(),
      incr: vi.fn(),
    },
    settings: {
      get: vi.fn(),
    },
    context: {
      subredditName: 'test-subreddit',
    },
  };
});

vi.mock('@devvit/public-api', () => {
  return {
    RunAs: {
      USER: 'USER',
      APP: 'APP',
    },
  };
});

// 2. Import the app and Devvit mocked modules to control behavior in tests
import app from './index';
import { reddit, redis, settings } from '@devvit/web/server';

describe('PostPilot Hono Server Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/rules', () => {
    it('should return rules configured in settings', async () => {
      vi.mocked(settings.get).mockImplementation(async (key: string) => {
        if (key === 'title_regex') return '^\\[[a-zA-Z]+\\].*$';
        if (key === 'min_body') return 10;
        if (key === 'flair_id') return 'flair-123';
        if (key === 'keyword_blacklist') return 'spam,scam';
        if (key === 'minimum_account_age') return 5;
        if (key === 'minimum_karma') return 50;
        return null;
      });

      const res = await app.request('/api/rules');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        title_regex: '^\\[[a-zA-Z]+\\].*$',
        min_body: 10,
        flair_id: 'flair-123',
        keyword_blacklist: 'spam,scam',
        minimum_account_age: 5,
        minimum_karma: 50,
      });
    });
  });

  describe('GET /api/user-status', () => {
    it('should identify a moderator user correctly', async () => {
      vi.mocked(reddit.getCurrentUser).mockResolvedValue({ username: 'modUser' } as any);
      vi.mocked(reddit.getModerators).mockReturnValue({
        all: async () => [{ username: 'modUser' }],
      } as any);

      const res = await app.request('/api/user-status');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        isMod: true,
        username: 'modUser',
      });
    });

    it('should identify a non-moderator user correctly', async () => {
      vi.mocked(reddit.getCurrentUser).mockResolvedValue({ username: 'regularUser' } as any);
      vi.mocked(reddit.getModerators).mockReturnValue({
        all: async () => [],
      } as any);

      const res = await app.request('/api/user-status');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        isMod: false,
        username: 'regularUser',
      });
    });
  });

  describe('POST /api/publish', () => {
    it('should publish a valid post and return post info', async () => {
      // Mock Redis Lock (Acquired)
      vi.mocked(redis.set).mockImplementation(async (key: string) => {
        if (key.startsWith('lock:publish:')) return 'OK';
        return null;
      });

      // Mock Settings
      vi.mocked(settings.get).mockImplementation(async (key: string) => {
        if (key === 'title_regex') return '^\\[[a-zA-Z]+\\].*$';
        if (key === 'min_body') return 10;
        if (key === 'flair_id') return 'flair-template-123';
        if (key === 'keyword_blacklist') return 'spam';
        return null;
      });

      // Mock Reddit user age/karma verification
      vi.mocked(reddit.getCurrentUser).mockResolvedValue({
        username: 'authorUser',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days old
        linkKarma: 100,
        commentKarma: 50,
      } as any);

      // Mock Reddit Post Submission
      vi.mocked(reddit.submitPost).mockResolvedValue({
        id: 'post_123',
        permalink: '/r/test-subreddit/comments/post_123',
      } as any);

      const payload = {
        title: '[Feedback] App is great!',
        body: 'This is a long body description exceeding 10 characters.',
        uuid: 'unique-session-id',
      };

      const res = await app.request('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        success: true,
        postId: 'post_123',
        url: '/r/test-subreddit/comments/post_123',
      });

      expect(reddit.submitPost).toHaveBeenCalled();
      expect(reddit.setPostFlair).toHaveBeenCalledWith({
        postId: 'post_123',
        flairTemplateId: 'flair-template-123',
      });
      expect(vi.mocked(redis.incr)).toHaveBeenCalledWith('stats:approved');
    });

    it('should reject publish if duplicate submission occurs (idempotency)', async () => {
      vi.mocked(redis.set).mockResolvedValue(null); // lock not acquired

      const payload = {
        title: '[Valid] Title here',
        body: 'Valid post body text',
        uuid: 'duplicate-session-id',
      };

      const res = await app.request('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('Duplicate submission detected');
    });

    it('should reject publish if user does not meet age limits', async () => {
      vi.mocked(redis.set).mockResolvedValue('OK'); // lock acquired
      vi.mocked(settings.get).mockImplementation(async (key: string) => {
        if (key === 'minimum_account_age') return 5;
        return null;
      });

      // User account is 1 day old
      vi.mocked(reddit.getCurrentUser).mockResolvedValue({
        username: 'authorUser',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        linkKarma: 100,
        commentKarma: 50,
      } as any);

      const payload = {
        title: 'Newbie Title',
        body: 'Post body text description',
        uuid: 'age-fail-id',
      };

      const res = await app.request('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Account age must be at least 5 days');
      expect(vi.mocked(redis.incr)).toHaveBeenCalledWith('stats:rejected');
    });

    it('should reject publish if title does not match regex', async () => {
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(settings.get).mockImplementation(async (key: string) => {
        if (key === 'title_regex') return '^\\[[a-zA-Z]+\\].*$';
        return null;
      });

      vi.mocked(reddit.getCurrentUser).mockResolvedValue({
        username: 'authorUser',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        linkKarma: 100,
        commentKarma: 50,
      } as any);

      const payload = {
        title: 'No brackets here',
        body: 'Post body text description',
        uuid: 'regex-fail-id',
      };

      const res = await app.request('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Title does not match required pattern');
      expect(vi.mocked(redis.incr)).toHaveBeenCalledWith('stats:rejected');
    });

    it('should reject publish if body is shorter than min_body', async () => {
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(settings.get).mockImplementation(async (key: string) => {
        if (key === 'min_body') return 10;
        return null;
      });

      vi.mocked(reddit.getCurrentUser).mockResolvedValue({
        username: 'authorUser',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        linkKarma: 100,
        commentKarma: 50,
      } as any);

      const payload = {
        title: 'Title',
        body: 'short',
        uuid: 'min-body-fail-id',
      };

      const res = await app.request('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Body must be at least 10 characters');
      expect(vi.mocked(redis.incr)).toHaveBeenCalledWith('stats:rejected');
    });

    it('should reject publish if title contains blacklisted word', async () => {
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(settings.get).mockImplementation(async (key: string) => {
        if (key === 'keyword_blacklist') return 'spam,crypto';
        return null;
      });

      vi.mocked(reddit.getCurrentUser).mockResolvedValue({
        username: 'authorUser',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        linkKarma: 100,
        commentKarma: 50,
      } as any);

      const payload = {
        title: 'Awesome crypto advice',
        body: 'Post body text description',
        uuid: 'blacklist-fail-id',
      };

      const res = await app.request('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('forbidden keywords');
      expect(vi.mocked(redis.incr)).toHaveBeenCalledWith('stats:rejected');
    });
  });

  describe('GET /api/stats', () => {
    it('should retrieve statistics counters correctly', async () => {
      vi.mocked(redis.get).mockImplementation(async (key: string) => {
        if (key === 'stats:approved') return '42';
        if (key === 'stats:rejected') return '7';
        if (key === 'stats:enforcer_bypassed') return '3';
        return null;
      });

      const res = await app.request('/api/stats');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        approved: 42,
        rejected: 7,
        enforcer_bypassed: 3,
      });
    });
  });

  describe('POST /internal/menu/deploy', () => {
    it('should submit custom post and pin it as sticky', async () => {
      const mockSticky = vi.fn();
      vi.mocked(reddit.submitCustomPost).mockResolvedValue({
        id: 'portal_post_id_123',
        sticky: mockSticky,
      } as any);

      const res = await app.request('/internal/menu/deploy', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        success: true,
        postId: 'portal_post_id_123',
      });

      expect(reddit.submitCustomPost).toHaveBeenCalledWith({
        subredditName: 'test-subreddit',
        title: '🚀 PostPilot Subreddit Submission Portal',
        entry: 'default',
      });
      expect(mockSticky).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /internal/on-post-submit (Enforcer)', () => {
    it('should do nothing if post is whitelisted (portal-submitted)', async () => {
      vi.mocked(settings.get).mockResolvedValue(true); // enforcer enabled
      vi.mocked(redis.get).mockResolvedValue('true'); // Whitelisted in Redis

      const res = await app.request('/internal/on-post-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: 't3_portalpost' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true, status: 'approved' });
      expect(reddit.getPostById).not.toHaveBeenCalled();
    });

    it('should remove post and comment warning if not whitelisted', async () => {
      vi.mocked(settings.get).mockResolvedValue(true); // enforcer enabled
      vi.mocked(redis.get).mockResolvedValue(null); // Not whitelisted

      const mockRemove = vi.fn();
      vi.mocked(reddit.getPostById).mockResolvedValue({
        remove: mockRemove,
      } as any);

      const mockDistinguish = vi.fn();
      vi.mocked(reddit.submitComment).mockResolvedValue({
        distinguish: mockDistinguish,
      } as any);

      const res = await app.request('/internal/on-post-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: 't3_bypassed' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true, status: 'removed' });

      expect(reddit.getPostById).toHaveBeenCalledWith('t3_bypassed');
      expect(mockRemove).toHaveBeenCalledWith(false);
      expect(reddit.submitComment).toHaveBeenCalled();
      expect(mockDistinguish).toHaveBeenCalledWith(true);
      expect(vi.mocked(redis.incr)).toHaveBeenCalledWith('stats:enforcer_bypassed');
    });

    it('should do nothing if enforcer is disabled', async () => {
      vi.mocked(settings.get).mockResolvedValue(false); // enforcer disabled
      vi.mocked(redis.get).mockResolvedValue(null);

      const res = await app.request('/internal/on-post-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: 't3_somepost' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain('Enforcer is disabled');
      expect(reddit.getPostById).not.toHaveBeenCalled();
    });
  });
});
