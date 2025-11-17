import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY || '',
});

export interface QueryIntent {
  intent: 'product_search' | 'promotion' | 'sale' | 'black_friday' | 'category' | 'price' | 'feature' | 'spec' | 'order' | 'warranty' | 'return' | 'delivery' | 'contact' | 'general';
  productName?: string;
  category?: string;
  keywords?: string[];
  confidence: number;
}

export async function understandQuery(query: string): Promise<QueryIntent> {
  // If no API key, use simple keyword matching
  if (!process.env.OPENAI_API_KEY && !process.env.OPEN_AI_KEY) {
    return simpleQueryUnderstanding(query);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a query understanding system for a Gtech product chatbot. Analyze user queries and determine:
1. Intent: product_search, promotion, sale, black_friday, category, price, feature, spec, order, warranty, return, delivery, contact, or general
2. Product name if mentioned
3. Category if mentioned
4. Keywords extracted
5. Confidence level (0-1)

Respond in JSON format only.`,
        },
        {
          role: 'user',
          content: `Analyze this query: "${query}"`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 200,
    });

    const response = completion.choices[0]?.message?.content;
    if (response) {
      const parsed = JSON.parse(response);
      return {
        intent: parsed.intent || 'general',
        productName: parsed.productName,
        category: parsed.category,
        keywords: parsed.keywords || [],
        confidence: parsed.confidence || 0.5,
      };
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
  }

  // Fallback to simple understanding
  return simpleQueryUnderstanding(query);
}

function simpleQueryUnderstanding(query: string): QueryIntent {
  const lowerQuery = query.toLowerCase();
  
  // Check for promotion/sale intents
  if (lowerQuery.includes('promotion') || lowerQuery.includes('promo') || lowerQuery.includes('promotional')) {
    return {
      intent: 'promotion',
      keywords: ['promotion', 'promo'],
      confidence: 0.9,
    };
  }
  
  if (lowerQuery.includes('sale') || lowerQuery.includes('discount') || lowerQuery.includes('deal')) {
    return {
      intent: 'sale',
      keywords: ['sale', 'discount', 'deal'],
      confidence: 0.9,
    };
  }
  
  if (lowerQuery.includes('black friday') || lowerQuery.includes('blackfriday')) {
    return {
      intent: 'black_friday',
      keywords: ['black friday'],
      confidence: 0.95,
    };
  }
  
  // Check for product search
  const productKeywords = ['airram', 'orca', 'koala', 'penguin', 'dryonic', 'styleonic', 'combi drill', 'lawnmower', 'hedge trimmer', 'grass trimmer', 'vacuum', 'drill', 'mower', 'cleaner'];
  const foundProduct = productKeywords.find(keyword => lowerQuery.includes(keyword));
  
  if (foundProduct || lowerQuery.includes('product') || lowerQuery.includes('price') || lowerQuery.includes('spec') || lowerQuery.includes('feature')) {
    return {
      intent: 'product_search',
      productName: foundProduct,
      keywords: [foundProduct || 'product'],
      confidence: 0.8,
    };
  }
  
  // Check for category
  const categories = ['floorcare', 'power tools', 'garden tools', 'hair care', 'vacuum', 'drill', 'mower', 'trimmer'];
  const foundCategory = categories.find(cat => lowerQuery.includes(cat));
  
  if (foundCategory) {
    return {
      intent: 'category',
      category: foundCategory,
      keywords: [foundCategory],
      confidence: 0.8,
    };
  }
  
  // Check for other intents
  if (lowerQuery.includes('order') && (lowerQuery.includes('track') || lowerQuery.includes('status'))) {
    return { intent: 'order', confidence: 0.9 };
  }
  
  if (lowerQuery.includes('warranty')) {
    return { intent: 'warranty', confidence: 0.9 };
  }
  
  if (lowerQuery.includes('return') || lowerQuery.includes('refund')) {
    return { intent: 'return', confidence: 0.9 };
  }
  
  if (lowerQuery.includes('delivery') || lowerQuery.includes('shipping')) {
    return { intent: 'delivery', confidence: 0.9 };
  }
  
  if (lowerQuery.includes('contact') || lowerQuery.includes('support') || lowerQuery.includes('help')) {
    return { intent: 'contact', confidence: 0.9 };
  }
  
  return { intent: 'general', confidence: 0.5 };
}

