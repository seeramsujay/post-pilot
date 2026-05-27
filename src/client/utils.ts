// Client validation and markdown utilities

/**
 * Custom lightweight Markdown parser for live rendering preview.
 */
export function parseMarkdown(md: string): string {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 1. Lists (run first to avoid conflicts with italic asterisks)
  html = html.replace(/^\s*\-\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/^\s*\*\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');

  // Fix consecutive list tags
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/<\/ol>\s*<ol>/g, '');

  // 2. Blockquotes (match escaped &gt;)
  html = html.replace(/^&gt; (.*$)/gim, '<blockquote>$1</blockquote>');

  // 3. Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 4. Code Blocks
  html = html.replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>');

  // 5. Inline Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 6. Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 7. Horizontal rule
  html = html.replace(/^\s*\-\-\-\s*$/gim, '<hr />');

  // Paragraphs
  const paragraphs = html.split('\n\n').map((p) => {
    const trimmed = p.trim();
    if (
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<hr')
    ) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br />')}</p>`;
  });

  return paragraphs.join('\n\n');
}

/**
 * Validates the post title against a given regex pattern.
 */
export function validateTitle(title: string, regexStr: string): string | null {
  if (!regexStr || !title) return null;
  try {
    const regex = new RegExp(regexStr);
    if (!regex.test(title)) {
      return `Must match required pattern: ${regexStr}`;
    }
    return null;
  } catch {
    return 'Invalid regex pattern configured in subreddit settings.';
  }
}

/**
 * Validates body length against minimum length requirement.
 */
export function validateBody(body: string, minLength: number): string | null {
  if (!minLength) return null;
  if (body.length < minLength) {
    return `Must be at least ${minLength} characters (current: ${body.length})`;
  }
  return null;
}

/**
 * Validates text against a comma-separated list of forbidden keywords.
 */
export function validateBlacklist(title: string, body: string, blacklistStr: string): string | null {
  if (!blacklistStr) return null;
  const blacklist = blacklistStr
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();
  const found = blacklist.filter((word) => lowerTitle.includes(word) || lowerBody.includes(word));

  if (found.length > 0) {
    return `Contains forbidden keywords: ${found.join(', ')}`;
  }
  return null;
}

/**
 * Helper to fetch with exponential backoff retry logic.
 * Retries on network errors or 5xx server errors.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok && response.status >= 500 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
}
