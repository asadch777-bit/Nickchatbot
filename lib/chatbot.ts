import { 
  searchProducts, 
  getRelatedProducts, 
  getComprehensiveWebsiteData,
  fetchProductDetails,
  Product
} from './scraper';
import OpenAI from 'openai';
import { searchKnowledge } from './knowledgeData';

// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;

// Function to get or initialize OpenAI client
function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY;
  
  if (!apiKey) {
    return null;
  }
  
  // If client doesn't exist or was previously null, initialize it
  if (!openai) {
    try {
      openai = new OpenAI({ apiKey });
      console.log('[Chatbot] OpenAI client initialized');
    } catch (error) {
      console.error('[Chatbot] Error initializing OpenAI client:', error);
      return null;
    }
  }
  
  return openai;
}


export interface ChatResponse {
  response: string;
  suggestions?: string[];
  options?: Array<{
    label: string;
    value: string;
    action?: string;
  }>;
  showOptions?: boolean;
}

const GTECH_BASE_URL = 'https://www.gtech.co.uk';
const SUPPORT_EMAIL = 'support@gtech.co.uk';
const SUPPORT_PHONE = '08000 308 794';

// Category page URLs mapping
const CATEGORY_URLS: Record<string, string> = {
  'power tools': `${GTECH_BASE_URL}/cordless-power-tools.html`,
  'power tool': `${GTECH_BASE_URL}/cordless-power-tools.html`,
  'garden tools': `${GTECH_BASE_URL}/garden-tools.html`,
  'garden tool': `${GTECH_BASE_URL}/garden-tools.html`,
  'floorcare': `${GTECH_BASE_URL}/cordless-vacuum-cleaners.html`,
  'floor care': `${GTECH_BASE_URL}/cordless-vacuum-cleaners.html`,
  'hair care': `${GTECH_BASE_URL}/haircare.html`,
  'haircare': `${GTECH_BASE_URL}/haircare.html`,
  'vacuum': `${GTECH_BASE_URL}/cordless-vacuum-cleaners.html`,
  'drill': `${GTECH_BASE_URL}/cordless-power-tools.html`,
  'mower': `${GTECH_BASE_URL}/garden-tools.html`,
  'trimmer': `${GTECH_BASE_URL}/garden-tools.html`,
};

// Store conversation context
const conversationContext = new Map<string, { 
  lastProduct?: Product; 
  lastProducts?: Product[]; 
  conversationHistory: Array<{role: string; content: string}>;
  problemOptionsShown?: boolean;
  selectedProblem?: string;
  waitingForModelNumber?: boolean;
  productModelNumber?: string;
}>();

