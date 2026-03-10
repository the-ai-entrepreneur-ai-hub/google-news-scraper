import { Actor, log } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

// Random user agents for rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(minMs = 2000, maxMs = 5000) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Map time range to Google News "when" parameter
function getTimeParam(timeRange) {
    const map = {
        past_hour: 'qdr:h',
        past_day: 'qdr:d',
        past_week: 'qdr:w',
        past_month: 'qdr:m',
    };
    return map[timeRange] || null;
}

// Build Google News RSS URL
function buildRssUrl(keyword, language, country) {
    const q = encodeURIComponent(keyword);
    const hl = `${language}-${country}`;
    const ceid = `${country}:${language}`;
    return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${country}&ceid=${ceid}`;
}

// Build Google News web search URL
function buildNewsWebUrl(keyword, language, country) {
    const q = encodeURIComponent(keyword);
    const hl = `${language}-${country}`;
    const ceid = `${country}:${language}`;
    return `https://news.google.com/search?q=${q}&hl=${hl}&gl=${country}&ceid=${ceid}`;
}

// Build Google search news tab URL
function buildGoogleSearchNewsUrl(keyword, language, country, timeRange) {
    const q = encodeURIComponent(keyword);
    let url = `https://www.google.com/search?q=${q}&tbm=nws&hl=${language}&gl=${country}`;
    const tbs = getTimeParam(timeRange);
    if (tbs) url += `&tbs=${tbs}`;
    return url;
}

// Parse RSS XML for articles
function parseRssXml(xmlText, keyword) {
    const articles = [];
    // Match each <item> block
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemXml = match[1];
        const title = extractTag(itemXml, 'title');
        const link = extractTag(itemXml, 'link');
        const pubDate = extractTag(itemXml, 'pubDate');
        const description = extractTag(itemXml, 'description');
        const source = extractTag(itemXml, 'source');

        if (title && link) {
            articles.push({
                keyword,
                title: cleanHtml(title),
                source: source || 'Unknown',
                publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
                snippet: cleanHtml(description || ''),
                articleUrl: link,
                imageUrl: null,
                fullText: null,
                scrapedAt: new Date().toISOString(),
            });
        }
    }
    return articles;
}

function extractTag(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's');
    const m = xml.match(regex);
    return m ? m[1].trim() : null;
}

