import { describe, it, expect, vi } from 'vitest';
import { parseMarkdown, validateTitle, validateBody, validateBlacklist, fetchWithRetry } from './utils';

describe('Markdown Parser', () => {
  it('should parse headers correctly', () => {
    expect(parseMarkdown('# Hello')).toContain('<h1>Hello</h1>');
    expect(parseMarkdown('## Subheading')).toContain('<h2>Subheading</h2>');
    expect(parseMarkdown('### Minor Header')).toContain('<h3>Minor Header</h3>');
  });

  it('should parse bold and italic styling', () => {
    expect(parseMarkdown('This is **bold** text')).toContain('<strong>bold</strong>');
    expect(parseMarkdown('This is *italic* text')).toContain('<em>italic</em>');
  });

  it('should parse blockquotes', () => {
    expect(parseMarkdown('> Quoted text')).toContain('<blockquote>Quoted text</blockquote>');
  });

  it('should parse inline code and code blocks', () => {
    expect(parseMarkdown('Use `code` here')).toContain('<code>code</code>');
    expect(parseMarkdown('```\nconst x = 5;\n```')).toContain('<pre><code>\nconst x = 5;\n</code></pre>');
  });

  it('should parse lists correctly', () => {
    expect(parseMarkdown('- Item 1\n- Item 2')).toContain('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(parseMarkdown('* Item A\n* Item B')).toContain('<ul><li>Item A</li><li>Item B</li></ul>');
    expect(parseMarkdown('1. First\n2. Second')).toContain('<ol><li>First</li><li>Second</li></ol>');
  });

  it('should format separate paragraphs', () => {
    const output = parseMarkdown('First paragraph.\n\nSecond paragraph.');
    expect(output).toContain('<p>First paragraph.</p>');
    expect(output).toContain('<p>Second paragraph.</p>');
  });
});

describe('Input Validators', () => {
  describe('Title regex validator', () => {
    it('should validate matching titles', () => {
      const regexStr = '^\\[[a-zA-Z]+\\].*$'; // bracketed tag e.g. [Help] Hello
      expect(validateTitle('[Tech] New release', regexStr)).toBeNull();
    });

    it('should reject non-matching titles', () => {
      const regexStr = '^\\[[a-zA-Z]+\\].*$';
      expect(validateTitle('New release without tags', regexStr)).toContain('Must match required pattern');
    });

    it('should return null if no regex configuration is specified', () => {
      expect(validateTitle('Anything goes', '')).toBeNull();
    });
  });

  describe('Body min-length validator', () => {
    it('should accept body meeting min length requirements', () => {
      expect(validateBody('This is a longer post body', 10)).toBeNull();
    });

    it('should reject body shorter than min length', () => {
      expect(validateBody('Short', 10)).toContain('Must be at least 10 characters');
    });

    it('should return null if min-length is 0 or undefined', () => {
      expect(validateBody('Short', 0)).toBeNull();
    });
  });

  describe('Blacklisted keywords validator', () => {
    it('should accept clean inputs', () => {
      expect(validateBlacklist('Clean Title', 'Clean Body', 'spam,crypto,buy')).toBeNull();
    });

    it('should reject blacklisted words in title', () => {
      expect(validateBlacklist('Buy my crypto coin', 'Clean Body', 'spam,crypto,buy')).toContain('Contains forbidden keywords');
    });

    it('should reject blacklisted words in body', () => {
      expect(validateBlacklist('Clean Title', 'This is a spam link', 'spam,crypto,buy')).toContain('Contains forbidden keywords');
    });

    it('should be case-insensitive', () => {
      expect(validateBlacklist('CRYPTO news', 'Clean Body', 'crypto')).toContain('Contains forbidden keywords');
    });
  });
});

describe('fetchWithRetry', () => {
  it('should return response directly if it is successful', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    const res = await fetchWithRetry('http://example.com', {}, 3, 1);
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    mockFetch.mockRestore();
  });

  it('should retry on 5xx errors and eventually throw or return', async () => {
    const mockFetch = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 502 } as any)
      .mockResolvedValueOnce({ ok: false, status: 503 } as any)
      .mockResolvedValueOnce({ ok: true, status: 200 } as any);

    const res = await fetchWithRetry('http://example.com', {}, 3, 1);
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    mockFetch.mockRestore();
  });

  it('should not retry on 4xx client errors', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
    } as any);

    const res = await fetchWithRetry('http://example.com', {}, 3, 1);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    mockFetch.mockRestore();
  });

  it('should retry on network throw error and eventually fail', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network drop'));

    await expect(fetchWithRetry('http://example.com', {}, 2, 1)).rejects.toThrow('Network drop');
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    mockFetch.mockRestore();
  });
});