export async function processChatMessage(message: string, sessionId: string = 'default'): Promise<ChatResponse> {
  try {
    // Get or create conversation context
    let context = conversationContext.get(sessionId);
    if (!context) {
      context = { conversationHistory: [] };
      conversationContext.set(sessionId, context);
    }

    // Add user message to history
    context.conversationHistory.push({ role: 'user', content: message });

    // Check if user is reporting a problem
    const lowerMessage = message.toLowerCase();
    const problemKeywords = ['not working', 'broken', 'not starting', 'not turning on', 'stopped working', 'malfunction', 'issue', 'problem', 'faulty', 'defective'];
    const isProblemReport = problemKeywords.some(keyword => lowerMessage.includes(keyword));

    // Note: Greetings are handled naturally by the AI based on system prompt instructions
    // No hardcoded responses - let the AI generate appropriate greeting responses

    // Check if user selected an option (starts with action: prefix)
    if (message.startsWith('action:')) {
    const action = message.replace('action:', '').trim();
    context.selectedProblem = action;
    
    // Fetch website data first (needed for handleProblemSelection)
    let websiteData: any;
    try {
      websiteData = await Promise.race([
        getComprehensiveWebsiteData(),
        new Promise<any>((resolve) => setTimeout(() => {
          console.warn('[Chatbot] Website data fetch timed out in action handler');
          resolve({
            products: [],
            sales: [],
            blackFriday: [],
            promotions: [],
            categories: [],
            sections: [],
            trending: [],
            hasSales: false,
            hasBlackFriday: false,
          });
        }, 10000))
      ]);
      if (!websiteData.hasSales) websiteData.hasSales = false;
      if (!websiteData.hasBlackFriday) websiteData.hasBlackFriday = false;
      if (!websiteData.products) websiteData.products = [];
      if (!websiteData.sales) websiteData.sales = [];
      if (!websiteData.blackFriday) websiteData.blackFriday = [];
      if (!websiteData.promotions) websiteData.promotions = [];
    } catch (error) {
      console.error('[Chatbot] Error fetching website data in action handler:', error instanceof Error ? error.message : String(error));
      websiteData = {
        products: [],
        sales: [],
        blackFriday: [],
        promotions: [],
        categories: [],
        sections: [],
        trending: [],
        hasSales: false,
        hasBlackFriday: false,
      };
    }
    
      return await handleProblemSelection(action, context, websiteData);
    }

    // If it's a problem report, try to extract product model number from the message
    if (isProblemReport && !message.startsWith('action:')) {
      // Try to extract product codes (e.g., GT50, HT50, LHT50, etc.)
      const productCodePattern = /\b([A-Z]{2,}\d+)\b/gi;
      const productCodes: string[] = [];
      let match;
      while ((match = productCodePattern.exec(message)) !== null) {
        productCodes.push(match[1].toUpperCase());
      }
      
      if (productCodes.length > 0) {
        // Product model found in the message - store it and continue with troubleshooting
        context.productModelNumber = productCodes[0];
        console.log('PROBLEM DETECTED with product model:', context.productModelNumber);
        // Continue to normal flow - the AI will use the model number to help troubleshoot
      } else {
        // No product model found - the AI will naturally ask for it in the conversation
        console.log('PROBLEM DETECTED but no product model found - AI will ask naturally');
      }
    }

    // Fetch live data from website with timeout protection for Vercel
    let websiteData: any;
    try {
      websiteData = await Promise.race([
        getComprehensiveWebsiteData(),
        new Promise<any>((resolve) => setTimeout(() => {
          console.warn('[Chatbot] Website data fetch timed out, using empty data');
          resolve({
            products: [],
            sales: [],
            blackFriday: [],
            promotions: [],
            categories: [],
            sections: [],
            trending: [],
            hasSales: false,
            hasBlackFriday: false,
          });
        }, 10000)) // 10 second timeout for Vercel
      ]);
      // Ensure all required fields exist
      if (!websiteData.hasSales) websiteData.hasSales = false;
      if (!websiteData.hasBlackFriday) websiteData.hasBlackFriday = false;
      if (!websiteData.products) websiteData.products = [];
      if (!websiteData.sales) websiteData.sales = [];
      if (!websiteData.blackFriday) websiteData.blackFriday = [];
      if (!websiteData.promotions) websiteData.promotions = [];
    } catch (error) {
      console.error('[Chatbot] Error fetching website data:', error instanceof Error ? error.message : String(error));
      // Return safe default
      websiteData = {
        products: [],
        sales: [],
        blackFriday: [],
        promotions: [],
        categories: [],
        sections: [],
        trending: [],
        hasSales: false,
        hasBlackFriday: false,
      };
    }
    
    // Search for products FIRST so we can include them in the context
    let searchedProducts: Product[] = [];
    try {
      searchedProducts = await Promise.race([
        searchProducts(message),
        new Promise<Product[]>((resolve) => setTimeout(() => resolve([]), 5000))
      ]) as Product[];
      
      // Fetch full product details for products that don't have prices or have incomplete data
      if (searchedProducts.length > 0) {
        await Promise.all(
          searchedProducts.map(async (product) => {
            // If product doesn't have a price or has placeholder price, fetch full details
            if (!product.price || 
                product.price === 'Check website for current price' || 
                product.price === 'Check website' ||
                !product.specs && product.url && product.url !== GTECH_BASE_URL) {
              try {
                const fullDetails = await Promise.race([
                  fetchProductDetails(product.url),
                  new Promise<Product | null>((resolve) => setTimeout(() => resolve(null), 5000))
                ]);
                if (fullDetails) {
                  // Merge full details into product, prioritizing fetched price
                  Object.assign(product, {
                    ...fullDetails,
                    price: fullDetails.price !== 'Check website for current price' ? fullDetails.price : product.price,
                  });
                }
              } catch (error) {
                // Silently continue if fetch fails
              }
            }
          })
        );
        
        if (searchedProducts.length === 1) {
          context.lastProduct = searchedProducts[0];
        } else {
          context.lastProducts = searchedProducts.slice(0, 10);
        }
      }
    } catch (error) {
      console.warn('[Chatbot] Error searching products (non-fatal):', error instanceof Error ? error.message : String(error));
    }

    // Search knowledge base for relevant information
    let knowledgeResults: any[] = [];
    try {
      knowledgeResults = searchKnowledge(message, 5);
    } catch (error) {
      console.warn('[Chatbot] Error searching knowledge base (non-fatal):', error instanceof Error ? error.message : String(error));
    }
    
    // Build comprehensive context for AI
    let contextInfo = '';
    
    // Add knowledge base information if found
    if (knowledgeResults.length > 0) {
      contextInfo += `\n--- Knowledge Base Information (from knowledge.json) ---\n`;
      contextInfo += `IMPORTANT: This is general information from the knowledge base. You MUST ALSO use the Website Data section below for current prices, product availability, sales, specifications, and live information scraped from gtech.co.uk.\n`;
      contextInfo += `Use BOTH sources together - Knowledge Base for general info/FAQs, Website Data for current prices and live product information.\n\n`;
      knowledgeResults.forEach((kbItem, index) => {
        const kbText = Object.entries(kbItem)
          .map(([key, value]) => {
            if (value && typeof value === 'string') {
              return `${key}: ${value}`;
            } else if (value && typeof value === 'object') {
              return `${key}: ${JSON.stringify(value)}`;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');
        contextInfo += `${index + 1}. ${kbText}\n\n`;
      });
      contextInfo += `--- End of Knowledge Base ---\n\n`;
      contextInfo += `REMINDER: Above is Knowledge Base info. Below is LIVE Website Data scraped from gtech.co.uk. Use BOTH sources in your response.\n\n`;
    }
    
    // Add found products information to context (from website scraping)
    if (searchedProducts.length > 0) {
      contextInfo += `\n--- Products Found from Query ---\n`;
      contextInfo += `IMPORTANT: These products were found for the user's query. You MUST include their prices in your response.\n\n`;
      searchedProducts.forEach((product, index) => {
        const priceInfo = product.price && product.price !== 'Check website for current price' 
          ? product.price 
          : 'Price available on product page';
        contextInfo += `${index + 1}. ${product.name}\n`;
        contextInfo += `   PRICE: ${priceInfo}${product.originalPrice ? ` (was ${product.originalPrice})` : ''}\n`;
        if (product.description) contextInfo += `   Description: ${product.description.substring(0, 200)}\n`;
        if (product.specs && Object.keys(product.specs).length > 0) {
          contextInfo += `   SPECIFICATIONS:\n`;
          Object.entries(product.specs).forEach(([k, v]) => {
            const specKey = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            contextInfo += `      • ${specKey}: ${v}\n`;
          });
        }
        if (product.features && product.features.length > 0) {
          contextInfo += `   Features: ${product.features.slice(0, 5).join(', ')}\n`;
        }
        contextInfo += `   URL: ${product.url}\n\n`;
      });
      contextInfo += `--- End of Found Products ---\n\n`;
      contextInfo += `REMINDER: When the user asks about price, you MUST include the price information from the products listed above.\n`;
      contextInfo += `REMINDER: When the user asks about specifications or specs, you MUST include ALL specifications from the products listed above if they are available.\n\n`;
    }
    
    // Add sales information (from website scraping)
    contextInfo += `\n--- LIVE Website Data (Scraped from gtech.co.uk) ---\n`;
    contextInfo += `This data is scraped live from the website and includes current prices, products, sales, and specifications.\n`;
    contextInfo += `Current Sales Status:\n`;
    contextInfo += `- Has Sales: ${websiteData.hasSales}\n`;
    contextInfo += `- Has Black Friday: ${websiteData.hasBlackFriday}\n`;
    contextInfo += `- Total Sale Products: ${websiteData.sales.length}\n`;
    contextInfo += `- Total Black Friday Products: ${websiteData.blackFriday.length}\n`;
    contextInfo += `- Total Promotional Products: ${websiteData.promotions.length}\n\n`;
    
    // Always add all sale products to context (not just when user asks about sales)
    if (websiteData.sales && websiteData.sales.length > 0) {
      // Filter out invalid products - exclude navigation elements and non-product items
      const excludedNames = ['search', 'sign up', 'login', 'register', 'track', 'support', 'contact', 'about', 'blog', 'faq', 'delivery', 'returns', 'warranty', 'privacy', 'terms', 'cookie', 'basket', 'cart', 'checkout'];
      const excludedPaths = ['newsletter', 'signup', 'search', 'login', 'register', 'track', 'support', 'contact', 'about', 'blog', 'faq', 'delivery', 'returns', 'warranty', 'privacy', 'terms', 'cookie'];
      
      // First, filter out invalid products
      let validSaleProducts = websiteData.sales.filter((p: Product) => {
        if (!p || !p.name || !p.name.trim()) return false;
        
        const nameLower = p.name.toLowerCase().trim();
        // Exclude navigation elements
        if (excludedNames.some(excluded => nameLower === excluded || nameLower.includes(excluded))) return false;
        
        // Exclude products with invalid URLs
        if (p.url) {
          const urlLower = p.url.toLowerCase();
          if (excludedPaths.some(path => urlLower.includes(path))) return false;
        }
        
        // Must have at least 3 letters in the name
        if (!/[a-zA-Z]{3,}/.test(p.name)) return false;
        
        return true;
      });
      
      // Fetch full details for products missing price or originalPrice
      // This ensures all sale products have complete information
      await Promise.all(
        validSaleProducts.map(async (product: Product) => {
          if ((!product.price || product.price === 'Check website for current price' || !product.originalPrice) && product.url && product.url !== GTECH_BASE_URL && !product.url.includes('newsletter') && !product.url.includes('signup')) {
            try {
              const fullDetails = await Promise.race([
                fetchProductDetails(product.url),
                new Promise<Product | null>((resolve) => setTimeout(() => resolve(null), 3000))
              ]);
              if (fullDetails) {
                // Merge full details, prioritizing fetched price and originalPrice
                Object.assign(product, {
                  ...fullDetails,
                  price: fullDetails.price !== 'Check website for current price' ? fullDetails.price : product.price,
                  originalPrice: fullDetails.originalPrice || product.originalPrice,
                });
              }
            } catch (error) {
              // Silently continue if fetch fails
            }
          }
        })
      );
      
      contextInfo += `--- All Products Currently on Sale (${validSaleProducts.length} products) ---\n`;
      contextInfo += `\n🚨 CRITICAL INSTRUCTION - READ CAREFULLY 🚨\n`;
      contextInfo += `When user asks about sales, offers, or promotions (ANY variation: "is there a sale?", "which products are on sale?", "what products are on sale?", "show me sale products", "are there any sales?", "what offers do you have?", "what offer do you have right now?", "what offers Gtech have?", "do you have any offer?"):\n`;
      contextInfo += `CRITICAL: When user asks about offers, sales, or promotions, you MUST provide BOTH the offers page link AND the newsletter signup link. DO NOT list individual products.\n`;
      contextInfo += `Your response should be SIMPLE and SHORT - provide both links:\n`;
      contextInfo += `"You can view all our current offers here: https://www.gtech.co.uk/offers.html\n\nYou can also signup for our newsletter to be the first to know about our exclusive discount and offer: https://www.gtech.co.uk/newsletter-signup"\n`;
      contextInfo += `DO NOT list products. DO NOT show product names, prices, or URLs. ONLY show the offers page link and newsletter signup link.\n\n`;
    }
    
    if (context.lastProduct) {
      contextInfo += `Last product discussed: ${context.lastProduct.name} - Price: ${context.lastProduct.price}${context.lastProduct.originalPrice ? ` (was ${context.lastProduct.originalPrice})` : ''} - URL: ${context.lastProduct.url}\n`;
    }
    
    if (context.lastProducts && context.lastProducts.length > 0) {
      contextInfo += `Last products shown (${context.lastProducts.length} products):\n`;
      context.lastProducts.forEach((product, index) => {
        contextInfo += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
      });
    }
    
    if (!context.lastProduct && !context.lastProducts) {
      contextInfo += 'No previous product context\n';
    }

    // Use OpenAI to generate intelligent response
    // Get or initialize OpenAI client (handles case where key was added after module load)
    const currentOpenAI = getOpenAIClient();
    const hasOpenAIKey = !!currentOpenAI && !!(process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY);
    
    if (hasOpenAIKey && currentOpenAI) {
    try {
      // Build product list for AI (limit to prevent prompt from being too large)
      let productList = '';
      if (websiteData.products && websiteData.products.length > 0) {
        productList = '\n\nAvailable Products (with categories for filtering):\n';
        // Limit to 50 products to keep prompt size manageable but allow for category filtering
        const maxProducts = 50;
        websiteData.products.slice(0, maxProducts).forEach((product: Product, index: number) => {
          const name = (product.name || '').substring(0, 100); // Limit product name length
          const price = product.price || 'Check website';
          const category = product.category || 'General';
          productList += `${index + 1}. ${name} - ${price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - Category: ${category}\n`;
        });
        if (websiteData.products.length > maxProducts) {
          productList += `...and ${websiteData.products.length - maxProducts} more products\n`;
        }
      }

      const systemPrompt = `You are NICK, an intelligent Gtech product assistant. You help customers with product information, pricing, ordering, and support.

CRITICAL RULES:
0. **GENERAL WEBSITE REFERENCES - CRITICAL**: When mentioning the Gtech website in general responses (e.g., "Can you talk to me?", "tell me about Gtech", general questions, or when providing general information), ALWAYS use the main website URL: https://www.gtech.co.uk/ (NOT category-specific URLs like /cordless-vacuum-cleaners.html). Only use category URLs when the user specifically asks about that category or product type.
   - ✅ CORRECT: "I'm here to assist you with any questions about Gtech https://www.gtech.co.uk/"
   - ❌ WRONG: "I'm here to assist you with any questions about Gtech https://www.gtech.co.uk/cordless-vacuum-cleaners.html"
   - Use category URLs ONLY when the user asks about that specific category
   - **WHEN USER ASKS FOR WEBSITE LINK**: If user asks for "Gtech website link", "website link", "link to Gtech", "can I get the Gtech website link", respond simply and directly:
     - ✅ CORRECT: "Here's the link to our website: https://www.gtech.co.uk/"
     - ✅ CORRECT: "Of course! Here's our website: https://www.gtech.co.uk/"
     - ❌ WRONG: "You can visit the https://www.gtech.co.uk here: https://www.gtech.co.uk/" (redundant, mentions URL twice)
     - Keep it simple - just provide the link once in a natural way
1. **RESPOND TO THE ACTUAL QUERY**: Always respond directly to what the user is asking. If the user asks a question, answer it. If the user types a number or unclear text, ask for clarification. DO NOT default to greeting responses like "I'm good, thank you!" unless the user specifically asks "How are you?" or similar questions.
2. **ALWAYS USE FIRST-PERSON LANGUAGE**: You represent Gtech, so ALWAYS use "we", "our", "us" when referring to Gtech. NEVER use "they", "their", "them" when talking about Gtech. For example:
   - ✅ CORRECT: "We offer a 2-year warranty on our products"
   - ❌ WRONG: "They offer a 2-year warranty on their products"
   - ✅ CORRECT: "You can contact our customer service"
   - ❌ WRONG: "You can contact their customer service"
3. **GREETINGS - CRITICAL - READ CAREFULLY**: 
   - ONLY respond with "I'm good, thank you! How can I help you today?" when users SPECIFICALLY ask "How are you?" or similar questions about your well-being (e.g., "How are you today?", "How are you doing?", "How's it going?", "How are you today Nick?")
   - For simple greetings like "hi", "hello", "hey", respond with: "Hello! How can I assist you today?" or "Hi! How can I help you?"
   - **CRITICAL**: For ANY other query (numbers, product questions, random text, etc.), respond DIRECTLY to the query - DO NOT use "I'm good, thank you!" response
   - **CRITICAL**: If the user's message is NOT a greeting or "how are you" question, respond to what they actually asked - do NOT default to greeting responses
   - Examples:
     - User: "How are you?" → ✅ "I'm good, thank you! How can I help you today?"
     - User: "hi" → ✅ "Hello! How can I assist you today?"
     - User: "2" → ❌ DO NOT respond with "I'm good, thank you!" - ask "I'm not sure what you mean by '2'. Could you please clarify what you're looking for?"
     - User: "what products do you have?" → ❌ DO NOT use greeting response - answer the product question directly
     - User: "hello" → ✅ "Hello! How can I assist you today?"
     - User: "product price" → ❌ DO NOT use greeting response - ask which product they want the price for
3. NEVER use predefined responses - ALWAYS generate responses based on the live data provided
4. **ALWAYS INCLUDE PRICES**: When a user asks about a product price or asks "what's the price of [product]", you MUST include the exact price from the product data provided. NEVER say "I can't provide the price" or "check the website" - the price is in the data, always include it.
5. **PRODUCT RESPONSE FORMAT - CRITICAL**: When providing product information, you MUST format your response as follows:
   - START your response with: "You can find more details and make a purchase here: [PRODUCT_URL]"
   - Then provide ONLY the price and features (NOT specifications unless user asks for them)
   - DO NOT start with "The [product] is priced at..." or "The [URL] is priced at..."
   - DO NOT end with duplicate or broken URLs
   - DO NOT include specifications unless the user explicitly asks for them (e.g., "specifications", "specs", "what are the specs")
   - Example CORRECT format:
     "You can find more details and make a purchase here: https://www.gtech.co.uk/cordless-vacuum-cleaners/cordless-wet-and-dry-vacuums/orca-hard-floor-cleaner.html
     
     Price: £349.99
     
     Features:
     [list features]"
   - Example WRONG format:
     "The https://www.gtech.co.uk/... is priced at £349.99... [includes specifications without being asked]"
6. **SPECIFICATIONS - ONLY WHEN ASKED**: 
   - DO NOT include specifications in product responses unless the user explicitly asks for them
   - When a user asks about product specifications, specs, or features (e.g., "specifications of GT50", "what are the specs", "specs of orca"), you MUST include ALL specifications from the product data provided
   - If "SPECIFICATIONS:" is listed in the product data above, you MUST include them in your response when asked
   - NEVER say "I don't have specifications" if specs are listed in the product data - they are there, always include them when asked
   - NEVER include specifications automatically - only when the user explicitly requests them
7. **USE BOTH KNOWLEDGE BASE AND WEBSITE DATA**: 
   - You have access to TWO sources of information:
     a) Knowledge Base Information (from knowledge.json) - contains FAQs, troubleshooting guides, and general product information
     b) Website Data (scraped live from gtech.co.uk) - contains current products, prices, sales, specifications, and real-time information
   - You MUST use BOTH sources together to provide complete answers
   - When answering questions:
     • Use Knowledge Base for general information, FAQs, and troubleshooting steps
     • Use Website Data for current prices, product availability, sales, specifications, and live product information
     • COMBINE information from both sources - don't rely on just one
     • If Knowledge Base has general info and Website Data has specific product details, include BOTH
     • Website Data is LIVE and current - always use it for prices, sales, and product availability
     • Knowledge Base is for general guidance - use it for FAQs and troubleshooting
   - NEVER ignore Website Data in favor of only Knowledge Base - they complement each other
8. Understand context perfectly:
   • "this" or "it" = refers to lastProduct (single product)
   • "these" or "them" = refers to lastProducts (multiple products shown)
   • If user asks "how to order these?", provide ordering steps for ALL products in lastProducts
9. Always use live data from the website - prices, products, promotions are all fetched in real-time
10. Be conversational and helpful - answer questions naturally based on the data provided
11. If user asks about ordering multiple products, explain how to order each one
12. **CATEGORY QUERIES - CRITICAL**: 
   - **When users ask "what categories do you have?" or "what categories are available?" or "list categories" or similar questions asking for ALL categories:**
     - You MUST respond with ONLY the main product categories (not subcategories or accessories)
     - List ONLY these 4 main categories:
       1. Floorcare
       2. Garden Tools
       3. Hair Care
       4. Power Tools
     - Format your response EXACTLY like this (copy this format):
       "We have the following main categories:
       
       Floorcare
       Garden Tools
       Hair Care
       Power Tools
       
       We also have Floorcare Accessories, Power Tools Accessories, and Gardening Accessories available."
     - DO NOT list subcategories like "Bagged Vacuum Cleaners", "Pet Vacuum Cleaners", "Cordless Upright Vacuums", etc.
     - DO NOT list "Promotions" as a category
     - The category names will automatically become clickable links, so just write them as plain text
   - **When users ask about a SPECIFIC product category** (e.g., "power tools", "garden tools", "floorcare", "hair care", "vacuum", "drill", "mower", "trimmer", etc.) OR ask for a category link (e.g., "give me the link", "what's the URL", "link to hair care"):
     - Provide a brief, friendly response acknowledging the category
     - ALWAYS include the FULL category page URL in your response - use the EXACT URLs from the "CATEGORY PAGE URLS" section below
     - CRITICAL: When providing category links, you MUST use the complete full URL starting with "https://www.gtech.co.uk/"
     - NEVER use partial URLs, relative paths, or text like "products/hair-care" - ALWAYS use the complete URL
     - Format examples (COPY THESE EXACT FORMATS - DO NOT MODIFY):
       For "hair care" category: "Yes, we have a variety of hair care products available! You can browse all our hair care products here: https://www.gtech.co.uk/haircare.html"
       For "power tools" category: "Yes, we have a range of power tools available! You can browse all our power tools here: https://www.gtech.co.uk/cordless-power-tools.html"
     - When user explicitly asks for a link (e.g., "give me the link", "what's the URL", "link to hair care"), respond EXACTLY like this:
       For hair care: "Of course! Here's the link to our hair care category: https://www.gtech.co.uk/haircare.html"
       For power tools: "Of course! Here's the link to our power tools category: https://www.gtech.co.uk/cordless-power-tools.html"
     - CRITICAL: The URL MUST be complete - use the EXACT URLs from the "CATEGORY PAGE URLS" section below
     - NEVER output "https://www.gtech.co.uk/products/" without the category name - this is WRONG
     - The CORRECT format is: "https://www.gtech.co.uk/haircare.html" (for hair care category)
     - The WRONG format is: "https://www.gtech.co.uk/products/" (missing the category name)
     - IMPORTANT: DO NOT use markdown link syntax like [text](url) - just include the plain URL in your response
     - DO NOT use brackets or parentheses around URLs - just write the URL as plain text
     - The URL will be automatically converted to a clickable link, so just include it as plain text
     - Keep the response concise and helpful - DO NOT list all products in detail
     - DO NOT ask "which product are you interested in?" - instead direct them to the category page and ask for model number/product name
13. IMPORTANT: If hasSales is true, there ARE sales going on. If hasBlackFriday is true, there IS a Black Friday sale. Always check these flags first before saying "no sales"
14. **SALE PRODUCTS QUERIES - ABSOLUTELY CRITICAL - READ THIS CAREFULLY**: 
   - When user asks ANY question about sales, offers, or promotions (e.g., "is there a sale?", "which products are on sale?", "what products are on sale?", "show me sale products", "are there any sales?", "what offers do you have?", "what offer do you have right now?", "what products do you have on offer?", "do you have any offer?", "what offers are available?", "what offers Gtech have?"):
   - CRITICAL: The word "offer" or "offers" in ANY form means the user is asking about offers
   - You MUST respond with BOTH the offers page link AND the newsletter signup link - DO NOT list individual products
   - Your response should be SIMPLE and SHORT:
     "You can view all our current offers here: https://www.gtech.co.uk/offers.html

You can also signup for our newsletter to be the first to know about our exclusive discount and offer: https://www.gtech.co.uk/newsletter-signup"
   - DO NOT list products, prices, or product URLs
   - DO NOT show product names or details
   - ONLY provide the offers page link and newsletter signup link
   - Keep your response brief and to the point
15. **Troubleshooting Help**: When a user reports a problem with a product:
    • If a product model number is provided (check conversation history or productModelNumber in context), use the available product information to help
    • Ask clarifying questions naturally to understand the problem better (e.g., "Can you tell me more about what's happening?" or "What exactly is the issue?")
    • Provide step-by-step troubleshooting guidance based on the product information available
    • Be conversational and helpful - guide the user through solutions naturally rather than showing options or lists
    • Use general troubleshooting knowledge and product information from the website data

Current website data:
- Total products: ${websiteData.products.length}
- Has Sales: ${websiteData.hasSales} (IMPORTANT: If true, there ARE sales!)
- Has Black Friday: ${websiteData.hasBlackFriday} (IMPORTANT: If true, there IS Black Friday!)
- Promotional products: ${websiteData.promotions.length}
- Sale products: ${websiteData.sales.length}
- Black Friday products: ${websiteData.blackFriday.length}
- Categories: ${websiteData.categories.join(', ')}

${contextInfo}

${productList}

Support information:
- Phone: ${SUPPORT_PHONE}
- Email: ${SUPPORT_EMAIL}
- Website: ${GTECH_BASE_URL}
- Free delivery available
- 30-day guarantee
- 2-year warranty

Generate a helpful, intelligent response based on the user's query and the live data. Understand context perfectly - if user says "these", refer to the lastProducts list.

**CATEGORY PAGE URLS - CRITICAL - YOU MUST USE THESE EXACT COMPLETE URLs**:
When users ask about categories or request category links, you MUST use these EXACT complete URLs (copy them exactly as shown):

For "hair care" or "haircare" → USE THIS EXACT URL: https://www.gtech.co.uk/haircare.html
For "power tools" → USE THIS EXACT URL: https://www.gtech.co.uk/cordless-power-tools.html
For "garden tools" → USE THIS EXACT URL: https://www.gtech.co.uk/garden-tools.html
For "floorcare" or "floor care" → USE THIS EXACT URL: https://www.gtech.co.uk/cordless-vacuum-cleaners.html

CRITICAL RULES - READ CAREFULLY:
1. ALWAYS include the COMPLETE URL path - use the EXACT URLs shown above
2. For power tools, use: https://www.gtech.co.uk/cordless-power-tools.html (NOT /products/power-tools)
3. For hair care, use: https://www.gtech.co.uk/haircare.html (NOT /products/hair-care)
4. For floorcare, use: https://www.gtech.co.uk/cordless-vacuum-cleaners.html (NOT /products/floorcare)
5. For garden tools, use: https://www.gtech.co.uk/garden-tools.html (NOT /products/garden-tools)
6. NEVER stop at "/products/" - you MUST include the complete path
7. NEVER use "https://www.gtech.co.uk/products/" alone - it MUST be followed by the category name
8. Copy the URLs exactly as shown above - do NOT modify, shorten, or truncate them
9. The URL will be automatically converted to a clickable link, so just include the full complete URL as plain text

**PRICE QUERIES - CRITICAL**: When users ask about product prices (e.g., "what's the price of AirRAM 3" or "price of hair dryer"), you MUST:
- ALWAYS check the "Products Found from Query" section above FIRST
- If ANY products are listed in "Products Found from Query", you MUST include their prices in your response
- Format prices clearly at the START of your response: "The [Product Name] is priced at [price]" or "[Product Name]: [price]"
- If the price shows "Check website for current price", say: "The current price for [Product Name] is available on the product page. You can check the latest price here: [URL]"
- If multiple products match, list ALL of them with their prices
- NEVER say "I can't provide the price" or "the price is not specified" - ALWAYS include the price information from the product data above
- If product data exists above, the price information MUST be in your response

**SPECIFICATION QUERIES - CRITICAL**: When users ask about product specifications (e.g., "specifications of GT50" or "what are the specs of [product]"), you MUST:
- ALWAYS check the "Products Found from Query" section above FIRST
- If ANY products are listed with "SPECIFICATIONS:" in the product data, you MUST include ALL of them in your response
- Format specifications clearly: List each specification on a new line or as a bullet point
- If specifications are available in the product data, NEVER say "I don't have specifications" or "I can't provide specifications" - they are in the data, always include them
- If multiple products match, provide specifications for ALL matching products
- Include features if available in addition to specifications`;

      // Let the AI handle sale queries naturally - no hardcoded responses
      // The AI will use the sale products context provided below to generate natural responses

      let completion;
      try {
        completion = await Promise.race([
          currentOpenAI.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              ...context.conversationHistory.slice(-10).map(msg => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
              })),
              {
                role: 'user',
                content: message,
              },
            ],
            temperature: 0.7,
            max_tokens: 1500,
          }),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout')), 25000)) // 25 second timeout
        ]);
      } catch (openaiError: any) {
        console.error('[Chatbot] OpenAI API call failed:', openaiError);
        console.error('[Chatbot] OpenAI error type:', openaiError?.constructor?.name);
        console.error('[Chatbot] OpenAI error message:', openaiError?.message);
        console.error('[Chatbot] OpenAI error status:', openaiError?.status);
        console.error('[Chatbot] OpenAI error code:', openaiError?.code);
        throw openaiError; // Re-throw to be caught by outer try-catch
      }

      let aiResponse = completion?.choices?.[0]?.message?.content || '';
      if (!aiResponse) {
        console.warn('[Chatbot] OpenAI returned empty response');
        throw new Error('OpenAI returned empty response');
      }

      // If user asks about products, ensure we have the data
      // lowerMessage already declared above
      
      // Handle "these" or "them" - refers to lastProducts
      if ((lowerMessage.includes('these') || lowerMessage.includes('them')) && context.lastProducts && context.lastProducts.length > 0) {
        // Enhance response with actual product data
        let productsInfo = '\n\nProducts you asked about:\n';
        context.lastProducts.forEach((product, index) => {
          productsInfo += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
        });
        
        try {
          const enhancedCompletion = await Promise.race([
            currentOpenAI.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: systemPrompt + productsInfo,
                },
                {
                  role: 'user',
                  content: message,
                },
              ],
              temperature: 0.7,
              max_tokens: 1500,
            }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout')), 20000))
          ]);
          aiResponse = enhancedCompletion?.choices?.[0]?.message?.content || aiResponse;
        } catch (error) {
          console.warn('[Chatbot] Error in enhanced completion for "these/them", using original response:', error);
          // Continue with original aiResponse
        }
      }
      
      // Handle "this" or "it" - refers to lastProduct
      if ((lowerMessage.includes('this') || lowerMessage.includes('it')) && context.lastProduct) {
        const product = context.lastProduct;
        
        // Fetch full details if needed
        if (!product.specs && product.url !== GTECH_BASE_URL) {
          const fullDetails = await fetchProductDetails(product.url);
          if (fullDetails) {
            Object.assign(product, fullDetails);
            context.lastProduct = product;
          }
        }
        
        let productInfo = `\n\nProduct you asked about:\n`;
        productInfo += `Name: ${product.name}\n`;
        productInfo += `Price: ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''}\n`;
        productInfo += `URL: ${product.url}\n`;
        if (product.description) productInfo += `Description: ${product.description}\n`;
        if (product.features) productInfo += `Features: ${product.features.join(', ')}\n`;
        if (product.specs) {
          try {
            productInfo += `Specs: ${JSON.stringify(product.specs)}\n`;
          } catch (e) {
            productInfo += `Specs: ${Object.entries(product.specs).map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
          }
        }
        
        try {
          const enhancedCompletion = await Promise.race([
            currentOpenAI.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: systemPrompt + productInfo,
                },
                {
                  role: 'user',
                  content: message,
                },
              ],
              temperature: 0.7,
              max_tokens: 1500,
            }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout')), 20000))
          ]);
          aiResponse = enhancedCompletion?.choices?.[0]?.message?.content || aiResponse;
        } catch (error) {
          console.warn('[Chatbot] Error in enhanced completion for "this/it", using original response:', error);
          // Continue with original aiResponse
        }
      }

      // If user asks about sales/promotions/offers, update context
      if (lowerMessage.includes('sale') || lowerMessage.includes('promotion') || lowerMessage.includes('discount') || lowerMessage.includes('deal') || lowerMessage.includes('offer')) {
        const saleProducts = websiteData.sales.length > 0 ? websiteData.sales : websiteData.products.filter((p: Product) => p && p.originalPrice);
        if (saleProducts.length > 0) {
          context.lastProducts = saleProducts.slice(0, 10);
        }
      }

      // Products are already searched and added to context above, so we don't need to search again
      
      // Format response with HTML links
      // Include all products (regular + sale products) for link formatting
      const allProductsForLinks = [
        ...(websiteData.products || []),
        ...(websiteData.sales || []),
        ...(websiteData.promotions || [])
      ];
      // Remove duplicates based on URL
      const uniqueProductsForLinks = allProductsForLinks.filter((product, index, self) =>
        index === self.findIndex((p) => p.url === product.url)
      );
      
      let formattedResponse: string;
      try {
        formattedResponse = formatResponseWithLinks(aiResponse, uniqueProductsForLinks);
      } catch (formatError) {
        console.error('[Chatbot] Error formatting response with links:', formatError);
        // Use unformatted response if formatting fails
        formattedResponse = aiResponse || 'I apologize, but I encountered an error formatting the response.';
      }

      // Add assistant response to history
      context.conversationHistory.push({ role: 'assistant', content: formattedResponse });

      return { response: formattedResponse };
      } catch (error) {
      console.error('[Chatbot] OpenAI error:', error instanceof Error ? error.message : String(error));
      console.error('[Chatbot] OpenAI error details:', error);
      // Fallback to intelligent data-based response
    }
    }

    // Fallback: Intelligent response based on live data (no OpenAI)
    try {
      return await generateIntelligentResponse(message, context, websiteData);
    } catch (fallbackError) {
      console.error('[Chatbot] Error in generateIntelligentResponse fallback:', fallbackError);
      // Ultimate fallback - return a safe response
      return {
        response: `I'm here to help! I can assist you with product information, pricing, sales, ordering, and support. All information is fetched live from our website. What would you like to know? Or visit <a href="${GTECH_BASE_URL}" target="_blank">${GTECH_BASE_URL}</a> to browse our full range.`,
      };
    }
  } catch (error) {
    console.error('[Chatbot] Error in processChatMessage:', error);
    console.error('[Chatbot] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[Chatbot] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Chatbot] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Return a helpful error message
    return {
      response: `I apologize, but I encountered an issue processing your request. Please try again or contact our support team at ${SUPPORT_EMAIL} or ${SUPPORT_PHONE} for assistance.`,
    };
  }
}