function cleanHtml(text) {
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

// Handle Google consent / cookie banner
async function handleConsentScreen(page) {
    try {
        // Google consent form - click accept/agree buttons
        const consentSelectors = [
            'button[aria-label="Accept all"]',
            'button[aria-label="Agree"]',
            '#L2AGLb', // Google "I agree" button
            'button[id="L2AGLb"]',
            'form[action*="consent"] button',
            'button:has-text("Accept")',
            'button:has-text("Agree")',
            'button:has-text("I agree")',
        ];

        for (const sel of consentSelectors) {
            try {
                const btn = await page.$(sel);
                if (btn) {
                    await btn.click();
                    log.info('Clicked consent/cookie button.');
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
                    return true;
                }
            } catch {
                // Selector not found, try next
            }
        }
    } catch (err) {
        log.debug(`Consent handling error: ${err.message}`);
    }
    return false;
}

// Detect CAPTCHA
function isCaptchaPage(content) {
    const signals = ['captcha', 'unusual traffic', 'not a robot', 'recaptcha', 'verify you are human'];
    const lower = content.toLowerCase();
    return signals.some((s) => lower.includes(s));
}

// APPROACH 1: RSS Feed (primary)
async function scrapeViaRss(page, keyword, language, country, maxArticles) {
    const url = buildRssUrl(keyword, language, country);
    log.info(`[RSS] Fetching: ${url}`);

    await page.setUserAgent(getRandomUserAgent());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const content = await page.content();

    if (isCaptchaPage(content)) {
        log.warning('[RSS] CAPTCHA detected, skipping RSS approach.');
        return null;
    }

    // Get raw text - RSS pages render XML as text in Puppeteer
    const bodyText = await page.evaluate(() => document.body?.innerText || document.documentElement?.outerHTML || '');
    // Also try the raw page source
    const rawXml = content.includes('<rss') ? content : bodyText;

    if (!rawXml.includes('<item>') && !rawXml.includes('<item ')) {
        log.info('[RSS] No RSS items found in response, trying raw content...');
        // Maybe the XML is rendered differently, try to get it from pre tag
        const preText = await page.evaluate(() => {
            const pre = document.querySelector('pre');
            return pre ? pre.textContent : null;
        });
        if (preText && preText.includes('<item>')) {
            const articles = parseRssXml(preText, keyword);
            log.info(`[RSS] Parsed ${articles.length} articles from pre-tag.`);
            return articles.slice(0, maxArticles);
        }
        return null;
    }

    const articles = parseRssXml(rawXml, keyword);
    log.info(`[RSS] Parsed ${articles.length} articles.`);
    return articles.slice(0, maxArticles);
}

// APPROACH 2: Google News website
async function scrapeViaGoogleNewsWeb(page, keyword, language, country, maxArticles) {
    const url = buildNewsWebUrl(keyword, language, country);
    log.info(`[WEB] Fetching: ${url}`);

    await page.setUserAgent(getRandomUserAgent());
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    await handleConsentScreen(page);

    const content = await page.content();
    if (isCaptchaPage(content)) {
        log.warning('[WEB] CAPTCHA detected, skipping Google News web approach.');
        return null;
    }

    // Wait for articles to load
    await page.waitForSelector('article, c-wiz, [data-n-tid]', { timeout: 10000 }).catch(() => {});
    await randomDelay(1000, 2000);

    const articles = await page.evaluate((kw) => {
        const results = [];

        // Try finding article elements
        const articleElements = document.querySelectorAll('article, c-wiz article, [data-n-tid]');

        for (const el of articleElements) {
            try {
                // Try various selectors for title
                const titleEl = el.querySelector('h3, h4, a[href*="./articles/"], [data-n-tid] a');
                const title = titleEl?.textContent?.trim();
                if (!title) continue;

                // Source
                const sourceEl = el.querySelector('time + span, [data-n-tid] span, .source, div > span:first-child');
                const source = sourceEl?.textContent?.trim() || 'Unknown';

                // Time
                const timeEl = el.querySelector('time, [datetime]');
                const publishedAt = timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || null;

                // Link - Google News uses relative links starting with ./articles/
                const linkEl = el.querySelector('a[href*="article"], a[href*="./articles/"], h3 a, h4 a');
                let articleUrl = linkEl?.href || '';
                if (articleUrl.startsWith('./')) {
                    articleUrl = `https://news.google.com/${articleUrl.slice(2)}`;
                }

                // Snippet
                const snippetEl = el.querySelector('p, .snippet, [data-n-sp]');
                const snippet = snippetEl?.textContent?.trim() || '';

                // Image
                const imgEl = el.querySelector('img[src*="http"], figure img');
                const imageUrl = imgEl?.src || null;

                if (title && articleUrl) {
                    results.push({
                        keyword: kw,
                        title,
                        source,
                        publishedAt,
                        snippet,
                        articleUrl,
                        imageUrl,
                        fullText: null,
                        scrapedAt: new Date().toISOString(),
                    });
                }
            } catch {
                // Skip problematic elements
            }
        }

        // If no articles found with the above selectors, try a broader approach
        if (results.length === 0) {
            const allLinks = document.querySelectorAll('a[href*="./articles/"], a[href*="/articles/"]');
            for (const link of allLinks) {
                const title = link.textContent?.trim();
                let href = link.href || '';
                if (href.startsWith('./')) {
                    href = `https://news.google.com/${href.slice(2)}`;
                }
                if (title && title.length > 15 && href) {
                    // Find the closest parent that might contain source info
                    const parent = link.closest('div') || link.parentElement;
                    const spans = parent?.querySelectorAll('span') || [];
                    let source = 'Unknown';
                    for (const span of spans) {
                        const t = span.textContent?.trim();
                        if (t && t.length < 50 && t !== title) {
                            source = t;
                            break;
                        }
                    }

                    results.push({
                        keyword: kw,
                        title,
                        source,
                        publishedAt: null,
                        snippet: '',
                        articleUrl: href,
                        imageUrl: null,
                        fullText: null,
                        scrapedAt: new Date().toISOString(),
                    });
                }
            }
        }

        return results;
    }, keyword);

    log.info(`[WEB] Extracted ${articles.length} articles.`);
    return articles.length > 0 ? articles.slice(0, maxArticles) : null;
}

// APPROACH 3: Google Search news tab
async function scrapeViaGoogleSearchNews(page, keyword, language, country, timeRange, maxArticles) {
    const url = buildGoogleSearchNewsUrl(keyword, language, country, timeRange);
    log.info(`[SEARCH] Fetching: ${url}`);

    await page.setUserAgent(getRandomUserAgent());
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    await handleConsentScreen(page);

    const content = await page.content();
    if (isCaptchaPage(content)) {
        log.warning('[SEARCH] CAPTCHA detected, skipping Google Search approach.');
        return null;
    }

    await randomDelay(1000, 2000);

    const articles = await page.evaluate((kw) => {
        const results = [];

        // Google news search results - try multiple selector patterns
        const containers = document.querySelectorAll(
            '#rso > div, #search .g, .SoaBEf, [data-hveid] .WlydOe, div[data-news-doc-id]'
        );

        for (const container of containers) {
            try {
                // Title from the main link
                const titleEl = container.querySelector('div[role="heading"], h3, .n0jPhd, .mCBkyc');
                const title = titleEl?.textContent?.trim();
                if (!title) continue;

                // Article URL
                const linkEl = container.querySelector('a[href^="http"]');
                const articleUrl = linkEl?.href || '';
                if (!articleUrl || articleUrl.includes('google.com/search')) continue;

                // Source
                const sourceEl = container.querySelector('.NUnG9d span, .CEMjEf span, .WF4CUc, .MgUUmf span');
                const source = sourceEl?.textContent?.trim() || 'Unknown';

                // Date
                const dateEl = container.querySelector('.LfVVr, .OSrXXb span, .WG9SHc span, .ZE0LJd span');
                const publishedAt = dateEl?.textContent?.trim() || null;

                // Snippet
                const snippetEl = container.querySelector('.GI74Re, .Y3v8qd, .st, .s3v9rd');
                const snippet = snippetEl?.textContent?.trim() || '';

                // Image
                const imgEl = container.querySelector('img[src^="http"], g-img img');
                const imageUrl = imgEl?.src || null;

                if (title && articleUrl) {
                    results.push({
                        keyword: kw,
                        title,
                        source,
                        publishedAt,
                        snippet,
                        articleUrl,
                        imageUrl,
                        fullText: null,
                        scrapedAt: new Date().toISOString(),
                    });
                }
            } catch {
                // Skip
            }
        }

        // Broader fallback: look for any news-like result
        if (results.length === 0) {
            const allDivs = document.querySelectorAll('#rso a[href^="http"]');
            for (const link of allDivs) {
                const href = link.href;
                if (!href || href.includes('google.com')) continue;
                const title = link.querySelector('div[role="heading"], h3')?.textContent?.trim();
                if (!title || title.length < 10) continue;

                const parent = link.closest('div');
                const spans = parent?.querySelectorAll('span') || [];
                let source = 'Unknown';
                let dateStr = null;
                for (const span of spans) {
                    const t = span.textContent?.trim();
                    if (t && t.length < 30 && t !== title) {
                        if (t.match(/ago|hour|minute|day|week|month|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i)) {
                            dateStr = t;
                        } else if (!source || source === 'Unknown') {
                            source = t;
                        }
                    }
                }

                results.push({
                    keyword: kw,
                    title,
                    source,
                    publishedAt: dateStr,
                    snippet: '',
                    articleUrl: href,
                    imageUrl: null,
                    fullText: null,
                    scrapedAt: new Date().toISOString(),
                });
            }
        }

        return results;
    }, keyword);

    log.info(`[SEARCH] Extracted ${articles.length} articles.`);
    return articles.length > 0 ? articles.slice(0, maxArticles) : null;
}

// Extract full text from an article page
async function extractFullText(page, url) {
    try {
        await page.setUserAgent(getRandomUserAgent());
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(1000, 2000);

        const text = await page.evaluate(() => {
            // Remove noise elements
            const removeSelectors = [
                'nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript',
                '.ad', '.ads', '.advertisement', '.social-share', '.comments',
                '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
                '.sidebar', '.menu', '.cookie', '.popup', '.modal',
            ];
            for (const sel of removeSelectors) {
                document.querySelectorAll(sel).forEach((el) => el.remove());
            }

            // Try to find the main article content
            const contentSelectors = [
                'article', '[role="article"]', '.article-body', '.article-content',
                '.post-content', '.entry-content', '.story-body', '.content-body',
                'main', '#article-body', '.article__body',
            ];

            for (const sel of contentSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const t = el.innerText?.trim();
                    if (t && t.length > 100) return t;
                }
            }

            // Fallback: get all paragraph text
            const paragraphs = document.querySelectorAll('p');
            const texts = [];
            for (const p of paragraphs) {
                const t = p.innerText?.trim();
                if (t && t.length > 30) texts.push(t);
            }
            return texts.join('\n\n') || null;
        });

        return text ? text.slice(0, 10000) : null; // Cap at 10k chars
    } catch (err) {
        log.debug(`Failed to extract full text from ${url}: ${err.message}`);
        return null;
    }
}

