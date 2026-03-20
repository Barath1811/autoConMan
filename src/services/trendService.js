const axios = require('axios');
const xml2js = require('xml2js');
const cheerio = require('cheerio');
const { URL } = require('url');

/**
 * Service to handle automated trend acquisition and research.
 */
class TrendService {
  constructor() {
    this.RSS_URL = 'https://trends.google.com/trending/rss?geo=IN';
    this.USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    this.MAX_RESEARCH_CHUNKS = 15;
  }

  /**
   * Fetches and parses the latest trends from Google Trends RSS.
   */
  async fetchTrends() {
    try {
      const response = await axios.get(this.RSS_URL, {
        headers: { 'User-Agent': this.USER_AGENT },
        timeout: 10000
      });
      const parser = new xml2js.Parser({ explicitArray: true });
      const result = await parser.parseStringPromise(response.data);
      return result?.rss?.channel?.[0]?.item || [];
    } catch (error) {
      console.error(`[TrendService] Failed to fetch RSS: ${error.message}`);
      return [];
    }
  }

  /**
   * Scrapes an article URL and extracts meaningful text paragraphs.
   */
  async scrapeArticle(url) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': this.USER_AGENT },
        timeout: 8000
      });
      const $ = cheerio.load(data);
      
      // Remove structural/noisy elements
      $('script, style, nav, footer, header, aside, .ads, .comment, #comments').remove();
      
      const paragraphs = [];
      $('p').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text.length > 50) paragraphs.push(text);
      });
      
      return paragraphs;
    } catch (error) {
      console.warn(`[TrendService] Scraping failed for ${url}: ${error.code || error.message}`);
      return [];
    }
  }

  /**
   * Deduplicates news URLs by domain to ensure diverse perspectives.
   */
  getUniqueSources(newsItems) {
    if (!newsItems) return [];
    const seenDomains = new Set();
    const urls = [];

    for (const item of newsItems) {
      try {
        const url = item['ht:news_item_url']?.[0];
        if (!url) continue;
        const { hostname } = new URL(url);
        if (!seenDomains.has(hostname)) {
          seenDomains.add(hostname);
          urls.push(url);
        }
      } catch (e) { /* ignore invalid URLs */ }
    }
    return urls;
  }

  /**
   * Finds the latest unprocessed trend and gathers research data.
   */
  async getLatestTrend(dbService) {
    const items = await this.fetchTrends();
    
    for (const item of items) {
      const title = item.title?.[0];
      const thumbnail = item['ht:picture']?.[0] || null;
      if (!title) continue;

      if (await dbService.isTrendProcessed(title)) continue;

      console.log(`[TrendService] Researching fresh trend: "${title}"`);
      
      const newsUrls = this.getUniqueSources(item['ht:news_item']);
      const research = [];
      
      // Research top 3 unique sources until we hit the chunk limit
      for (const url of newsUrls.slice(0, 3)) {
        if (research.length >= this.MAX_RESEARCH_CHUNKS) break;
        const chunks = await this.scrapeArticle(url);
        research.push(...chunks);
      }

      if (research.length === 0) {
        console.warn(`[TrendService] No data found for "${title}". Trying next...`);
        continue;
      }

      return {
        title,
        thumbnail,
        researchChunks: research.slice(0, this.MAX_RESEARCH_CHUNKS),
        sourceUrls: newsUrls.slice(0, 3)
      };
    }

    return null;
  }
}

module.exports = TrendService;