function formatResponseWithLinks(response: string, products: Product[]): string {
  if (!response || typeof response !== 'string') {
    console.warn('[Chatbot] formatResponseWithLinks: Invalid response input');
    return 'I apologize, but I encountered an error formatting the response.';
  }
  
  let formatted = response;
  
  try {
    // Add links to product mentions
    if (products && Array.isArray(products)) {
      // Sort products by name length (longest first) to match longer names first
      // This prevents shorter product names from matching parts of longer names
      const sortedProducts = [...products].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
      
      sortedProducts.forEach(product => {
        try {
          if (product && product.name && product.url) {
            const escapedName = product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Use word boundaries for exact match, case-insensitive
            const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
            
            // Replace all occurrences, but skip if already inside a link
            // We need to process manually to get the offset
            let result = '';
            let lastIndex = 0;
            let match;
            
            // Reset regex lastIndex
            regex.lastIndex = 0;
            
            while ((match = regex.exec(formatted)) !== null) {
              const matchIndex = match.index;
              const matchText = match[0];
              
              // Add text before the match
              result += formatted.substring(lastIndex, matchIndex);
              
              // Check if this match is already inside an anchor tag
              const textBeforeMatch = formatted.substring(0, matchIndex);
              const lastOpenTag = textBeforeMatch.lastIndexOf('<a');
              const lastCloseTag = textBeforeMatch.lastIndexOf('</a>');
              
              // If there's an open tag after the last close tag, we're inside a link
              if (lastOpenTag > lastCloseTag) {
                // Already inside a link, don't replace
                result += matchText;
              } else {
                // Replace with link
                result += `<a href="${product.url}" target="_blank" rel="noopener noreferrer">${matchText}</a>`;
              }
              
              lastIndex = matchIndex + matchText.length;
            }
            
            // Add remaining text
            result += formatted.substring(lastIndex);
            formatted = result;
          }
        } catch (productError) {
          console.warn('[Chatbot] Error processing product link:', productError);
          // Continue with next product
        }
      });
    }
    
    // Add links to category names
    // IMPORTANT: Process categories to ensure category names get linked even when they appear in phrases
    // Sort categories by name length (longest first) to match longer names first
    // This ensures "power tools" matches before "power" or "tools" individually
    const categoryEntries = Object.entries(CATEGORY_URLS).sort((a, b) => b[0].length - a[0].length);
    
    categoryEntries.forEach(([categoryName, categoryUrl]) => {
      try {
        // Create a regex pattern that matches the category name
        // Handle variations like "Hair Care" vs "Haircare", "Power Tools" vs "Power Tools", etc.
        const escapedName = categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Use word boundaries to match whole words only, case-insensitive
        // This will match "Floorcare" in "Floorcare Accessories" and "Power Tools" in "Power Tools Accessories"
        // The \b ensures we match whole words, not parts of words
        const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
        
        // Collect all matches first to avoid issues with index shifting
        const matches: Array<{index: number; text: string; length: number}> = [];
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(formatted)) !== null) {
          matches.push({ 
            index: match.index, 
            text: match[0],
            length: match[0].length
          });
        }
        
        // Process matches from end to start to preserve indices
        for (let i = matches.length - 1; i >= 0; i--) {
          const matchIndex = matches[i].index;
          const matchText = matches[i].text;
          const matchLength = matches[i].length;
          
          // Check if this match is already inside an anchor tag
          const textBeforeMatch = formatted.substring(0, matchIndex);
          const lastOpenTag = textBeforeMatch.lastIndexOf('<a');
          const lastCloseTag = textBeforeMatch.lastIndexOf('</a>');
          
          // If there's an open tag after the last close tag, we're inside a link - skip it
          if (lastOpenTag > lastCloseTag) {
            continue;
          }
          
          // Not inside a link, replace with link
          const before = formatted.substring(0, matchIndex);
          const after = formatted.substring(matchIndex + matchLength);
          formatted = before + `<a href="${categoryUrl}" target="_blank" rel="noopener noreferrer">${matchText}</a>` + after;
        }
      } catch (categoryError) {
        console.warn('[Chatbot] Error processing category link:', categoryError);
        // Continue with next category
      }
    });
    
    // Add links to common terms and category pages
    formatted = formatted.replace(/Gtech website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">Gtech website</a>`);
    formatted = formatted.replace(/our website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">our website</a>`);
    formatted = formatted.replace(/Track My Order/gi, `<a href="${GTECH_BASE_URL}/track-my-order" target="_blank">Track My Order</a>`);
    
    // Clean up broken markdown links first (e.g., "url](url)" or "url](url)" patterns)
    formatted = formatted.replace(/https?:\/\/[^\s<>"']+\]\(https?:\/\/[^\s<>"']+\)/g, (match) => {
      // Extract just the first URL from broken markdown
      const urlMatch = match.match(/https?:\/\/[^\s<>"']+/);
      return urlMatch ? urlMatch[0] : match;
    });
    
    // Convert ALL plain URLs to clickable links FIRST (before any other processing)
    // This ensures all URLs including category pages are converted
    // Use a robust pattern that captures complete URLs including full paths
    // Pattern: http:// or https:// followed by domain and path (allows hyphens, slashes, dots, etc.)
    // IMPORTANT: Match the complete URL including all path segments - stop only at whitespace, <, >, quotes
    // This pattern ensures we capture URLs like https://www.gtech.co.uk/cordless-vacuum-cleaners/cordless-wet-and-dry-vacuums/orca-hard-floor-cleaner.html completely
    // Pattern matches: https:// or http:// followed by any non-whitespace characters (including /, -, ., etc.)
    // We'll handle trailing punctuation separately
    const urlPattern = /https?:\/\/[^\s<>"']+/g;
    let lastIndex = 0;
    const urlMatches: Array<{ url: string; index: number; replacement: string }> = [];
    let match;
    
    // First pass: collect all URL matches with their positions
    // Reset regex lastIndex to ensure we start from the beginning
    urlPattern.lastIndex = 0;
    while ((match = urlPattern.exec(formatted)) !== null) {
      const url = match[0];
      const matchIndex = match.index;
      
      // Check if URL is already inside a link by examining the text before this match
      const textBeforeUrl = formatted.substring(0, matchIndex);
      const lastOpenTag = textBeforeUrl.lastIndexOf('<a');
      const lastCloseTag = textBeforeUrl.lastIndexOf('</a>');
      
      // If already inside a link, skip
      if (lastOpenTag <= lastCloseTag) {
        // Remove trailing punctuation that shouldn't be part of the URL
        let cleanUrl = url;
        let trailing = '';
        // Remove trailing punctuation including parentheses, periods, commas, etc.
        // CRITICAL: Remove closing parentheses ) that are not part of the URL (causes 404 errors)
        // Only remove punctuation if URL doesn't end with / (which is valid)
        if (!cleanUrl.endsWith('/')) {
          // Check for trailing punctuation: ), ], ., ,, !, ?, ;, :
          const trailingPunctMatch = cleanUrl.match(/^(.+?)([)\].,!?;:]+)$/);
          if (trailingPunctMatch) {
            cleanUrl = trailingPunctMatch[1];
            trailing = trailingPunctMatch[2];
          }
        }
        
        // CRITICAL: Ensure we have the complete URL - the link text MUST be the full URL
        // Verify the URL is complete (especially for category URLs like /cordless-power-tools.html)
        // Escape the URL for HTML attributes
        const escapedUrl = cleanUrl.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        // CRITICAL: Use the full cleanUrl for BOTH href and link text to ensure the entire URL is clickable
        // The link text must match the href exactly to ensure the full URL is clickable
        const replacement = `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
        
        urlMatches.push({ url, index: matchIndex, replacement });
      }
    }
    
    // Second pass: replace URLs from end to start to preserve indices
    for (let i = urlMatches.length - 1; i >= 0; i--) {
      const { url, index, replacement } = urlMatches[i];
      // Use the original matched URL length to ensure we replace the exact portion
      formatted = formatted.substring(0, index) + replacement + formatted.substring(index + url.length);
    }
    
    // Fix any URLs that might have been broken or have incorrect link text
    // Ensure URLs always show the full URL as clickable text
    formatted = formatted.replace(/(<a href="(https?:\/\/[^"]+)"[^>]*>)([^<]+)(<\/a>)/g, (match, openTag, hrefUrl, linkText, closeTag) => {
      // Always use the full URL from href as the link text to ensure the entire URL is clickable
      // This fixes cases where the link text might be truncated or different from the href
      if (linkText !== hrefUrl) {
        return `<a href="${hrefUrl}" target="_blank" rel="noopener noreferrer">${hrefUrl}</a>`;
      }
      return match;
    });
    
    // Final pass: Ensure all URLs have the full URL as clickable text
    // This is a safety check to fix any URLs that might have incorrect link text
    const urlLinkPattern = /<a\s+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
    formatted = formatted.replace(urlLinkPattern, (match, hrefUrl, linkText) => {
      // If link text is different from or shorter than the href URL, use the full URL as link text
      if (linkText !== hrefUrl && linkText.length < hrefUrl.length) {
        const escapedUrl = hrefUrl.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${hrefUrl}</a>`;
      }
      return match;
    });
    
    // Clean up malformed/duplicate URLs (e.g., "https://www.gtech.co.uk/cordless-https://www.gtech.co.uk/...")
    // This fixes cases where URLs get concatenated incorrectly or embedded within each other
    
    // Pattern 1: Fix URLs with embedded category URLs (e.g., "cordless-https://.../cordless-vacuum-cleaners.html-...")
    // Example: "https://www.gtech.co.uk/cordless-https://www.gtech.co.uk/cordless-vacuum-cleaners.html-cleaners/cordless-wet-and-dry-vacuums/orca-hard-floor-cleaner.html"
    formatted = formatted.replace(/https?:\/\/[^\/]+-https?:\/\/[^\/]+\/[^\/]+\.html-[^\s<>"')]+/g, (malformedUrl) => {
      // Extract the domain (should be the same for both URLs)
      const domainMatch = malformedUrl.match(/https?:\/\/([^\/]+)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        // Find the part after ".html-" which contains the rest of the product path
        const htmlSplit = malformedUrl.split('.html-');
        if (htmlSplit.length > 1) {
          // Get the path after .html- and clean it up
          let pathAfterHtml = htmlSplit[1].split(' ')[0].split(')')[0].split('"')[0].split("'")[0].split('<')[0];
          // Remove any leading slashes if present
          pathAfterHtml = pathAfterHtml.replace(/^\/+/, '');
          // Reconstruct the complete URL
          return `https://${domain}/${pathAfterHtml}`;
        }
      }
      // Fallback: extract the longest complete URL
      const urls = malformedUrl.match(/https?:\/\/[^\s<>"')]+/g);
      if (urls && urls.length > 1) {
        // Find the URL with the most path segments (usually the complete product URL)
        return urls.reduce((longest, current) => {
          const currentSegments = current.split('/').length;
          const longestSegments = longest.split('/').length;
          return currentSegments > longestSegments ? current : longest;
        });
      }
      return malformedUrl;
    });
    
    // Pattern 2: URLs embedded in the middle (e.g., "cordless-https://...")
    formatted = formatted.replace(/https?:\/\/[^\/]+-https?:\/\/[^\s<>"')]+/g, (malformedUrl) => {
      const urls = malformedUrl.match(/https?:\/\/[^\s<>"')]+/g);
      if (urls && urls.length > 1) {
        // Find the longest URL with most path segments
        return urls.reduce((longest, current) => {
          const currentSegments = current.split('/').length;
          const longestSegments = longest.split('/').length;
          if (currentSegments > longestSegments || (currentSegments === longestSegments && current.length > longest.length)) {
            return current;
          }
          return longest;
        });
      }
      return malformedUrl;
    });
    
    // Pattern 3: Remove duplicate URLs at the end with closing parentheses
    formatted = formatted.replace(/(https?:\/\/[^\s<>"']+)\s*\(https?:\/\/[^\s<>"')]+\)/g, (match, firstUrl) => {
      return firstUrl;
    });
    
    // Ensure proper line breaks before product numbers (fix cases where URL runs into next product number)
    // Fix pattern like ".html2)" or ".html 2)" or ".html2." or ".html 2." to have proper line breaks
    formatted = formatted.replace(/(\.html)(\d+\))/g, '$1\n\n$2');
    formatted = formatted.replace(/(\.html)\s+(\d+\))/g, '$1\n\n$2');
    formatted = formatted.replace(/(\.html)(\d+\.)/g, '$1\n\n$2');
    formatted = formatted.replace(/(\.html)\s+(\d+\.)/g, '$1\n\n$2');
    // Ensure double line breaks between numbered items (both formats)
    formatted = formatted.replace(/(\d+\)\s+[^\n]+)\n(\d+\))/g, '$1\n\n$2');
    formatted = formatted.replace(/(\d+\.\s+[^\n]+)\n(\d+\.)/g, '$1\n\n$2');
    formatted = formatted.replace(/(\d+\)\s+[^\n]+)\n(\d+\.)/g, '$1\n\n$2');
    formatted = formatted.replace(/(\d+\.\s+[^\n]+)\n(\d+\))/g, '$1\n\n$2');
    
    // Convert line breaks to HTML
    formatted = formatted.replace(/\n/g, '<br/>');
  } catch (error) {
    console.error('[Chatbot] Error in formatResponseWithLinks:', error);
    // Return original response if formatting fails
    return response.replace(/\n/g, '<br/>');
  }
  
  return formatted;
}

