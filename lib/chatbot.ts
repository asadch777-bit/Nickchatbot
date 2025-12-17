import { 
  searchProducts, 
  getProductByName, 
  getRelatedProducts, 
  getComprehensiveWebsiteData,
  fetchGtechProducts,
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

// Initialize on module load if key is available
const initialApiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY;
if (initialApiKey) {
  try {
    openai = new OpenAI({ apiKey: initialApiKey });
    console.log('[Chatbot] OpenAI client initialized on module load');
  } catch (error) {
    console.error('[Chatbot] Error initializing OpenAI client on module load:', error);
  }
} else {
  console.warn('[Chatbot] No OpenAI API key found on module load. Will initialize when key becomes available.');
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
    console.log('[Chatbot] Processing message:', message.substring(0, 50));
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
    
    console.log('Message:', message, '| isProblemReport:', isProblemReport); // Debug log

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
    
    console.log('Not a problem report or action - continuing to AI response'); // Debug log

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
    
    // RAG DISABLED - Initialize RAG on first use (this will extract problem options from CSV)
    // Make RAG initialization non-blocking - don't fail if it errors
    // RAG is currently disabled
    /*
    try {
      await Promise.race([
        initializeRAG(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RAG initialization timeout')), 5000))
      ]).catch((error) => {
        console.warn('[Chatbot] RAG initialization failed or timed out (non-fatal):', error instanceof Error ? error.message : String(error));
      });
    } catch (error) {
      console.warn('[Chatbot] Error initializing RAG (non-fatal):', error instanceof Error ? error.message : String(error));
    }
    */
    console.log('[Chatbot] RAG is disabled');
    
    // Search for products FIRST so we can include them in the context
    let searchedProducts: Product[] = [];
    try {
      searchedProducts = await Promise.race([
        searchProducts(message),
        new Promise<Product[]>((resolve) => setTimeout(() => resolve([]), 5000))
      ]) as Product[];
      if (searchedProducts.length > 0) {
        console.log('[Chatbot] Found products from search:', searchedProducts.length);
        searchedProducts.forEach((p, i) => {
          console.log(`[Chatbot] Product ${i + 1}: ${p.name} - Price: ${p.price}`);
        });
        if (searchedProducts.length === 1) {
          context.lastProduct = searchedProducts[0];
        } else {
          context.lastProducts = searchedProducts.slice(0, 10);
        }
      } else {
        console.log('[Chatbot] No products found for query:', message);
      }
    } catch (error) {
      console.warn('[Chatbot] Error searching products (non-fatal):', error instanceof Error ? error.message : String(error));
    }

    // RAG DISABLED - Get RAG context for the query (especially for product queries)
    // Make this non-blocking as well
    // RAG is currently disabled
    let ragContext = '';
    /*
    try {
      ragContext = await Promise.race([
        getRAGContext(message),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 3000))
      ]) as string;
      if (ragContext) {
        console.log('[Chatbot] Retrieved RAG context for query:', ragContext.substring(0, 200));
      }
    } catch (error) {
      console.warn('[Chatbot] Error retrieving RAG context (non-fatal):', error instanceof Error ? error.message : String(error));
    }
    */
    console.log('[Chatbot] RAG context retrieval is disabled');
    
    // Search knowledge base for relevant information
    let knowledgeResults: any[] = [];
    try {
      knowledgeResults = searchKnowledge(message, 5);
      if (knowledgeResults.length > 0) {
        console.log('[Chatbot] Found knowledge base results:', knowledgeResults.length);
      }
    } catch (error) {
      console.warn('[Chatbot] Error searching knowledge base (non-fatal):', error instanceof Error ? error.message : String(error));
    }
    
    // Build comprehensive context for AI
    let contextInfo = '';
    
    // Add knowledge base information if found
    if (knowledgeResults.length > 0) {
      contextInfo += `\n--- Knowledge Base Information ---\n`;
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
    }
    
    // Add found products information to context
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
    
    // RAG DISABLED - Add RAG context if available (this contains product information from CSV)
    // RAG is currently disabled
    // if (ragContext) {
    //   contextInfo += `\n--- Product Information from Database (RAG) ---\n${ragContext}\n--- End of RAG Context ---\n\n`;
    // }
    
    // Add sales information
    contextInfo += `Current Sales Status:\n`;
    contextInfo += `- Has Sales: ${websiteData.hasSales}\n`;
    contextInfo += `- Has Black Friday: ${websiteData.hasBlackFriday}\n`;
    contextInfo += `- Total Sale Products: ${websiteData.sales.length}\n`;
    contextInfo += `- Total Black Friday Products: ${websiteData.blackFriday.length}\n`;
    contextInfo += `- Total Promotional Products: ${websiteData.promotions.length}\n\n`;
    
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
    console.log('[Chatbot] Has OpenAI API Key:', hasOpenAIKey, 'Client initialized:', !!currentOpenAI);
    
    if (hasOpenAIKey && currentOpenAI) {
    try {
      // Build product list for AI (limit to prevent prompt from being too large)
      let productList = '';
      if (websiteData.products && websiteData.products.length > 0) {
        productList = '\n\nAvailable Products:\n';
        // Limit to 30 products to keep prompt size manageable
        const maxProducts = 30;
        websiteData.products.slice(0, maxProducts).forEach((product: Product, index: number) => {
          const name = (product.name || '').substring(0, 100); // Limit product name length
          const price = product.price || 'Check website';
          productList += `${index + 1}. ${name} - ${price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''}\n`;
        });
        if (websiteData.products.length > maxProducts) {
          productList += `...and ${websiteData.products.length - maxProducts} more products\n`;
        }
      }

      const systemPrompt = `You are NICK, an intelligent Gtech product assistant. You help customers with product information, pricing, ordering, and support.

CRITICAL RULES:
1. NEVER use predefined responses - ALWAYS generate responses based on the live data provided
2. **ALWAYS INCLUDE PRICES**: When a user asks about a product price or asks "what's the price of [product]", you MUST include the exact price from the product data provided. NEVER say "I can't provide the price" or "check the website" - the price is in the data, always include it.
3. **ALWAYS INCLUDE SPECIFICATIONS**: When a user asks about product specifications, specs, or features (e.g., "specifications of GT50" or "what are the specs"), you MUST include ALL specifications from the product data provided. If "SPECIFICATIONS:" is listed in the product data above, you MUST include them in your response. NEVER say "I don't have specifications" if specs are listed in the product data - they are there, always include them.
4. **USE KNOWLEDGE BASE**: If "Knowledge Base Information" is provided above, use that information to answer questions. The knowledge base contains authoritative information about products, troubleshooting, FAQs, and support. Prioritize knowledge base information when available.
4. Understand context perfectly:
   • "this" or "it" = refers to lastProduct (single product)
   • "these" or "them" = refers to lastProducts (multiple products shown)
   • If user asks "how to order these?", provide ordering steps for ALL products in lastProducts
4. Always use live data from the website - prices, products, promotions are all fetched in real-time
5. Be conversational and helpful - answer questions naturally based on the data provided
6. If user asks about ordering multiple products, explain how to order each one
7. IMPORTANT: If hasSales is true, there ARE sales going on. If hasBlackFriday is true, there IS a Black Friday sale. Always check these flags first before saying "no sales"
8. If user asks "are there any sales?" or "is there a sale going on?", check hasSales flag and respond accordingly with actual sale products
8. **Troubleshooting Help**: When a user reports a problem with a product:
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

      // Add timeout protection for OpenAI API calls (Vercel has function timeouts)
      if (!currentOpenAI) {
        throw new Error('OpenAI client not initialized');
      }
      
      console.log('[Chatbot] Calling OpenAI API with system prompt length:', systemPrompt.length);
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
        console.log('[Chatbot] OpenAI API call successful');
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
      console.log('[Chatbot] OpenAI response received, length:', aiResponse.length);

      // If user asks about products, ensure we have the data
      const lowerMessage = message.toLowerCase();
      
      // Handle "these" or "them" - refers to lastProducts
      if ((lowerMessage.includes('these') || lowerMessage.includes('them')) && context.lastProducts && context.lastProducts.length > 0) {
        // Enhance response with actual product data
        let productsInfo = '\n\nProducts you asked about:\n';
        context.lastProducts.forEach((product, index) => {
          productsInfo += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
        });

        if (!currentOpenAI) {
          throw new Error('OpenAI client not initialized');
        }
        
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

        if (!currentOpenAI) {
          throw new Error('OpenAI client not initialized');
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

      // If user asks about sales/promotions, update context
      if (lowerMessage.includes('sale') || lowerMessage.includes('promotion') || lowerMessage.includes('discount') || lowerMessage.includes('deal')) {
        const saleProducts = websiteData.sales.length > 0 ? websiteData.sales : websiteData.products.filter((p: Product) => p && p.originalPrice);
        if (saleProducts.length > 0) {
          context.lastProducts = saleProducts.slice(0, 10);
        }
      }

      // Products are already searched and added to context above, so we don't need to search again
      
      // Format response with HTML links
      let formattedResponse: string;
      try {
        formattedResponse = formatResponseWithLinks(aiResponse, websiteData.products || []);
        console.log('[Chatbot] Response formatted successfully, length:', formattedResponse.length);
      } catch (formatError) {
        console.error('[Chatbot] Error formatting response with links:', formatError);
        // Use unformatted response if formatting fails
        formattedResponse = aiResponse || 'I apologize, but I encountered an error formatting the response.';
      }

      // Add assistant response to history
      context.conversationHistory.push({ role: 'assistant', content: formattedResponse });

      console.log('[Chatbot] Returning response, length:', formattedResponse.length);
      return { response: formattedResponse };
      } catch (error) {
      console.error('[Chatbot] OpenAI error:', error instanceof Error ? error.message : String(error));
      console.error('[Chatbot] OpenAI error details:', error);
      // Fallback to intelligent data-based response
    }
    } else {
      console.log('[Chatbot] No OpenAI API key, using fallback response');
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
      products.forEach(product => {
        try {
          if (product && product.name && product.url) {
            const escapedName = product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
            formatted = formatted.replace(regex, (match) => {
              return `<a href="${product.url}" target="_blank">${match}</a>`;
            });
          }
        } catch (productError) {
          console.warn('[Chatbot] Error processing product link:', productError);
          // Continue with next product
        }
      });
    }
    
    // Add links to common terms
    formatted = formatted.replace(/Gtech website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">Gtech website</a>`);
    formatted = formatted.replace(/our website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">our website</a>`);
    formatted = formatted.replace(/Track My Order/gi, `<a href="${GTECH_BASE_URL}/track-my-order" target="_blank">Track My Order</a>`);
    
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
  
  // Handle sales/promotions
  if (lowerMessage.includes('sale') || lowerMessage.includes('promotion') || lowerMessage.includes('discount')) {
    const saleProducts = websiteData.sales.length > 0 ? websiteData.sales : websiteData.products.filter((p: Product) => p.originalPrice);
    
    if (saleProducts.length > 0) {
      context.lastProducts = saleProducts.slice(0, 10);
      
      let response = `<strong>Yes! We have ${saleProducts.length} products on sale right now:</strong><br/><br/>`;
      
      saleProducts.slice(0, 10).forEach((product: Product) => {
        response += `<strong>${product.name}</strong><br/>`;
        response += `💰 Price: <strong>${product.price}</strong>`;
        if (product.originalPrice) {
          response += ` <span style="text-decoration: line-through; color: #999;">was ${product.originalPrice}</span>`;
        }
        response += `<br/>🔗 <a href="${product.url}" target="_blank">View Product</a><br/><br/>`;
      });
      
      if (saleProducts.length > 10) {
        response += `...and ${saleProducts.length - 10} more products on sale!<br/><br/>`;
      }
      
      response += `Visit <a href="${GTECH_BASE_URL}" target="_blank">${GTECH_BASE_URL}</a> to see all sale products.`;
      
      return { response };
    }
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