// Deduplicate articles by URL
function deduplicateArticles(articles) {
    const seen = new Set();
    return articles.filter((a) => {
        const key = a.articleUrl || a.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Main actor logic
await Actor.init();

try {
    const input = await Actor.getInput() || {};

    const {
        keywords = [],
        timeRange = 'past_day',
        maxArticlesPerKeyword = 20,
        extractFullText: shouldExtractFullText = false,
        language = 'en',
        country = 'US',
        maxConcurrency = 3,
        proxyConfiguration: proxyConfig = undefined,
    } = input;

    if (!keywords || keywords.length === 0) {
        throw new Error('At least one keyword is required. Please provide keywords in the input.');
    }

    log.info(`Starting Google News Brand Monitor for ${keywords.length} keyword(s).`);
    log.info(`Settings: timeRange=${timeRange}, maxPerKeyword=${maxArticlesPerKeyword}, fullText=${shouldExtractFullText}`);

    // Prepare proxy
    const proxyConfiguration = proxyConfig
        ? await Actor.createProxyConfiguration(proxyConfig)
        : undefined;

    // Collect all articles
    const allArticles = [];
    let totalCharged = 0;

    // Process each keyword
    for (const keyword of keywords) {
        log.info(`\n========== Processing keyword: "${keyword}" ==========`);

        let articles = null;

        // Launch browser for this keyword
        const browser = await (await import('puppeteer')).default.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080',
            ],
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            // Configure proxy if available
            if (proxyConfiguration) {
                const proxyUrl = await proxyConfiguration.newUrl();
                log.info(`Using proxy: ${proxyUrl ? 'yes' : 'no'}`);
            }

            // APPROACH 1: Try RSS first (most reliable)
            log.info(`[APPROACH 1] Trying RSS feed for "${keyword}"...`);
            await randomDelay(1000, 3000);
            articles = await scrapeViaRss(page, keyword, language, country, maxArticlesPerKeyword);

            // APPROACH 2: Google News website
            if (!articles || articles.length === 0) {
                log.info(`[APPROACH 2] RSS failed, trying Google News website for "${keyword}"...`);
                await randomDelay(2000, 4000);
                articles = await scrapeViaGoogleNewsWeb(page, keyword, language, country, maxArticlesPerKeyword);
            }

            // APPROACH 3: Google Search news tab
            if (!articles || articles.length === 0) {
                log.info(`[APPROACH 3] Google News failed, trying Google Search news tab for "${keyword}"...`);
                await randomDelay(2000, 5000);
                articles = await scrapeViaGoogleSearchNews(page, keyword, language, country, timeRange, maxArticlesPerKeyword);
            }

            if (!articles || articles.length === 0) {
                log.warning(`No articles found for "${keyword}" across all approaches.`);
                articles = [];
            }

            // Deduplicate
            articles = deduplicateArticles(articles);
            log.info(`Found ${articles.length} unique articles for "${keyword}".`);

            // Extract full text if requested
            if (shouldExtractFullText && articles.length > 0) {
                log.info(`Extracting full text for ${articles.length} articles...`);
                for (let i = 0; i < articles.length; i++) {
                    const article = articles[i];
                    if (article.articleUrl && !article.articleUrl.includes('news.google.com')) {
                        log.info(`  [${i + 1}/${articles.length}] Extracting text from: ${article.articleUrl}`);
                        const fullTextPage = await browser.newPage();
                        await fullTextPage.setViewport({ width: 1920, height: 1080 });
                        article.fullText = await extractFullText(fullTextPage, article.articleUrl);
                        await fullTextPage.close();
                        await randomDelay(1500, 3000);
                    }
                }
            }

            // Push articles to dataset and charge per article
            for (const article of articles) {
                await Actor.pushData(article);

                // PPE charge per article found
                try {
                    await Actor.charge(1, { eventName: 'article-found' });
                    totalCharged++;
                } catch (err) {
                    log.debug(`PPE charge skipped: ${err.message}`);
                }
            }

            allArticles.push(...articles);
        } finally {
            await browser.close();
        }

        // Delay between keywords
        if (keywords.indexOf(keyword) < keywords.length - 1) {
            log.info('Waiting before next keyword...');
            await randomDelay(3000, 6000);
        }
    }

    // Summary
    log.info('\n========== SCRAPING COMPLETE ==========');
    log.info(`Total keywords processed: ${keywords.length}`);
    log.info(`Total articles found: ${allArticles.length}`);
    log.info(`Total PPE charges: ${totalCharged}`);

    // Store summary in key-value store
    await Actor.setValue('SUMMARY', {
        keywords,
        totalArticles: allArticles.length,
        articlesPerKeyword: keywords.map((kw) => ({
            keyword: kw,
            count: allArticles.filter((a) => a.keyword === kw).length,
        })),
        timeRange,
        extractedFullText: shouldExtractFullText,
        scrapedAt: new Date().toISOString(),
    });

} catch (err) {
    log.error(`Actor failed: ${err.message}`);
    throw err;
}

await Actor.exit();
