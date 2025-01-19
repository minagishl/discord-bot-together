export function containsTrendOrSynonyms(input: string): boolean {
  // Array containing synonyms of the English word "trend"
  const synonyms = [
    'trend',
    'trending',
    'tendency',
    'fashion',
    'movement',
    'direction',
    'current',
    'popular',
  ];

  // Convert the input string to lowercase for easier comparison
  const lowerCasedInput = input.toLowerCase();

  // Check for Japanese "trend"
  if (lowerCasedInput.includes('トレンド')) {
    return true;
  }

  // Check for English "trend" and its synonyms
  for (const word of synonyms) {
    if (lowerCasedInput.includes(word)) {
      return true;
    }
  }

  // Return false if none of the conditions are met
  return false;
}

export async function getTodayTrendsInJapanese(): Promise<string[]> {
  const TRENDING_URL = 'https://trends.google.com/trends/api/dailytrends';
  const REGION_CODE = 'JP';

  try {
    // Fetch data from the Google Trends API using fetch
    const response = await fetch(
      `${TRENDING_URL}?hl=ja&tz=-540&geo=${REGION_CODE}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const responseData = await response.text();

    // Google Trends API returns data as JSON with a specific structure
    const data = JSON.parse(responseData.slice(5));

    // Extract trending topics
    const trends = data.default.trendingSearchesDays[0].trendingSearches;
    const trendingTopics = trends.map((trend: any) => trend.title.query);

    return trendingTopics;
  } catch (error) {
    console.error('Error fetching Google Trends:', error);
    throw new Error('Failed to fetch Google Trends.');
  }
}
