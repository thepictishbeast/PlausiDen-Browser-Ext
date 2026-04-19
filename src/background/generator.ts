/**
 * PlausiDen Browser Extension - Stub Data Generator
 *
 * TypeScript stub that generates realistic browsing artifacts until
 * the plausiden-engine WASM build replaces it. Produces:
 * - Realistic URLs from real domains organized by interest category
 * - Referrer chains (search -> result -> subpage)
 * - Plausible page titles
 * - Cookie names and values matching visited domains
 *
 * Uses the same URL corpus approach as the Rust engine in plausiden-engine.
 */

import {
  BrowsingEntry,
  BrowsingSession,
  GeneratedCookie,
  BrowsingCategory,
  BrowsingProfile,
  INTENSITY_MULTIPLIERS,
  IntensityLevel,
} from "../shared/types";

// ---------------------------------------------------------------------------
// URL Corpus -- organized by category with realistic paths and titles
// ---------------------------------------------------------------------------

interface CorpusSite {
  domain: string;
  paths: { path: string; title: string }[];
  cookieNames: string[];
}

const URL_CORPUS: Record<BrowsingCategory, CorpusSite[]> = {
  news: [
    {
      domain: "reuters.com",
      paths: [
        { path: "/world/europe/", title: "Europe News | Reuters" },
        { path: "/business/finance/", title: "Financial News | Reuters" },
        { path: "/technology/", title: "Technology News | Reuters" },
        { path: "/world/americas/", title: "Americas | Reuters" },
        { path: "/markets/", title: "Markets | Reuters" },
      ],
      cookieNames: ["_ga", "_gid", "usprivacy", "RT"],
    },
    {
      domain: "apnews.com",
      paths: [
        { path: "/hub/politics", title: "Politics News - AP News" },
        { path: "/hub/world-news", title: "World News - AP News" },
        { path: "/hub/business", title: "Business News - AP News" },
        { path: "/hub/science", title: "Science News - AP News" },
      ],
      cookieNames: ["_ga", "_gid", "AP_CONSUMER"],
    },
    {
      domain: "bbc.com",
      paths: [
        { path: "/news/world", title: "World - BBC News" },
        { path: "/news/business", title: "Business - BBC News" },
        { path: "/news/technology", title: "Technology - BBC News" },
        { path: "/news/science-environment", title: "Science & Environment - BBC News" },
        { path: "/news/health", title: "Health - BBC News" },
      ],
      cookieNames: ["ckns_policy", "ckns_explicit", "_ga"],
    },
    {
      domain: "npr.org",
      paths: [
        { path: "/sections/news/", title: "News : NPR" },
        { path: "/sections/politics/", title: "Politics : NPR" },
        { path: "/sections/technology/", title: "Technology : NPR" },
      ],
      cookieNames: ["_ga", "choiceVersion", "dateOfChoice"],
    },
  ],
  social: [
    {
      domain: "reddit.com",
      paths: [
        { path: "/r/technology/", title: "r/technology - Reddit" },
        { path: "/r/science/", title: "r/science - Reddit" },
        { path: "/r/worldnews/", title: "r/worldnews - Reddit" },
        { path: "/r/AskReddit/", title: "r/AskReddit - Reddit" },
        { path: "/r/todayilearned/", title: "r/todayilearned - Reddit" },
        { path: "/r/movies/", title: "r/movies - Reddit" },
      ],
      cookieNames: ["reddit_session", "token_v2", "csv", "edgebucket"],
    },
    {
      domain: "twitter.com",
      paths: [
        { path: "/explore", title: "Explore / X" },
        { path: "/search?q=trending", title: "Search / X" },
        { path: "/i/trends", title: "Trends / X" },
      ],
      cookieNames: ["ct0", "guest_id", "_twitter_sess", "personalization_id"],
    },
    {
      domain: "linkedin.com",
      paths: [
        { path: "/feed/", title: "LinkedIn Feed" },
        { path: "/jobs/", title: "Jobs | LinkedIn" },
        { path: "/mynetwork/", title: "My Network | LinkedIn" },
      ],
      cookieNames: ["li_at", "JSESSIONID", "bcookie", "lidc"],
    },
  ],
  shopping: [
    {
      domain: "amazon.com",
      paths: [
        { path: "/s?k=laptop+stand", title: "Amazon.com: laptop stand" },
        { path: "/s?k=wireless+headphones", title: "Amazon.com: wireless headphones" },
        { path: "/s?k=book+shelf", title: "Amazon.com: book shelf" },
        { path: "/gp/bestsellers/", title: "Amazon Best Sellers" },
        { path: "/s?k=usb+c+hub", title: "Amazon.com: usb c hub" },
      ],
      cookieNames: ["session-id", "session-id-time", "ubid-main", "x-main"],
    },
    {
      domain: "ebay.com",
      paths: [
        { path: "/sch/i.html?_nkw=vintage+camera", title: "vintage camera | eBay" },
        { path: "/sch/i.html?_nkw=mechanical+keyboard", title: "mechanical keyboard | eBay" },
        { path: "/deals", title: "Daily Deals | eBay" },
      ],
      cookieNames: ["dp1", "nonsession", "s", "ebay"],
    },
    {
      domain: "target.com",
      paths: [
        { path: "/c/electronics/-/N-5xtg6", title: "Electronics : Target" },
        { path: "/c/home/-/N-5xsxe", title: "Home : Target" },
        { path: "/c/grocery/-/N-5xt1a", title: "Grocery : Target" },
      ],
      cookieNames: ["TealeafAkaSid", "visitorId", "GuestLocation"],
    },
  ],
  entertainment: [
    {
      domain: "youtube.com",
      paths: [
        { path: "/feed/trending", title: "Trending - YouTube" },
        { path: "/feed/explore", title: "Explore - YouTube" },
        { path: "/results?search_query=documentary", title: "documentary - YouTube" },
        { path: "/results?search_query=music+playlist", title: "music playlist - YouTube" },
      ],
      cookieNames: ["VISITOR_INFO1_LIVE", "YSC", "PREF", "GPS"],
    },
    {
      domain: "imdb.com",
      paths: [
        { path: "/chart/top/", title: "Top 250 Movies - IMDb" },
        { path: "/chart/moviemeter/", title: "Most Popular Movies - IMDb" },
        { path: "/chart/toptv/", title: "Top 250 TV Shows - IMDb" },
        { path: "/news/top", title: "Top News - IMDb" },
      ],
      cookieNames: ["session-id", "uu", "at-main", "ubid-main"],
    },
    {
      domain: "spotify.com",
      paths: [
        { path: "/genre/podcasts-web", title: "Podcasts - Spotify" },
        { path: "/genre/made-for-you", title: "Made For You - Spotify" },
        { path: "/search", title: "Search - Spotify" },
      ],
      cookieNames: ["sp_t", "sp_dc", "sp_key"],
    },
  ],
  weather: [
    {
      domain: "weather.com",
      paths: [
        { path: "/weather/today/", title: "Today's Weather | Weather.com" },
        { path: "/weather/tenday/", title: "10-Day Forecast | Weather.com" },
        { path: "/weather/radar/", title: "Weather Radar | Weather.com" },
      ],
      cookieNames: ["TWC_Privacy", "TWC_GeoIP", "s_vi"],
    },
    {
      domain: "weather.gov",
      paths: [
        { path: "/", title: "National Weather Service" },
        { path: "/forecastmaps", title: "Forecast Maps - NWS" },
        { path: "/radar", title: "Radar - NWS" },
      ],
      cookieNames: [],
    },
  ],
  academic: [
    {
      domain: "scholar.google.com",
      paths: [
        { path: "/scholar?q=machine+learning+survey", title: "machine learning survey - Google Scholar" },
        { path: "/scholar?q=climate+change+impact", title: "climate change impact - Google Scholar" },
        { path: "/scholar?q=cryptography+advances", title: "cryptography advances - Google Scholar" },
        { path: "/scholar?q=public+health+policy", title: "public health policy - Google Scholar" },
      ],
      cookieNames: ["NID", "GSP", "GOOGLE_ABUSE_EXEMPTION"],
    },
    {
      domain: "arxiv.org",
      paths: [
        { path: "/list/cs.AI/recent", title: "Computer Science - AI - arXiv" },
        { path: "/list/cs.CR/recent", title: "Computer Science - Cryptography - arXiv" },
        { path: "/list/stat.ML/recent", title: "Statistics - Machine Learning - arXiv" },
        { path: "/abs/2301.00001", title: "arXiv:2301.00001" },
      ],
      cookieNames: [],
    },
    {
      domain: "jstor.org",
      paths: [
        { path: "/action/doBasicSearch?Query=political+theory", title: "Search Results | JSTOR" },
        { path: "/action/doBasicSearch?Query=economic+history", title: "Search Results | JSTOR" },
        { path: "/subject/sociology", title: "Sociology | JSTOR" },
      ],
      cookieNames: ["JSESSIONID", "UUID"],
    },
    {
      domain: "pubmed.ncbi.nlm.nih.gov",
      paths: [
        { path: "/?term=epidemiology+review", title: "epidemiology review - PubMed" },
        { path: "/?term=vaccine+efficacy", title: "vaccine efficacy - PubMed" },
        { path: "/?term=clinical+trial+methodology", title: "clinical trial methodology - PubMed" },
      ],
      cookieNames: ["ncbi_sid"],
    },
  ],
  documentation: [
    {
      domain: "developer.mozilla.org",
      paths: [
        { path: "/en-US/docs/Web/JavaScript", title: "JavaScript | MDN" },
        { path: "/en-US/docs/Web/API/Fetch_API", title: "Fetch API - Web APIs | MDN" },
        { path: "/en-US/docs/Web/CSS", title: "CSS | MDN" },
        { path: "/en-US/docs/Web/HTML/Element", title: "HTML elements reference | MDN" },
      ],
      cookieNames: [],
    },
    {
      domain: "docs.python.org",
      paths: [
        { path: "/3/library/json.html", title: "json - Python 3 documentation" },
        { path: "/3/tutorial/index.html", title: "The Python Tutorial" },
        { path: "/3/library/asyncio.html", title: "asyncio - Python 3 documentation" },
      ],
      cookieNames: [],
    },
    {
      domain: "stackoverflow.com",
      paths: [
        { path: "/questions/tagged/javascript", title: "JavaScript Questions - Stack Overflow" },
        { path: "/questions/tagged/python", title: "Python Questions - Stack Overflow" },
        { path: "/questions/tagged/typescript", title: "TypeScript Questions - Stack Overflow" },
        { path: "/questions", title: "Newest Questions - Stack Overflow" },
      ],
      cookieNames: ["prov", "_ga", "usr"],
    },
  ],
  reference: [
    {
      domain: "en.wikipedia.org",
      paths: [
        { path: "/wiki/Cryptography", title: "Cryptography - Wikipedia" },
        { path: "/wiki/Machine_learning", title: "Machine learning - Wikipedia" },
        { path: "/wiki/Climate_change", title: "Climate change - Wikipedia" },
        { path: "/wiki/History_of_computing", title: "History of computing - Wikipedia" },
        { path: "/wiki/International_law", title: "International law - Wikipedia" },
      ],
      cookieNames: ["WMF-Last-Access", "GeoIP"],
    },
    {
      domain: "britannica.com",
      paths: [
        { path: "/science/physics", title: "Physics | Britannica" },
        { path: "/topic/democracy", title: "Democracy | Britannica" },
        { path: "/biography", title: "Biographies | Britannica" },
      ],
      cookieNames: ["_ga", "subBanner"],
    },
  ],
  government: [
    {
      domain: "congress.gov",
      paths: [
        { path: "/bill/118th-congress", title: "Legislation | Congress.gov" },
        { path: "/search?q=privacy", title: "Search Results | Congress.gov" },
        { path: "/committees", title: "Committees | Congress.gov" },
      ],
      cookieNames: [],
    },
    {
      domain: "whitehouse.gov",
      paths: [
        { path: "/briefing-room/", title: "Briefing Room | The White House" },
        { path: "/issues/", title: "Issues | The White House" },
        { path: "/about-the-white-house/", title: "About | The White House" },
      ],
      cookieNames: [],
    },
    {
      domain: "data.gov",
      paths: [
        { path: "/", title: "Data.gov" },
        { path: "/dataset", title: "Datasets - Data.gov" },
      ],
      cookieNames: [],
    },
    {
      domain: "usa.gov",
      paths: [
        { path: "/", title: "USAGov" },
        { path: "/explore/", title: "Explore Government | USAGov" },
      ],
      cookieNames: ["_ga"],
    },
  ],
  legal: [
    {
      domain: "law.cornell.edu",
      paths: [
        { path: "/uscode/text/18", title: "18 U.S. Code | Legal Information Institute" },
        { path: "/constitution", title: "Constitution | Legal Information Institute" },
        { path: "/supremecourt/text/home", title: "Supreme Court | LII" },
      ],
      cookieNames: [],
    },
    {
      domain: "courtlistener.com",
      paths: [
        { path: "/", title: "CourtListener - Search Court Opinions" },
        { path: "/opinion/", title: "Opinions | CourtListener" },
      ],
      cookieNames: ["sessionid", "csrftoken"],
    },
    {
      domain: "justia.com",
      paths: [
        { path: "/us-law/", title: "US Law | Justia" },
        { path: "/cases/", title: "Case Law | Justia" },
      ],
      cookieNames: ["_ga"],
    },
  ],
  finance: [
    {
      domain: "finance.yahoo.com",
      paths: [
        { path: "/", title: "Yahoo Finance" },
        { path: "/quote/SPY", title: "SPY | Yahoo Finance" },
        { path: "/markets/", title: "Markets | Yahoo Finance" },
      ],
      cookieNames: ["A1", "A3", "GUC"],
    },
    {
      domain: "marketwatch.com",
      paths: [
        { path: "/", title: "MarketWatch" },
        { path: "/investing/stocks", title: "Stocks | MarketWatch" },
        { path: "/economy-politics", title: "Economy & Politics | MarketWatch" },
      ],
      cookieNames: ["_ga", "usr_bkt"],
    },
  ],
  health: [
    {
      domain: "webmd.com",
      paths: [
        { path: "/default.htm", title: "WebMD - Health Information" },
        { path: "/diet/default.htm", title: "Diet & Weight Management | WebMD" },
        { path: "/fitness-exercise/default.htm", title: "Fitness & Exercise | WebMD" },
      ],
      cookieNames: ["_ga", "ab", "lrt_profileid"],
    },
    {
      domain: "mayoclinic.org",
      paths: [
        { path: "/diseases-conditions", title: "Diseases & Conditions | Mayo Clinic" },
        { path: "/healthy-lifestyle", title: "Healthy Lifestyle | Mayo Clinic" },
        { path: "/symptoms", title: "Symptoms | Mayo Clinic" },
      ],
      cookieNames: ["_ga"],
    },
  ],
  technology: [
    {
      domain: "arstechnica.com",
      paths: [
        { path: "/", title: "Ars Technica" },
        { path: "/gadgets/", title: "Gadgets | Ars Technica" },
        { path: "/information-technology/", title: "IT | Ars Technica" },
        { path: "/science/", title: "Science | Ars Technica" },
      ],
      cookieNames: ["_ga", "_gid"],
    },
    {
      domain: "theverge.com",
      paths: [
        { path: "/", title: "The Verge" },
        { path: "/tech", title: "Tech | The Verge" },
        { path: "/science", title: "Science | The Verge" },
        { path: "/reviews", title: "Reviews | The Verge" },
      ],
      cookieNames: ["_ga", "_chorus_perm_id"],
    },
    {
      domain: "github.com",
      paths: [
        { path: "/trending", title: "Trending repositories on GitHub" },
        { path: "/topics", title: "Topics on GitHub" },
        { path: "/explore", title: "Explore GitHub" },
      ],
      cookieNames: ["_gh_sess", "logged_in", "_octo"],
    },
  ],
  sports: [
    {
      domain: "espn.com",
      paths: [
        { path: "/", title: "ESPN" },
        { path: "/nba/", title: "NBA | ESPN" },
        { path: "/nfl/", title: "NFL | ESPN" },
        { path: "/soccer/", title: "Soccer | ESPN" },
      ],
      cookieNames: ["SWID", "ESPN-ONESITE.WEB-PROD.token", "_ga"],
    },
    {
      domain: "sports.yahoo.com",
      paths: [
        { path: "/", title: "Yahoo Sports" },
        { path: "/nba/", title: "NBA | Yahoo Sports" },
        { path: "/nfl/", title: "NFL | Yahoo Sports" },
      ],
      cookieNames: ["A1", "GUC"],
    },
  ],
  travel: [
    {
      domain: "tripadvisor.com",
      paths: [
        { path: "/", title: "Tripadvisor" },
        { path: "/Hotels", title: "Hotels | Tripadvisor" },
        { path: "/Restaurants", title: "Restaurants | Tripadvisor" },
      ],
      cookieNames: ["TAUnique", "TASID", "TASession"],
    },
    {
      domain: "booking.com",
      paths: [
        { path: "/", title: "Booking.com | Hotels" },
        { path: "/flights/", title: "Flights | Booking.com" },
      ],
      cookieNames: ["_ga", "bkng", "pcm_personalization"],
    },
  ],
  food: [
    {
      domain: "allrecipes.com",
      paths: [
        { path: "/", title: "Allrecipes | Recipes & Cooking" },
        { path: "/recipes/17562/dinner/", title: "Dinner Recipes | Allrecipes" },
        { path: "/recipes/92/meat-and-poultry/", title: "Meat & Poultry | Allrecipes" },
      ],
      cookieNames: ["_ga", "Mnet.Uid"],
    },
    {
      domain: "food.com",
      paths: [
        { path: "/", title: "Food.com - Recipes" },
        { path: "/ideas/quick-easy-6702", title: "Quick & Easy Recipes | Food.com" },
      ],
      cookieNames: ["_ga"],
    },
  ],
};