async function generateIntelligentResponse(message: string, context: any, websiteData: any): Promise<ChatResponse> {
  const lowerMessage = message.toLowerCase();
  
  // Note: Greetings are handled naturally by the AI based on system prompt instructions
  // No hardcoded responses - let the AI generate appropriate greeting responses
  
  // Handle "these" or "them" - refers to lastProducts
  if ((lowerMessage.includes('these') || lowerMessage.includes('them')) && context.lastProducts && context.lastProducts.length > 0) {
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
      let response = `To order these products:<br/><br/>`;
      
      context.lastProducts.forEach((product: Product, index: number) => {
        response += `<strong>${index + 1}. ${product.name}</strong><br/>`;
        response += `💰 Price: <strong>${product.price}</strong>${product.originalPrice ? ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>` : ''}<br/>`;
        response += `🔗 <a href="${product.url}" target="_blank">View & Order ${product.name}</a><br/><br/>`;
      });
      
      response += `<strong>Ordering Steps:</strong><br/>`;
      response += `1. Click on any product link above to visit the product page<br/>`;
      response += `2. Click "Add to Basket"<br/>`;
      response += `3. You can add multiple products to your basket<br/>`;
      response += `4. Proceed to checkout when ready<br/><br/>`;
      response += `We offer:<br/>• FREE delivery*<br/>• 30-day guarantee<br/>• 2-year warranty<br/><br/>`;
      response += `Need help? Contact us:<br/>📞 ${SUPPORT_PHONE}<br/>📧 ${SUPPORT_EMAIL}`;
      
      return { response };
    }
  }
  
  // Handle "this" or "it" - refers to lastProduct
  if ((lowerMessage.includes('this') || lowerMessage.includes('it')) && context.lastProduct) {
    const product = context.lastProduct;
    
    if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
      return {
        response: `To order <strong>${product.name}</strong>:<br/><br/>1. Visit the product page: <a href="${product.url}" target="_blank">${product.name}</a><br/>2. Click "Add to Basket"<br/>3. Proceed to checkout<br/><br/>Current price: <strong>${product.price}</strong>${product.originalPrice ? ` (was ${product.originalPrice})` : ''}<br/><br/>We offer:<br/>• FREE delivery*<br/>• 30-day guarantee<br/>• 2-year warranty<br/><br/>Need help? Contact us:<br/>📞 ${SUPPORT_PHONE}<br/>📧 ${SUPPORT_EMAIL}`,
      };
    }
  }
  
  // Handle sales/promotions/offers - Show both offers link and newsletter signup link
  if (lowerMessage.includes('sale') || lowerMessage.includes('promotion') || lowerMessage.includes('discount') || lowerMessage.includes('offer')) {
    // Return both the offers page link and newsletter signup link
    return {
      response: `You can view all our current offers here: <a href="https://www.gtech.co.uk/offers.html" target="_blank">https://www.gtech.co.uk/offers.html</a><br/><br/>You can also signup for our newsletter to be the first to know about our exclusive discount and offer: <a href="https://www.gtech.co.uk/newsletter-signup" target="_blank">https://www.gtech.co.uk/newsletter-signup</a>`
    };
  }
  
  // Handle product searches
  let products: Product[] = [];
  try {
    products = await searchProducts(message);
  } catch (error) {
    console.warn('[Chatbot] Error searching products in fallback:', error instanceof Error ? error.message : String(error));
    products = [];
  }
  
  if (products.length > 0) {
    if (products.length === 1) {
      const product = products[0];
      context.lastProduct = product;
      
      // Fetch full details if needed
      if (!product.specs && product.url !== GTECH_BASE_URL) {
        try {
          const fullDetails = await fetchProductDetails(product.url);
          if (fullDetails) {
            Object.assign(product, fullDetails);
          }
        } catch (error) {
          console.warn('[Chatbot] Error fetching product details in fallback:', error instanceof Error ? error.message : String(error));
        }
      }
      
      let response = `<strong>${product.name}</strong><br/><br/>`;
      response += `💰 Price: <strong>${product.price}</strong>${product.originalPrice ? ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>` : ''}<br/><br/>`;
      
      if (product.description) {
        response += `${product.description}<br/><br/>`;
      }
      
      if (product.specs && Object.keys(product.specs).length > 0) {
        response += `<strong>Specifications:</strong><br/>`;
        Object.entries(product.specs).slice(0, 10).forEach(([key, value]) => {
          const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          response += `• <strong>${displayKey}:</strong> ${value}<br/>`;
        });
        response += '<br/>';
      }
      
      if (product.features && product.features.length > 0) {
        response += `<strong>Features:</strong><br/>• ${product.features.slice(0, 10).join('<br/>• ')}<br/><br/>`;
      }
      
      response += `📦 Category: ${product.category}<br/>`;
      response += `🔗 <a href="${product.url}" target="_blank">View Product Page</a><br/>`;
      response += `🛒 <a href="${product.url}" target="_blank">Add to Basket</a><br/><br/>`;
      
      try {
        const related = await getRelatedProducts(product.name);
        if (related.length > 0) {
          response += `<strong>You might also like:</strong><br/>`;
          related.forEach((rel) => {
            response += `• <a href="${rel.url}" target="_blank">${rel.name}</a> (${rel.price})<br/>`;
          });
        }
      } catch (error) {
        console.warn('[Chatbot] Error fetching related products in fallback:', error instanceof Error ? error.message : String(error));
      }
      
      return { response };
    } else {
      context.lastProducts = products.slice(0, 10);
      
      let response = `I found ${products.length} products matching your query:<br/><br/>`;
      products.slice(0, 5).forEach((product) => {
        response += `<strong>${product.name}</strong><br/>`;
        response += `💰 Price: ${product.price}${product.originalPrice ? ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>` : ''}<br/>`;
        response += `🔗 <a href="${product.url}" target="_blank">View Product</a><br/><br/>`;
      });
      
      if (products.length > 5) {
        response += `...and ${products.length - 5} more products. Visit <a href="${GTECH_BASE_URL}" target="_blank">our website</a> to see all products.`;
      }
      
      return { response };
    }
  }
  
  // Default: Use AI to generate response
  return {
    response: `I'm here to help! I can assist you with product information, pricing, sales, ordering, and support. All information is fetched live from our website. What would you like to know? Or visit <a href="${GTECH_BASE_URL}" target="_blank">${GTECH_BASE_URL}</a> to browse our full range.`,
  };
}

