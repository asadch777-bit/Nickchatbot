import axios from 'axios';
import * as cheerio from 'cheerio';

export interface Product {
  name: string;
  price: string;
  originalPrice?: string;
  description: string;
  category: string;
  url: string;
  features?: string[];
  specs?: Record<string, string>;
}

export interface ProductData {
  products: Product[];
  categories: string[];
  promotions?: Product[];
  sales?: Product[];
  sections?: string[];
}

export interface WebsiteData {
  products: Product[];
  categories: string[];
  promotions: Product[];
  sales: Product[];
  blackFriday: Product[];
  sections: string[];
  trending: Product[];
  hasSales: boolean;
  hasBlackFriday: boolean;
}

const GTECH_BASE_URL = 'https://www.gtech.co.uk';

// Cache for products
let productsCache: ProductData | null = null;
let websiteDataCache: WebsiteData | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to extract products from a page
async function extractProductsFromPage(url: string, isPromotional: boolean = false): Promise<Product[]> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);
    const products: Product[] = [];
    const seenProducts = new Set<string>();

    // Method 1: Extract from product cards/items
    $('[class*="product"], article, [data-product], [class*="item"], [class*="card"]').each((index, element) => {
      const $el = $(element);
      extractProductFromElement($el, $, products, seenProducts, isPromotional, url);
    });

    // Method 2: Extract from links to product pages
    $('a[href*="/product"], a[href*="/products"], a[href*="/p/"]').each((index, element) => {
      const $el = $(element);
      const href = $el.attr('href');
      if (href && !href.includes('#') && !href.includes('javascript:') && !href.includes('mailto:')) {
        const productUrl = href.startsWith('http') ? href : `${GTECH_BASE_URL}${href}`;
        const name = $el.find('h1, h2, h3, h4, [class*="name"], [class*="title"], [class*="product-name"]').first().text().trim() || 
                     $el.text().trim().split('\n')[0].trim();
        
        if (name && name.length > 3 && !seenProducts.has(name.toLowerCase())) {
          const priceText = $el.closest('[class*="product"], article, div, section').find('[class*="price"], .price, [data-price]').first().text() || 
                           $el.find('[class*="price"], .price').first().text();
          const priceMatch = priceText.match(/£[\d,]+\.?\d*/g);
          const price = priceMatch ? priceMatch[0] : 'Check website for current price';
          const originalPrice = priceMatch && priceMatch.length > 1 ? priceMatch[1] : undefined;
          
          products.push({
            name,
            price,
            originalPrice,
            description: $el.find('[class*="description"], p').first().text().trim(),
            category: isPromotional ? 'Promotions' : 'General',
            url: productUrl,
          });
          seenProducts.add(name.toLowerCase());
        }
      }
    });

    // Method 3: Extract from text content - look for product patterns
    const pageText = $('body').text();
    const productPatterns = [
      /(AirRAM\s+\d+[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Orca[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Koala[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Penguin[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(DryOnic[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(StyleOnic[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Combi Drill[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Lawnmower[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Hedge Trimmer[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Grass Trimmer[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Long Reach[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(ProLite[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(Multi[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
      /(AirFOX[^\n]*?)(?:£|Price|Now|Was)\s*£?([\d,]+\.?\d*)/gi,
    ];

    productPatterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(pageText)) !== null) {
        const name = match[1]?.trim();
        const price = match[2] ? `£${match[2]}` : '';
        if (name && price && !seenProducts.has(name.toLowerCase())) {
          products.push({
            name,
            price,
            description: '',
            category: isPromotional ? 'Promotions' : 'General',
            url: GTECH_BASE_URL,
          });
          seenProducts.add(name.toLowerCase());
        }
      }
    });

    return products;
  } catch (error: any) {
    // Only log non-404 errors or log 404s silently
    if (error?.response?.status === 404) {
      // Silently skip 404 errors - these pages don't exist
      return [];
    }
    // Log other errors but don't throw
    if (error?.code !== 'ECONNABORTED' && error?.code !== 'ETIMEDOUT') {
      // Only log unexpected errors (not timeouts or connection issues)
      console.error(`Error extracting products from ${url}:`, error.message || error);
    }
    return [];
  }
}

// Helper function to extract product from an element
function extractProductFromElement($el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI, products: Product[], seenProducts: Set<string>, isPromotional: boolean, pageUrl: string) {
  const name = $el.find('h1, h2, h3, h4, [class*="name"], [class*="title"], [class*="product-name"]').first().text().trim();
  if (!name || name.length < 3 || seenProducts.has(name.toLowerCase())) return;

  const priceText = $el.find('[class*="price"], .price, [data-price], [class*="cost"]').first().text();
  const priceMatch = priceText.match(/£[\d,]+\.?\d*/g);
  const price = priceMatch ? priceMatch[0] : 'Check website for current price';
  const originalPrice = priceMatch && priceMatch.length > 1 ? priceMatch[1] : undefined;

  const link = $el.find('a').first().attr('href');
  const productUrl = link?.startsWith('http') ? link : `${GTECH_BASE_URL}${link || ''}`;

  const category = $el.closest('[class*="category"], section, [class*="section"]').find('h1, h2, h3').first().text().trim() || 
                   (isPromotional ? 'Promotions' : 'General');

  products.push({
    name,
    price,
    originalPrice,
    description: $el.find('[class*="description"], p, [class*="summary"]').first().text().trim(),
    category: category || (isPromotional ? 'Promotions' : 'General'),
    url: productUrl,
  });
  seenProducts.add(name.toLowerCase());
}

// Check if website has sales or promotions
async function checkForSales(): Promise<{ hasSales: boolean; hasBlackFriday: boolean; saleText: string }> {
  try {
    const response = await axios.get(GTECH_BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const pageText = $('body').text().toLowerCase();
    const html = response.data.toLowerCase();

    const hasBlackFriday = pageText.includes('black friday') || 
                          pageText.includes('blackfriday') ||
                          html.includes('black-friday') ||
                          html.includes('blackfriday');

    const hasSales = pageText.includes('sale') ||
                     pageText.includes('discount') ||
                     pageText.includes('promotion') ||
                     pageText.includes('deal') ||
                     pageText.includes('offer') ||
                     pageText.includes('special price') ||
                     pageText.includes('was') && pageText.includes('now') ||
                     hasBlackFriday;

    // Extract sale text for context
    let saleText = '';
    if (hasBlackFriday) {
      saleText = 'Black Friday';
    } else if (pageText.includes('sale')) {
      saleText = 'Sale';
    } else if (pageText.includes('promotion')) {
      saleText = 'Promotion';
    } else if (pageText.includes('deal')) {
      saleText = 'Deal';
    }

    return { hasSales, hasBlackFriday, saleText };
  } catch (error: any) {
    // Silently handle connection/timeout errors
    if (error?.code !== 'ECONNABORTED' && error?.code !== 'ETIMEDOUT' && error?.response?.status !== 404) {
      console.error('Error checking for sales:', error.message || error);
    }
    return { hasSales: false, hasBlackFriday: false, saleText: '' };
  }
}

export async function fetchGtechProducts(): Promise<ProductData> {
  // Return cached data if still valid
  if (productsCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return productsCache;
  }

  try {
    const allProducts: Product[] = [];
    const promotions: Product[] = [];
    const sales: Product[] = [];
    const categories = new Set<string>();
    const sections = new Set<string>();
    const seenProducts = new Set<string>();

    // Check for sales first
    const salesInfo = await checkForSales();

    // Pages to crawl
    const pagesToCrawl = [
      { url: GTECH_BASE_URL, isPromotional: salesInfo.hasSales },
      { url: `${GTECH_BASE_URL}/black-friday`, isPromotional: true },
      { url: `${GTECH_BASE_URL}/black-friday-deals`, isPromotional: true },
      { url: `${GTECH_BASE_URL}/sale`, isPromotional: true },
      { url: `${GTECH_BASE_URL}/products`, isPromotional: false },
      { url: `${GTECH_BASE_URL}/products/floorcare`, isPromotional: false },
      { url: `${GTECH_BASE_URL}/products/power-tools`, isPromotional: false },
      { url: `${GTECH_BASE_URL}/products/garden-tools`, isPromotional: false },
      { url: `${GTECH_BASE_URL}/products/hair-care`, isPromotional: false },
    ];

    // Crawl all pages in parallel
    const pageResults = await Promise.all(
      pagesToCrawl.map(page => extractProductsFromPage(page.url, page.isPromotional))
    );

    // Combine all products
    pageResults.forEach((products, index) => {
      const pageUrl = pagesToCrawl[index].url;
      const isBlackFridayPage = pageUrl.includes('black-friday') || pageUrl.includes('blackfriday');
      const isSalePage = pageUrl.includes('sale') || pageUrl.includes('promotion') || pageUrl.includes('deal');

      products.forEach(product => {
        const key = product.name.toLowerCase();
        if (!seenProducts.has(key)) {
          // Mark as Black Friday if from Black Friday page
          if (isBlackFridayPage) {
            product.category = 'Black Friday';
          } else if (isSalePage || product.originalPrice) {
            product.category = product.category === 'General' ? 'Sale' : product.category;
          }

          allProducts.push(product);
          seenProducts.add(key);

          if (product.originalPrice || pagesToCrawl[index].isPromotional || isBlackFridayPage || isSalePage) {
            promotions.push(product);
            sales.push(product);
          }

          if (product.category) {
            categories.add(product.category);
          }
        }
      });
    });

    // Extract from homepage with enhanced methods
    const homepageResponse = await axios.get(GTECH_BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 20000,
    });

    const $ = cheerio.load(homepageResponse.data);

    // Extract all sections
    $('section, [class*="section"], [class*="category"]').each((index, element) => {
      const $el = $(element);
      const sectionTitle = $el.find('h1, h2, h3, [class*="title"], [class*="heading"]').first().text().trim();
      if (sectionTitle && sectionTitle.length > 2 && sectionTitle.length < 50) {
        sections.add(sectionTitle);
      }
    });

    // Extract promotional sections
    $('[class*="black"], [class*="friday"], [class*="sale"], [class*="promotion"], [class*="deal"], [class*="discount"], [class*="offer"]').each((index, element) => {
      const $el = $(element);
      const sectionText = $el.text().toLowerCase();
      const isBlackFridaySection = sectionText.includes('black friday') || sectionText.includes('blackfriday');

      if (isBlackFridaySection || sectionText.includes('sale') || sectionText.includes('promotion') || sectionText.includes('deal')) {
        sections.add('Promotions');
        sections.add('Sales');
        if (isBlackFridaySection) {
          sections.add('Black Friday');
        }

        // Extract products from promotional sections
        $el.find('[class*="product"], article, [class*="item"], [class*="card"]').each((idx, prodEl) => {
          const $prod = $(prodEl);
          const name = $prod.find('h1, h2, h3, h4, [class*="name"], [class*="title"]').first().text().trim();
          const priceText = $prod.find('[class*="price"], .price, [data-price]').first().text();
          const priceMatch = priceText.match(/£[\d,]+\.?\d*/g);

          if (name && name.trim().length >= 3 && priceMatch && priceMatch.length > 0) {
            const price = priceMatch[0];
            const originalPrice = priceMatch[1] || undefined;
            const link = $prod.find('a').first().attr('href');
            const productUrl = link?.startsWith('http') ? link : `${GTECH_BASE_URL}${link || ''}`;

            const promoProduct: Product = {
              name: name.trim(),
              price,
              originalPrice,
              description: $prod.find('[class*="description"], p').first().text().trim(),
              category: isBlackFridaySection ? 'Black Friday' : 'Sale',
              url: productUrl,
            };

            const key = name.toLowerCase();
            if (!seenProducts.has(key)) {
              promotions.push(promoProduct);
              sales.push(promoProduct);
              allProducts.push(promoProduct);
              seenProducts.add(key);
              categories.add(promoProduct.category);
            }
          }
        });
      }
    });

    // Remove duplicates
    const uniqueProducts = allProducts.filter((product, index, self) =>
      index === self.findIndex((p) => p.name.toLowerCase() === product.name.toLowerCase())
    );

    // Cache the results
    productsCache = {
      products: uniqueProducts,
      categories: Array.from(categories),
      promotions: promotions.filter((p, index, self) =>
        p && p.name && p.name.trim() && index === self.findIndex((prod) => prod.name.toLowerCase() === p.name.toLowerCase())
      ),
      sales: sales.filter((p, index, self) =>
        p && p.name && p.name.trim() && index === self.findIndex((prod) => prod.name.toLowerCase() === p.name.toLowerCase())
      ),
      sections: Array.from(sections),
    };
    cacheTimestamp = Date.now();


    return productsCache;
  } catch (error: any) {
    // Only log unexpected errors, not 404s or timeouts
    if (error?.code !== 'ECONNABORTED' && error?.code !== 'ETIMEDOUT' && error?.response?.status !== 404) {
      console.error('Error fetching Gtech products:', error.message || error);
    }
    if (productsCache) {
      return productsCache;
    }
    return {
      products: [],
      categories: ['Floorcare', 'Power Tools', 'Garden Tools', 'Hair Care'],
      promotions: [],
      sales: [],
      sections: [],
    };
  }
}

// Get comprehensive website data
export async function getComprehensiveWebsiteData(): Promise<WebsiteData> {
  // Return cached data if still valid
  if (websiteDataCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return websiteDataCache;
  }

  let data: ProductData;
  let salesInfo: { hasSales: boolean; hasBlackFriday: boolean; saleText: string };
  
  try {
    data = await fetchGtechProducts();
    salesInfo = await checkForSales();
  } catch (error: any) {
    // Only log unexpected errors
    if (error?.code !== 'ECONNABORTED' && error?.code !== 'ETIMEDOUT' && error?.response?.status !== 404) {
      console.error('Error in getComprehensiveWebsiteData:', error.message || error);
    }
    // Return safe default
    return {
      products: [],
      categories: [],
      promotions: [],
      sales: [],
      blackFriday: [],
      sections: [],
      trending: [],
      hasSales: false,
      hasBlackFriday: false,
    };
  }

  // Get products with original prices (on sale) - must have a name
  const saleProducts = (data.products || []).filter((p: Product) => p && p.name && p.name.trim() && p.originalPrice);

  // Get black friday products - comprehensive check
  const blackFridayProducts = (data.products || []).filter((p: Product) => {
    if (!p || !p.name) return false;
    const nameLower = p.name.toLowerCase();
    const categoryLower = (p.category || '').toLowerCase();
    const descLower = (p.description || '').toLowerCase();
    const urlLower = (p.url || '').toLowerCase();

    return (
      nameLower.includes('black friday') ||
      nameLower.includes('blackfriday') ||
      categoryLower.includes('black friday') ||
      categoryLower.includes('blackfriday') ||
      descLower.includes('black friday') ||
      descLower.includes('blackfriday') ||
      urlLower.includes('black-friday') ||
      urlLower.includes('blackfriday') ||
      (salesInfo.hasBlackFriday && p.originalPrice) // If Black Friday is active, include all sale products
    );
  });

  // If Black Friday is active but no products found, include all sale products
  if (salesInfo.hasBlackFriday && blackFridayProducts.length === 0 && saleProducts.length > 0) {
    blackFridayProducts.push(...saleProducts.slice(0, 30));
  }

  // Get trending products (products with special prices)
  const trendingProducts = (data.products || []).filter((p: Product) => p && p.originalPrice).slice(0, 10);

  websiteDataCache = {
    products: data.products || [],
    categories: data.categories || [],
    promotions: data.promotions || [],
    sales: saleProducts || [],
    blackFriday: blackFridayProducts || [],
    sections: data.sections || [],
    trending: trendingProducts || [],
    hasSales: salesInfo.hasSales || false,
    hasBlackFriday: salesInfo.hasBlackFriday || false,
  };

  return websiteDataCache;
}

// Function to fetch individual product page for detailed info
export async function fetchProductDetails(productUrl: string): Promise<Product | null> {
  try {
    const response = await axios.get(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    const name = $('h1, [class*="product-name"], [class*="product-title"]').first().text().trim();

    let price = '';
    let originalPrice = '';

    const priceText = $('[class*="price"], .price, [class*="special-price"], [data-price]').first().text();
    const priceMatches = priceText.match(/£[\d,]+\.?\d*/g);

    if (priceMatches) {
      if (priceMatches.length > 1) {
        price = priceMatches[0];
        originalPrice = priceMatches[1];
      } else {
        price = priceMatches[0];
      }
    }

    const description = $('[class*="description"], [class*="product-description"]').first().text().trim();

    const specs: Record<string, string> = {};
    const features: string[] = [];

    // Extract specifications
    $('table, [class*="spec"], [class*="specification"], [class*="details"]').each((index, element) => {
      const $el = $(element);
      $el.find('tr, [class*="row"], [class*="item"]').each((idx, row) => {
        const $row = $(row);
        const label = $row.find('td:first-child, th:first-child, [class*="label"], [class*="key"], dt').first().text().trim();
        const value = $row.find('td:last-child, [class*="value"], [class*="data"], dd').first().text().trim();

        if (label && value && label.length < 50 && value.length < 200) {
          const normalizedLabel = label.toLowerCase().replace(/[:\s]+/g, '_');
          specs[normalizedLabel] = value;
        }
      });
    });

    // Extract features
    $('[class*="feature"], [class*="benefit"], ul, ol').each((index, element) => {
      const $el = $(element);
      $el.find('li, [class*="item"]').each((idx, item) => {
        const feature = $(item).text().trim();
        if (feature && feature.length < 200 && !features.includes(feature)) {
          features.push(feature);
        }
      });
    });

    // Extract from text content
    const pageText = $('body').text();
    const specPatterns = [
      /(?:weight|wt\.?)[:\s]+([^\n]+)/i,
      /(?:dimensions?|size)[:\s]+([^\n]+)/i,
      /(?:power|wattage)[:\s]+([^\n]+)/i,
      /(?:battery|runtime)[:\s]+([^\n]+)/i,
      /(?:capacity|volume)[:\s]+([^\n]+)/i,
    ];

    specPatterns.forEach((pattern) => {
      const match = pageText.match(pattern);
      if (match) {
        const key = pattern.source.match(/(\w+)/)?.[1]?.toLowerCase() || 'spec';
        const value = match[1].trim().substring(0, 100);
        if (value && !specs[key]) {
          specs[key] = value;
        }
      }
    });

    if (name) {
      return {
        name,
        price: price || 'Check website for current price',
        originalPrice: originalPrice || undefined,
        description,
        category: 'General',
        url: productUrl,
        features: features.slice(0, 20),
        specs: Object.keys(specs).length > 0 ? specs : undefined,
      };
    }

    return null;
  } catch (error: any) {
    // Silently handle 404s - product page doesn't exist
    if (error?.response?.status === 404) {
      return null;
    }
    // Only log non-404, non-timeout errors
    if (error?.code !== 'ECONNABORTED' && error?.code !== 'ETIMEDOUT' && error?.response?.status !== 404) {
      console.error('Error fetching product details:', error.message || error);
    }
    return null;
  }
}

// Normalize product name for better matching
function normalizeProductName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

// Check if query matches product name
function matchesProduct(query: string, productName: string): boolean {
  const normalizedQuery = normalizeProductName(query);
  const normalizedProduct = normalizeProductName(productName);

  if (normalizedProduct.includes(normalizedQuery) || normalizedQuery.includes(normalizedProduct)) {
    return true;
  }

  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length > 0) {
    const allWordsMatch = queryWords.every(word => normalizedProduct.includes(word));
    if (allWordsMatch) return true;
  }

  return false;
}

export async function searchProducts(query: string): Promise<Product[]> {
  const data = await fetchGtechProducts();
  const lowerQuery = query.toLowerCase();

  // Extract product codes from query (e.g., HT50, LHT50, GT50)
  const productCodePattern = /\b([A-Z]{2,}\d+)\b/gi;
  const productCodes: string[] = [];
  let match;
  while ((match = productCodePattern.exec(query)) !== null) {
    productCodes.push(match[1].toUpperCase());
  }

  let results = data.products.filter(
    (product) => {
      const productNameLower = product.name.toLowerCase();
      const matchesCode = productCodes.some(code => productNameLower.includes(code.toLowerCase()));
      return matchesCode ||
        matchesProduct(query, product.name) ||
        product.name.toLowerCase().includes(lowerQuery) ||
        product.description.toLowerCase().includes(lowerQuery) ||
        product.category.toLowerCase().includes(lowerQuery) ||
        product.features?.some((f) => f.toLowerCase().includes(lowerQuery)) ||
        (product.specs && Object.values(product.specs).some(v => v.toLowerCase().includes(lowerQuery)));
    }
  );

  if (results.length === 0) {
    const productSlugs: Record<string, string> = {
      'airram 3 plus': '/products/floorcare/cordless-upright-vacuums/airram-3-plus',
      'airram 3': '/products/floorcare/cordless-upright-vacuums/airram-3',
      'airram 2': '/products/floorcare/cordless-upright-vacuums/airram-2',
      'airram': '/products/floorcare/cordless-upright-vacuums',
      'orca': '/products/floorcare/wet-and-dry-vacuums/orca',
      'koala': '/products/floorcare/wet-and-dry-vacuums/koala',
      'penguin': '/products/floorcare/wet-and-dry-vacuums/penguin',
      'dryonic': '/products/hair-care/hair-dryers/dryonic',
      'styleonic': '/products/hair-care/hair-straighteners/styleonic',
      'combi drill': '/products/power-tools/cordless-drills-drivers/combi-drill',
      'lawnmower': '/products/garden-tools/cordless-lawn-mowers',
      'hedge trimmer': '/products/garden-tools/cordless-hedge-trimmers',
      'ht50': '/products/garden-tools/cordless-hedge-trimmers/ht50',
      'lht50': '/lightweight-hedge-trimmer-lht50',
      'gt50': '/products/garden-tools/grass-trimmers/gt50',
      'grass trimmer': '/products/garden-tools/grass-trimmers',
    };

    for (const [key, url] of Object.entries(productSlugs)) {
      if (lowerQuery.includes(key)) {
        const fullUrl = url.startsWith('http') ? url : `${GTECH_BASE_URL}${url}`;
        const productDetails = await fetchProductDetails(fullUrl);
        if (productDetails) {
          results.push(productDetails);
          break;
        }
      }
    }
  }

  return results;
}

export async function getProductByName(name: string): Promise<Product | null> {
  const data = await fetchGtechProducts();
  const lowerName = name.toLowerCase();

  let product = data.products.find(
    (product) => matchesProduct(name, product.name) ||
                 product.name.toLowerCase() === lowerName ||
                 product.name.toLowerCase().includes(lowerName) ||
                 lowerName.includes(product.name.toLowerCase().substring(0, 10))
  );

  if (!product) {
    const productNameMap: Record<string, string> = {
      'airram 3 plus': '/products/floorcare/cordless-upright-vacuums/airram-3-plus',
      'airram 3': '/products/floorcare/cordless-upright-vacuums/airram-3',
      'airram 2': '/products/floorcare/cordless-upright-vacuums/airram-2',
      'air ram 3 plus': '/products/floorcare/cordless-upright-vacuums/airram-3-plus',
      'air ram 3': '/products/floorcare/cordless-upright-vacuums/airram-3',
      'air ram 2': '/products/floorcare/cordless-upright-vacuums/airram-2',
      'orca': '/products/floorcare/wet-and-dry-vacuums/orca',
      'koala': '/products/floorcare/wet-and-dry-vacuums/koala',
      'penguin': '/products/floorcare/wet-and-dry-vacuums/penguin',
      'dryonic': '/products/hair-care/hair-dryers/dryonic',
      'styleonic': '/products/hair-care/hair-straighteners/styleonic',
      'combi drill': '/products/power-tools/cordless-drills-drivers/combi-drill',
      'lawnmower clm50': '/products/garden-tools/cordless-lawn-mowers/clm50',
      'hedge trimmer ht50': '/products/garden-tools/cordless-hedge-trimmers/ht50',
      'ht50': '/products/garden-tools/cordless-hedge-trimmers/ht50',
      'lht50': '/lightweight-hedge-trimmer-lht50',
      'gt50': '/products/garden-tools/grass-trimmers/gt50',
    };

    for (const [key, url] of Object.entries(productNameMap)) {
      if (lowerName.includes(key) || matchesProduct(name, key)) {
        const fullUrl = url.startsWith('http') ? url : `${GTECH_BASE_URL}${url}`;
        const fetchedProduct = await fetchProductDetails(fullUrl);
        if (fetchedProduct) {
          product = fetchedProduct;
          break;
        }
      }
    }
  }

  return product || null;
}

export async function getRelatedProducts(productName: string): Promise<Product[]> {
  const product = await getProductByName(productName);
  if (!product) return [];

  const data = await fetchGtechProducts();
  return data.products
    .filter(
      (p) =>
        p.name !== product.name &&
        (p.category === product.category || p.features?.some((f) => product.features?.includes(f)))
    )
    .slice(0, 3);
}