// ---------------------------------------------------------------------------
// Search query templates per category
// ---------------------------------------------------------------------------

const SEARCH_QUERIES: Record<BrowsingCategory, string[]> = {
  news: [
    "latest world news today",
    "breaking news headlines",
    "current events summary",
    "international news updates",
    "top stories today",
  ],
  social: [
    "reddit popular today",
    "trending topics twitter",
    "linkedin jobs remote",
    "social media news",
  ],
  shopping: [
    "best wireless headphones 2026",
    "laptop deals today",
    "kitchen gadgets under 50",
    "running shoes review",
    "standing desk recommendation",
  ],
  entertainment: [
    "best movies streaming now",
    "new music releases this week",
    "podcast recommendations",
    "tv show reviews 2026",
    "upcoming movie trailers",
  ],
  weather: [
    "weather forecast this week",
    "10 day weather forecast",
    "weather radar near me",
    "weekend weather",
  ],
  academic: [
    "machine learning recent papers",
    "climate science research 2026",
    "peer reviewed journal search",
    "academic citation database",
    "research methodology overview",
  ],
  documentation: [
    "javascript array methods",
    "python async await tutorial",
    "css grid layout guide",
    "typescript generics explained",
    "react hooks documentation",
  ],
  reference: [
    "history of cryptography",
    "how does machine learning work",
    "international law overview",
    "what is quantum computing",
    "etymology of common words",
  ],
  government: [
    "new legislation 2026",
    "government data portal",
    "public records search",
    "federal agency directory",
    "census data statistics",
  ],
  legal: [
    "supreme court recent decisions",
    "privacy law united states",
    "fourth amendment case law",
    "FOIA request process",
    "digital rights legislation",
  ],
  finance: [
    "stock market today",
    "index fund comparison",
    "economic indicators current",
    "interest rate forecast",
  ],
  health: [
    "healthy meal planning",
    "exercise routine beginner",
    "sleep hygiene tips",
    "vitamin supplements guide",
  ],
  technology: [
    "best programming languages 2026",
    "new tech releases",
    "open source projects trending",
    "cybersecurity best practices",
    "linux distro comparison",
  ],
  sports: [
    "nba scores today",
    "nfl standings current season",
    "soccer world cup schedule",
    "tennis rankings",
  ],
  travel: [
    "best travel destinations 2026",
    "cheap flights this month",
    "hotel deals",
    "travel safety tips",
  ],
  food: [
    "quick dinner recipes",
    "healthy meal prep ideas",
    "best restaurant near me",
    "baking bread at home",
  ],
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Cryptographically weak but fast PRNG -- good enough for noise generation */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

// Partial Fisher-Yates shuffle: pick n distinct elements uniformly at
// random in O(n) time with one allocation. The previous implementation
// used `[...arr].sort(() => Math.random() - 0.5)` which is (a) O(n log
// n) and (b) non-uniform — Math.random() - 0.5 is not a transitive
// comparator, so V8's sort produces a biased permutation where some
// outcomes are much more likely than others. Concretely: on modern V8
// TimSort, a 16-element array's first slot stays in place ~30% of the
// time with the sort approach versus the expected 1/16 = 6.25% with a
// proper shuffle. That bias would silently skew which categories
// appear in generated browsing sessions.
// Exported for distribution testing (tests/generator-shuffle-uniform.test.ts).
// Pure function; no side-effects beyond reading Math.random.
export function pickRandomN<T>(arr: T[], n: number): T[] {
  const take = Math.min(n, arr.length);
  if (take <= 0) return [];
  const working = arr.slice();     // one allocation
  // Shuffle the first `take` slots; remaining slots are the unpicked tail.
  for (let i = 0; i < take; i++) {
    const j = randomInt(i, working.length - 1);
    if (j !== i) {
      const tmp = working[i];
      working[i] = working[j];
      working[j] = tmp;
    }
  }
  return working.slice(0, take);
}

/** Generate a realistic-looking hex/alphanumeric cookie value */
function generateCookieValue(length: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[randomInt(0, chars.length - 1)];
  }
  return result;
}

