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
import { initializeRAG, getRAGContext, getProblemOptions } from './rag';

// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;
const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY;
if (apiKey) {
  try {
    openai = new OpenAI({ apiKey });
    console.log('[Chatbot] OpenAI client initialized');
  } catch (error) {
    console.error('[Chatbot] Error initializing OpenAI client:', error);
  }
} else {
  console.warn('[Chatbot] No OpenAI API key found. Chatbot will use fallback responses.');
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

    // If it's a problem report (and not an action selection), show interactive options
    if (isProblemReport && !message.startsWith('action:')) {
      console.log('PROBLEM DETECTED - Returning options immediately'); // Debug log
      context.problemOptionsShown = true;
      
      try {
        // Ensure RAG is initialized to get problem options from CSV
        try {
          await initializeRAG();
        } catch (ragError) {
          console.error('Error initializing RAG (non-fatal):', ragError);
          // Continue anyway - getProblemOptions has fallback defaults
        }
        
        // Get problem options from RAG data (CSV file)
        let options: Array<{ label: string; value: string; action: string }> = [];
        try {
          options = getProblemOptions();
          // Ensure we have at least some options
          if (!options || options.length === 0) {
            console.warn('No options from getProblemOptions, using defaults');
            options = [
              { label: "🔌 Not turning on / Power issue", value: "power issue", action: "troubleshoot_power" },
              { label: "⚡ Charging problem", value: "charging problem", action: "troubleshoot_charging" },
              { label: "🔧 Mechanical issue / Not cutting properly", value: "mechanical issue", action: "troubleshoot_mechanical" },
              { label: "🔋 Battery not holding charge", value: "battery issue", action: "troubleshoot_battery" },
              { label: "🧹 Blockage or jammed", value: "blockage", action: "troubleshoot_blockage" },
              { label: "📱 Other problem", value: "other problem", action: "troubleshoot_other" }
            ];
          }
        } catch (optionsError) {
          console.error('Error getting problem options:', optionsError);
          // Use hardcoded defaults
          options = [
            { label: "🔌 Not turning on / Power issue", value: "power issue", action: "troubleshoot_power" },
            { label: "⚡ Charging problem", value: "charging problem", action: "troubleshoot_charging" },
            { label: "🔧 Mechanical issue / Not cutting properly", value: "mechanical issue", action: "troubleshoot_mechanical" },
            { label: "🔋 Battery not holding charge", value: "battery issue", action: "troubleshoot_battery" },
            { label: "🧹 Blockage or jammed", value: "blockage", action: "troubleshoot_blockage" },
            { label: "📱 Other problem", value: "other problem", action: "troubleshoot_other" }
          ];
        }
        
        console.log('Problem detected - showing options:', options.length, 'options'); // Debug log
        
        const response: ChatResponse = {
          response: "I'm sorry to hear that you're experiencing an issue. Please choose an option from below what problem you are facing:",
          showOptions: true,
          options: options
        };
        
        console.log('Returning response with options:', response.options?.length); // Debug log
        return response;
      } catch (error) {
        console.error('Unexpected error in problem detection:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
        // Last resort fallback
        const fallbackOptions = [
          { label: "🔌 Not turning on / Power issue", value: "power issue", action: "troubleshoot_power" },
          { label: "⚡ Charging problem", value: "charging problem", action: "troubleshoot_charging" },
          { label: "🔧 Mechanical issue / Not cutting properly", value: "mechanical issue", action: "troubleshoot_mechanical" },
          { label: "🔋 Battery not holding charge", value: "battery issue", action: "troubleshoot_battery" },
          { label: "🧹 Blockage or jammed", value: "blockage", action: "troubleshoot_blockage" },
          { label: "📱 Other problem", value: "other problem", action: "troubleshoot_other" }
        ];
        const response: ChatResponse = {
          response: "I'm sorry to hear that you're experiencing an issue. Please choose an option from below what problem you are facing:",
          showOptions: true,
          options: fallbackOptions
        };
        console.log('Returning fallback response with options:', response.options?.length); // Debug log
        return response;
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
    
    // Initialize RAG on first use (this will extract problem options from CSV)
    // Make RAG initialization non-blocking - don't fail if it errors
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
    
    // Get RAG context for the query (especially for product queries)
    // Make this non-blocking as well
    let ragContext = '';
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
    
    // Build comprehensive context for AI
    let contextInfo = '';
    
    // Add RAG context if available (this contains product information from CSV)
    if (ragContext) {
      contextInfo += `\n--- Product Information from Database (RAG) ---\n${ragContext}\n--- End of RAG Context ---\n\n`;
    }
    
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
    const hasOpenAIKey = !!openai && !!(process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY);
    console.log('[Chatbot] Has OpenAI API Key:', hasOpenAIKey);
    
    if (hasOpenAIKey && openai) {
    try {
      // Build product list for AI
      let productList = '';
      if (websiteData.products && websiteData.products.length > 0) {
        productList = '\n\nAvailable Products:\n';
        websiteData.products.slice(0, 50).forEach((product: Product, index: number) => {
          productList += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
        });
        if (websiteData.products.length > 50) {
          productList += `...and ${websiteData.products.length - 50} more products\n`;
        }
      }

      const systemPrompt = `You are NICK, an intelligent Gtech product assistant. You help customers with product information, pricing, ordering, and support.

CRITICAL RULES:
1. NEVER use predefined responses - ALWAYS generate responses based on the live data provided
2. Understand context perfectly:
   - "this" or "it" = refers to lastProduct (single product)
   - "these" or "them" = refers to lastProducts (multiple products shown)
   - If user asks "how to order these?", provide ordering steps for ALL products in lastProducts
3. Always use live data from the website - prices, products, promotions are all fetched in real-time
4. Be conversational and helpful - answer questions naturally based on the data provided
5. If user asks about ordering multiple products, explain how to order each one
6. IMPORTANT: If hasSales is true, there ARE sales going on. If hasBlackFriday is true, there IS a Black Friday sale. Always check these flags first before saying "no sales"
7. If user asks "are there any sales?" or "is there a sale going on?", check hasSales flag and respond accordingly with actual sale products
8. **CRITICAL: RAG Context Priority** - The RAG context (Product Information from Database section) contains authoritative product information from Products.csv. If RAG context is provided:
   - ALWAYS use this information to answer product questions, even if the product is not in the "Available Products" list
   - The RAG context contains detailed product specifications, features, FAQs, and troubleshooting information
   - If a user asks about a product that appears in RAG context (e.g., "HT50", "LHT50", "GT50"), you MUST use that information to respond
   - DO NOT say the product is not available if it appears in the RAG context - instead, provide the information from RAG context
9. Combine RAG knowledge with live website data when discussing products, prices, or availability
10. If the user reports a problem with a product (e.g., "my HT50 is not working"), use the RAG context to provide relevant troubleshooting information from the product database
11. If RAG context shows product information but the product isn't in the live website data, still provide the information from RAG and note that live pricing/availability should be checked on the website

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

Generate a helpful, intelligent response based on the user's query and the live data. Understand context perfectly - if user says "these", refer to the lastProducts list.`;

      // Add timeout protection for OpenAI API calls (Vercel has function timeouts)
      if (!openai) {
        throw new Error('OpenAI client not initialized');
      }
      
      const completion = await Promise.race([
        openai.chat.completions.create({
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

      let aiResponse = completion.choices[0]?.message?.content || '';

      // If user asks about products, ensure we have the data
      const lowerMessage = message.toLowerCase();
      
      // Handle "these" or "them" - refers to lastProducts
      if ((lowerMessage.includes('these') || lowerMessage.includes('them')) && context.lastProducts && context.lastProducts.length > 0) {
        // Enhance response with actual product data
        let productsInfo = '\n\nProducts you asked about:\n';
        context.lastProducts.forEach((product, index) => {
          productsInfo += `${index + 1}. ${product.name} - ${product.price}${product.originalPrice ? ` (was ${product.originalPrice})` : ''} - ${product.url}\n`;
        });

        if (!openai) {
          throw new Error('OpenAI client not initialized');
        }
        
        const enhancedCompletion = await openai.chat.completions.create({
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
        });

        aiResponse = enhancedCompletion.choices[0]?.message?.content || aiResponse;
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

        if (!openai) {
          throw new Error('OpenAI client not initialized');
        }
        
        const enhancedCompletion = await openai.chat.completions.create({
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
        });

        aiResponse = enhancedCompletion.choices[0]?.message?.content || aiResponse;
      }

      // If user asks about sales/promotions, update context
      if (lowerMessage.includes('sale') || lowerMessage.includes('promotion') || lowerMessage.includes('discount') || lowerMessage.includes('deal')) {
        const saleProducts = websiteData.sales.length > 0 ? websiteData.sales : websiteData.products.filter((p: Product) => p && p.originalPrice);
        if (saleProducts.length > 0) {
          context.lastProducts = saleProducts.slice(0, 10);
        }
      }

      // If user searches for products, update context
      const products = await searchProducts(message);
      if (products.length > 0) {
        if (products.length === 1) {
          context.lastProduct = products[0];
        } else {
          context.lastProducts = products.slice(0, 10);
        }
      }

      // Format response with HTML links
      const formattedResponse = formatResponseWithLinks(aiResponse, websiteData.products);

      // Add assistant response to history
      context.conversationHistory.push({ role: 'assistant', content: formattedResponse });

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
    return await generateIntelligentResponse(message, context, websiteData);
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
  let formatted = response;
  
  // Add links to product mentions
  products.forEach(product => {
    const regex = new RegExp(`\\b${product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    formatted = formatted.replace(regex, (match) => {
      return `<a href="${product.url}" target="_blank">${match}</a>`;
    });
  });
  
  // Add links to common terms
  formatted = formatted.replace(/Gtech website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">Gtech website</a>`);
  formatted = formatted.replace(/our website/gi, `<a href="${GTECH_BASE_URL}" target="_blank">our website</a>`);
  formatted = formatted.replace(/Track My Order/gi, `<a href="${GTECH_BASE_URL}/track-my-order" target="_blank">Track My Order</a>`);
  
  // Convert line breaks to HTML
  formatted = formatted.replace(/\n/g, '<br/>');
  
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
  const products = await searchProducts(message);
  if (products.length > 0) {
    if (products.length === 1) {
      const product = products[0];
      context.lastProduct = product;
      
      // Fetch full details if needed
      if (!product.specs && product.url !== GTECH_BASE_URL) {
        const fullDetails = await fetchProductDetails(product.url);
        if (fullDetails) {
          Object.assign(product, fullDetails);
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
      
      const related = await getRelatedProducts(product.name);
      if (related.length > 0) {
        response += `<strong>You might also like:</strong><br/>`;
        related.forEach((rel) => {
          response += `• <a href="${rel.url}" target="_blank">${rel.name}</a> (${rel.price})<br/>`;
        });
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
  const troubleshootingGuides: Record<string, string> = {
    troubleshoot_power: `Here are steps to troubleshoot power issues:

1. **Check the Power Source**
   - Ensure the device is properly plugged in or the battery is charged
   - Try a different power outlet or charging cable
   - Check if the power button is fully engaged

2. **Battery Check**
   - If battery-powered, ensure it's fully charged
   - Try removing and reinserting the battery
   - Check for any visible damage to the battery

3. **Reset the Device**
   - Turn off and unplug for 30 seconds
   - Plug back in and try again

4. **Still Not Working?**
   - Contact our support team for further assistance
   - 📞 Phone: ${SUPPORT_PHONE}
   - 📧 Email: ${SUPPORT_EMAIL}`,

    troubleshoot_charging: `Here's how to fix charging problems:

1. **Check the Charger**
   - Ensure you're using the original charger
   - Check the charger cable for damage
   - Try a different power outlet

2. **Charging Port**
   - Clean the charging port gently with a dry cloth
   - Ensure no debris is blocking the port
   - Check for any visible damage

3. **Battery Issues**
   - Remove and reinsert the battery
   - Let the device charge for at least 2 hours
   - If battery is old, it may need replacement

4. **Still Having Issues?**
   - Contact support: ${SUPPORT_PHONE} or ${SUPPORT_EMAIL}`,

    troubleshoot_mechanical: `Mechanical issues troubleshooting:

1. **Check for Blockages**
   - Turn off and unplug the device
   - Remove any visible blockages carefully
   - Check cutting blades/mechanisms for damage

2. **Lubrication**
   - Some mechanical parts may need lubrication
   - Refer to your user manual for specific guidance
   - Use only recommended lubricants

3. **Wear and Tear**
   - Check for worn-out parts
   - Blades may need sharpening or replacement
   - Contact support for replacement parts

4. **Need More Help?**
   - 📞 ${SUPPORT_PHONE}
   - 📧 ${SUPPORT_EMAIL}
   - Visit: ${GTECH_BASE_URL} for parts and service`,

    troubleshoot_battery: `Battery troubleshooting steps:

1. **Battery Life**
   - Charge fully before first use (may take 4-6 hours)
   - Avoid leaving battery completely drained
   - Store in a cool, dry place

2. **Charging Habits**
   - Don't overcharge (unplug when full)
   - Use only the original charger
   - Charge at room temperature

3. **Battery Replacement**
   - If battery is over 2 years old, consider replacement
   - Check warranty status
   - Contact support for battery replacement options

4. **Support**
   - 📞 ${SUPPORT_PHONE}
   - 📧 ${SUPPORT_EMAIL}`,

    troubleshoot_blockage: `How to clear blockages:

1. **Safety First**
   - Turn off and unplug the device
   - Wait for moving parts to stop completely

2. **Clear Blockages**
   - Remove any visible debris
   - Use a soft brush or cloth
   - Never use sharp objects

3. **Check Components**
   - Inspect cutting mechanisms
   - Ensure all parts are properly assembled
   - Check for damage

4. **Prevention**
   - Clean regularly after use
   - Avoid using on wet surfaces (if applicable)
   - Follow maintenance schedule

5. **Still Blocked?**
   - Contact support: ${SUPPORT_PHONE}`,

    troubleshoot_other: `For other issues, here's how we can help:

1. **Describe the Problem**
   - What exactly is happening?
   - When did it start?
   - Any error messages or unusual sounds?

2. **Quick Checks**
   - Review the user manual
   - Check our FAQ section online
   - Look for similar issues in support forums

3. **Get Support**
   - 📞 Call us: ${SUPPORT_PHONE}
   - 📧 Email: ${SUPPORT_EMAIL}
   - 🌐 Visit: ${GTECH_BASE_URL}/support

4. **Warranty**
   - Check if your product is under warranty
   - We offer 2-year warranty on most products
   - 30-day money-back guarantee

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
