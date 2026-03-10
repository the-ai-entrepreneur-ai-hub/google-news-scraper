"""
Google News Scraper — Python Example

Extract news articles by keyword using the Apify API.
Get your API token at: https://console.apify.com/settings/integrations

pip install apify-client
"""
from apify_client import ApifyClient

client = ApifyClient("YOUR_API_TOKEN")

run = client.actor("george.the.developer/google-news-monitor").call(run_input={
    "keywords": ["Tesla", "OpenAI", "artificial intelligence"],
    "timeRange": "past_day",
    "maxArticlesPerKeyword": 20,
    "extractFullText": False,
    "language": "en",
    "country": "US",
})

for article in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(f"[{article['source']}] {article['title']}")
    print(f"  Published: {article.get('publishedAt', 'N/A')}")
    print(f"  URL: {article['articleUrl']}")
    print()