/** Generate a GA-style tracking ID */
function generateGAValue(): string {
  return `GA1.2.${randomInt(100000000, 999999999)}.${Math.floor(Date.now() / 1000) - randomInt(0, 86400 * 30)}`;
}

/** Build a search URL for a given engine and query */
function buildSearchUrl(engine: string, query: string): { url: string; title: string } {
  const encoded = encodeURIComponent(query);
  if (engine.includes("scholar.google")) {
    return {
      url: `https://scholar.google.com/scholar?q=${encoded}`,
      title: `${query} - Google Scholar`,
    };
  }
  if (engine.includes("duckduckgo")) {
    return {
      url: `https://duckduckgo.com/?q=${encoded}`,
      title: `${query} at DuckDuckGo`,
    };
  }
  if (engine.includes("bing")) {
    return {
      url: `https://www.bing.com/search?q=${encoded}`,
      title: `${query} - Bing`,
    };
  }
  // Default: Google
  return {
    url: `https://www.google.com/search?q=${encoded}`,
    title: `${query} - Google Search`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a single browsing session -- a cluster of related entries
 * that looks like a human browsing pattern: search -> click result ->
 * browse subpages -> maybe search again.
 *
 * Module-private: only generateBatch calls it today. Re-export if a
 * consumer outside this file ever needs single-session granularity.
 */
function generateSession(
  profile: BrowsingProfile,
  intensity: IntensityLevel,
  baseTimestamp: number
): BrowsingSession {
  const multiplier = INTENSITY_MULTIPLIERS[intensity];
  const category = pickRandom(profile.categories);
  const sites = URL_CORPUS[category] ?? URL_CORPUS["news"];
  const queries = SEARCH_QUERIES[category] ?? SEARCH_QUERIES["news"];

  const entries: BrowsingEntry[] = [];
  const cookies: GeneratedCookie[] = [];
  let currentTime = baseTimestamp;

  // Session length: 2-8 entries, scaled by intensity
  const sessionLength = randomInt(2, Math.ceil(8 * multiplier));

  // Start with a search query
  const searchEngine = pickRandom(profile.searchEngines);
  const searchQuery = pickRandom(queries);
  const search = buildSearchUrl(searchEngine, searchQuery);

  entries.push({
    url: search.url,
    title: search.title,
    timestamp: currentTime,
    visitCount: 1,
    category,
  });

  // Small delay before clicking a result (1-15 seconds)
  currentTime += randomInt(1000, 15000);

  // Click through to result sites
  for (let i = 0; i < sessionLength - 1; i++) {
    const site = pickRandom(sites);
    const page = pickRandom(site.paths);
    const url = `https://www.${site.domain}${page.path}`;
    const referrer = entries[entries.length - 1].url;

    entries.push({
      url,
      title: page.title,
      timestamp: currentTime,
      referrer,
      visitCount: randomInt(1, 3),
      category,
    });

    // Generate cookies for this domain
    if (site.cookieNames.length > 0) {
      const cookiesToGenerate = pickRandomN(
        site.cookieNames,
        randomInt(1, site.cookieNames.length)
      );
      for (const cookieName of cookiesToGenerate) {
        const cookieValue = cookieName.startsWith("_ga")
          ? generateGAValue()
          : generateCookieValue(randomInt(16, 48));

        cookies.push({
          domain: `.${site.domain}`,
          name: cookieName,
          value: cookieValue,
          path: "/",
          expirationDate: Math.floor(currentTime / 1000) + 86400 * randomInt(30, 365),
          secure: true,
          httpOnly: cookieName !== "_ga" && cookieName !== "_gid",
          sameSite: "lax",
        });
      }
    }

    // Variable delay between page loads (2-90 seconds -- reading time)
    currentTime += randomInt(2000, 90000);
  }

  return {
    entries,
    cookies,
    startTime: entries[0].timestamp,
    endTime: entries[entries.length - 1].timestamp,
  };
}

/**
 * Generate multiple sessions for a single scheduler tick.
 * Returns 1-3 sessions depending on intensity.
 */
export function generateBatch(
  profile: BrowsingProfile,
  intensity: IntensityLevel,
  baseTimestamp: number
): BrowsingSession[] {
  const multiplier = INTENSITY_MULTIPLIERS[intensity];
  const numSessions = randomInt(1, Math.ceil(3 * multiplier));
  const sessions: BrowsingSession[] = [];
  let currentTime = baseTimestamp;

  for (let i = 0; i < numSessions; i++) {
    const session = generateSession(profile, intensity, currentTime);
    sessions.push(session);
    // Gap between sessions: 30 seconds to 5 minutes
    currentTime = session.endTime + randomInt(30000, 300000);
  }

  return sessions;
}

/**
 * Count total entries and cookies across sessions.
 */
export function countSessionArtifacts(
  sessions: BrowsingSession[]
): { entries: number; cookies: number } {
  let entries = 0;
  let cookieCount = 0;
  for (const s of sessions) {
    entries += s.entries.length;
    cookieCount += s.cookies.length;
  }
  return { entries, cookies: cookieCount };
}
