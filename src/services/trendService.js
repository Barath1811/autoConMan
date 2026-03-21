'use strict';

/**
 * Service for fetching and processing Google Trends content.
 */
class TrendService {
  /**
   * Fetches the latest trending topic that hasn't been processed yet.
   * @param {Object} dbService - Injected DBService.
   * @returns {Promise<Object|null>} Trending topic data or null.
   */
  async getLatestTrend(dbService) {
    try {
      const gtrends = require('google-trends-api');
      const trends = await gtrends.dailyTrends({ geo: 'US' });
      const parsed = JSON.parse(trends);
      const topTrend = parsed.default.trendingSearchesDays[0].trendingSearches[0];
      
      const title = topTrend.title.query;
      const isProcessed = await dbService.isTrendProcessed(title);
      
      if (isProcessed) return null;

      const description = topTrend.articles[0]?.snippet || '';
      const sourceUrls = topTrend.articles.map(a => a.url);
      
      // Perform basic research based on articles
      const researchChunks = [description, ...topTrend.articles.map(a => a.title)];

      return {
        title,
        description,
        sourceUrls,
        researchChunks,
        thumbnail: topTrend.image?.imageUrl || null
      };
    } catch (e) {
      console.error('Trend Service Error:', e.message);
      return null;
    }
  }
}

module.exports = TrendService;
