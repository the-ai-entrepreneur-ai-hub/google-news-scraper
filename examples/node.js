/**
 * Google News Scraper — Node.js Example
 *
 * Extract news articles by keyword using the Apify API.
 * Get your API token at: https://console.apify.com/settings/integrations
 */
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_API_TOKEN' });

const run = await client.actor('george.the.developer/google-news-monitor').call({
    keywords: ['Tesla', 'OpenAI', 'artificial intelligence'],
    timeRange: 'past_day',        // past_hour, past_day, past_week, past_month, anytime
    maxArticlesPerKeyword: 20,
    extractFullText: false,        // set true to visit each article and extract full text
    language: 'en',
    country: 'US',
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();

console.log(`Found ${items.length} articles\n`);
items.forEach(article => {
    console.log(`[${article.source}] ${article.title}`);
    console.log(`  Published: ${article.publishedAt}`);
    console.log(`  URL: ${article.articleUrl}\n`);
});