/**
 * Handle problem selection and provide specific troubleshooting
 */
async function handleProblemSelection(
  action: string,
  context: any,
  websiteData: any
): Promise<ChatResponse> {
  // Check if product is a hairdryer or hairstraightener (products without batteries)
  const modelLower = context.productModelNumber?.toLowerCase() || '';
  const productName = context.lastProduct?.name?.toLowerCase() || '';
  const productCategory = context.lastProduct?.category?.toLowerCase() || '';
  const isHairCareProduct = modelLower.includes('dryonic') || 
                            modelLower.includes('styleonic') || 
                            modelLower.includes('hair') || 
                            modelLower.includes('dryer') || 
                            modelLower.includes('straightener') ||
                            productName.includes('hair') ||
                            productName.includes('dryer') ||
                            productName.includes('straightener') ||
                            productCategory.includes('hair');

  const troubleshootingGuides: Record<string, string> = {
    troubleshoot_power: isHairCareProduct ? `Here are steps to troubleshoot power issues:

1. **Check the Power Source**
   • Ensure the device is properly plugged in
   • Try a different power outlet
   • Check if the power button is fully engaged
   • Inspect the power cord for any damage

2. **Reset the Device**
   • Turn off and unplug for 30 seconds
   • Plug back in and try again

3. **Still Not Working?**
   • Contact our support team for further assistance
   • 📞 Phone: ${SUPPORT_PHONE}
   • 📧 Email: ${SUPPORT_EMAIL}` : `Here are steps to troubleshoot power issues:

1. **Check the Power Source**
   • Ensure the device is properly plugged in or the battery is charged
   • Try a different power outlet or charging cable
   • Check if the power button is fully engaged

2. **Battery Check**
   • If battery-powered, ensure it's fully charged
   • Try removing and reinserting the battery
   • Check for any visible damage to the battery

3. **Reset the Device**
   • Turn off and unplug for 30 seconds
   • Plug back in and try again

4. **Still Not Working?**
   • Contact our support team for further assistance
   • 📞 Phone: ${SUPPORT_PHONE}
   • 📧 Email: ${SUPPORT_EMAIL}`,

    troubleshoot_charging: `Here's how to fix charging problems:

1. **Check the Charger**
   • Ensure you're using the original charger
   • Check the charger cable for damage
   • Try a different power outlet

2. **Charging Port**
   • Clean the charging port gently with a dry cloth
   • Ensure no debris is blocking the port
   • Check for any visible damage

3. **Battery Issues**
   • Remove and reinsert the battery
   • Let the device charge for at least 2 hours
   • If battery is old, it may need replacement

4. **Still Having Issues?**
   • Contact support: ${SUPPORT_PHONE} or ${SUPPORT_EMAIL}`,

    troubleshoot_mechanical: `Mechanical issues troubleshooting:

1. **Check for Blockages**
   • Turn off and unplug the device
   • Remove any visible blockages carefully
   • Check cutting blades/mechanisms for damage

2. **Lubrication**
   • Some mechanical parts may need lubrication
   • Refer to your user manual for specific guidance
   • Use only recommended lubricants

3. **Wear and Tear**
   • Check for worn-out parts
   • Blades may need sharpening or replacement
   • Contact support for replacement parts

4. **Need More Help?**
   • 📞 ${SUPPORT_PHONE}
   • 📧 ${SUPPORT_EMAIL}
   • Visit: ${GTECH_BASE_URL} for parts and service`,

    troubleshoot_battery: `Battery troubleshooting steps:

1. **Battery Life**
   • Charge fully before first use (may take 4-6 hours)
   • Avoid leaving battery completely drained
   • Store in a cool, dry place

2. **Charging Habits**
   • Don't overcharge (unplug when full)
   • Use only the original charger
   • Charge at room temperature

3. **Battery Replacement**
   • If battery is over 2 years old, consider replacement
   • Check warranty status
   • Contact support for battery replacement options

4. **Support**
   • 📞 ${SUPPORT_PHONE}
   • 📧 ${SUPPORT_EMAIL}`,

    troubleshoot_blockage: `How to clear blockages:

1. **Safety First**
   • Turn off and unplug the device
   • Wait for moving parts to stop completely

2. **Clear Blockages**
   • Remove any visible debris
   • Use a soft brush or cloth
   • Never use sharp objects

3. **Check Components**
   • Inspect cutting mechanisms
   • Ensure all parts are properly assembled
   • Check for damage

4. **Prevention**
   • Clean regularly after use
   • Avoid using on wet surfaces (if applicable)
   • Follow maintenance schedule

5. **Still Blocked?**
   • Contact support: ${SUPPORT_PHONE}`,

    troubleshoot_other: `For other issues, here's how we can help:

1. **Describe the Problem**
   • What exactly is happening?
   • When did it start?
   • Any error messages or unusual sounds?

2. **Quick Checks**
   • Review the user manual
   • Check our FAQ section online
   • Look for similar issues in support forums

3. **Get Support**
   • 📞 Call us: ${SUPPORT_PHONE}
   • 📧 Email: ${SUPPORT_EMAIL}
   • 🌐 Visit: ${GTECH_BASE_URL}/support

4. **Warranty**
   • Check if your product is under warranty
   • We offer 2-year warranty on most products
   • 30-day money-back guarantee

Our support team is here to help!`,
  };

  const guide = troubleshootingGuides[action] || troubleshootingGuides.troubleshoot_other;

  // Add to conversation history
  context.conversationHistory.push({ 
    role: 'assistant', 
    content: guide 
  });

  return {
    response: guide,
  };
}