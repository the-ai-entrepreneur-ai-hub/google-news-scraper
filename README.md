# Google News Scraper — Real-Time News Monitoring & Brand Intelligence

Scrape Google News articles by keyword in real time. Monitor brand mentions, track PR coverage, and gather competitive intelligence from 50,000+ news sources worldwide. Built with Node.js, Puppeteer, and the Apify platform.

[![Run on Apify](https://img.shields.io/badge/Run%20on-Apify-blue?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgiIGhlaWdodD0iMjgiIHZpZXdCb3g9IjAgMCAyOCAyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTQgMjhDMjEuNzMyIDI4IDI4IDIxLjczMiAyOCAxNEMyOCA2LjI2OCAyMS43MzIgMCAxNCAwQzYuMjY4IDAgMCA2LjI2OCAwIDE0QzAgMjEuNzMyIDYuMjY4IDI4IDE0IDI4WiIgZmlsbD0iIzk3RDdGRiIvPjwvc3ZnPg==)](https://apify.com/george.the.developer/google-news-monitor)
[![Available on RapidAPI](https://img.shields.io/badge/Also%20on-RapidAPI-blue?logo=rapidapi)](https://rapidapi.com/georgethedeveloper3046/api/google-news-scraper-brand-monitor-api)
[![License: ISC](https://img.shields.io/badge/License-ISC-green.svg)](https://opensource.org/licenses/ISC)

## What It Does

This Google News scraper extracts articles from Google News using a **triple-fallback architecture**:

1. **RSS Feed** (fastest, most reliable) — Parses Google News RSS/XML feeds
2. **Google News Website** (browser-based) — Scrapes the news.google.com interface directly
3. **Google Search News Tab** (deepest) — Falls back to Google's main search news results

If one approach fails (CAPTCHA, rate limit), it automatically tries the next. You get results even when Google blocks standard methods.

## What Data You Get

```json
{
  "keyword": "Tesla",
  "title": "Tesla Announces New Gigafactory in Southeast Asia",
  "source": "Reuters",
  "publishedAt": "2026-03-10T14:30:00.000Z",
  "snippet": "Tesla Inc said on Monday it would build a new manufacturing facility...",
  "articleUrl": "https://www.reuters.com/business/autos/tesla-new-gigafactory-2026-03-10/",
  "imageUrl": "https://...",
  "fullText": "Full article text extracted from source (optional)...",
  "scrapedAt": "2026-03-10T15:00:00.000Z"
}
```

## Quick Start

### Using the Apify API (Recommended)

The fastest way to get started — no setup required:

#### cURL

```bash
curl "https://api.apify.com/v2/acts/george.the.developer~google-news-monitor/run-sync-get-dataset-items?token=YOUR_API_TOKEN" \
  -X POST \
  -d '{
    "keywords": ["Tesla", "OpenAI"],
    "timeRange": "past_day",
    "maxArticlesPerKeyword": 20
  }' \
  -H 'Content-Type: application/json'
```

#### Node.js

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_API_TOKEN' });

const run = await client.actor('george.the.developer/google-news-monitor').call({
    keywords: ['Tesla', 'OpenAI', 'artificial intelligence'],
    timeRange: 'past_day',
    maxArticlesPerKeyword: 20,
    extractFullText: false,
    language: 'en',
    country: 'US',
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(`Found ${items.length} articles`);
items.forEach(article => {
    console.log(`[${article.source}] ${article.title}`);
});
```

#### Python

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_API_TOKEN")

run = client.actor("george.the.developer/google-news-monitor").call(run_input={
    "keywords": ["Tesla", "OpenAI"],
    "timeRange": "past_day",
    "maxArticlesPerKeyword": 20,
    "extractFullText": False,
    "language": "en",
    "country": "US",
})

for article in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(f"[{article['source']}] {article['title']}")
    print(f"  URL: {article['articleUrl']}")
```

## Use Cases

- **Brand Monitoring** — Track mentions of your company, product, or competitors across 50,000+ news sources
- **PR & Media Intelligence** — Measure press coverage, identify trending stories about your brand
- **Competitive Intelligence** — Monitor competitor announcements, partnerships, and product launches
- **Market Research** — Track industry trends, regulatory changes, and market signals
- **Content Curation** — Aggregate news for newsletters, dashboards, or AI-powered analysis
- **AI Training Data** — Build datasets of news articles for NLP, sentiment analysis, or LLM fine-tuning

## Input Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `keywords` | string[] | *required* | Keywords or brand names to search |
| `timeRange` | string | `past_day` | `anytime`, `past_hour`, `past_day`, `past_week`, `past_month` |
| `maxArticlesPerKeyword` | number | 20 | Max articles per keyword (1-100) |
| `extractFullText` | boolean | false | Visit each article to extract full text |
| `language` | string | `en` | Language code (en, es, fr, de, ja, etc.) |
| `country` | string | `US` | Country code (US, GB, DE, FR, JP, etc.) |
| `proxyConfiguration` | object | — | Proxy settings (Apify Proxy recommended) |

## How It Works (Architecture)

```
Input Keywords
     │
     ▼
┌─────────────────────┐
│  Approach 1: RSS    │──── Success? ──► Parse XML ──► Results
│  (news.google.com)  │
└─────────────────────┘
     │ Failed/CAPTCHA
     ▼
┌─────────────────────┐
│  Approach 2: Web    │──── Success? ──► Parse DOM ──► Results
│  (news.google.com)  │
└─────────────────────┘
     │ Failed/CAPTCHA
     ▼
┌─────────────────────┐
│  Approach 3: Search │──── Success? ──► Parse DOM ──► Results
│  (google.com/news)  │
└─────────────────────┘
     │
     ▼
  Deduplicate + Optional Full-Text Extraction
     │
     ▼
  Output to Dataset
```

## Run on Apify

**[Run this actor on Apify](https://apify.com/george.the.developer/google-news-monitor)** — no setup, no infrastructure, pay only for what you use.

- **Cost**: ~$0.003 per article found
- **Speed**: 20-100 articles per minute depending on settings
- **Reliability**: Triple-fallback ensures results even when Google blocks standard methods

## Also Available on RapidAPI

Prefer a standard REST API? This scraper is also available on **[RapidAPI](https://rapidapi.com/georgethedeveloper3046/api/google-news-scraper-brand-monitor-api)** with simple API key authentication:

- **Free tier**: 50 requests/month
- **Pro**: $19/month (1,000 requests)
- **Ultra**: $49/month (5,000 requests)
- **Mega**: $129/month (20,000 requests)

## Limitations

- This tool does **not** bypass paywalled article content. Full-text extraction works on freely accessible articles only.
- Google may serve CAPTCHAs for high-volume requests. Using Apify Proxy significantly reduces this.
- Rate limiting applies — respect Google's terms of service.

## Related Tools

- [LinkedIn Employee Scraper](https://github.com/the-ai-entrepreneur-ai-hub/linkedin-employee-scraper) — Extract employee data from any company
- [YouTube Transcript Extractor](https://github.com/the-ai-entrepreneur-ai-hub/youtube-transcript-extractor) — Get video transcripts for AI/RAG
- [Website Contact Scraper](https://github.com/the-ai-entrepreneur-ai-hub/website-contact-scraper) — Find emails & contacts from any website
- [US Tariff Lookup](https://github.com/the-ai-entrepreneur-ai-hub/us-tariff-lookup) — Look up import duty rates & HS codes

## License

ISC License. See [LICENSE](LICENSE) for details.

---

Built by [george.the.developer](https://apify.com/george.the.developer) on [Apify](https://apify.com).
