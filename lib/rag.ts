import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY || '',
});

export interface DocumentChunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: {
    source?: string;
    page?: number;
    section?: string;
  };
}

// In-memory vector store (for production, consider using a proper vector database)
let vectorStore: DocumentChunk[] = [];
let isInitialized = false;
let problemOptions: Array<{ label: string; value: string; action: string }> = [];

/**
 * Initialize RAG by loading and processing data files
 * Place your data files in the /data folder
 */
export async function initializeRAG(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    const dataDir = path.join(process.cwd(), 'data');
    
    // Check if data directory exists
    if (!fs.existsSync(dataDir)) {
      console.log('Data directory not found. Creating it...');
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('Please place your data files in the /data folder');
      return;
    }

    // Read all files from data directory (including subdirectories)
    const dataFiles = getAllDataFiles(dataDir);

    if (dataFiles.length === 0) {
      console.log('No data files found in /data folder');
      return;
    }

    console.log(`Found ${dataFiles.length} data file(s). Processing...`);

    // Process each file
    for (const filePath of dataFiles) {
      const fileName = path.basename(filePath);
      const relativePath = path.relative(dataDir, filePath);
      
      try {
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // Parse CSV files into readable format and extract problem options
        if (fileName.endsWith('.csv')) {
          console.log(`Parsing CSV file: ${fileName}`);
          const csvData = parseCSVWithOptions(content);
          content = csvData.content;
          
          // Extract problem options from CSV if available
          if (csvData.problemOptions.length > 0) {
            problemOptions = csvData.problemOptions;
            console.log(`Extracted ${problemOptions.length} problem options from CSV`);
          }
        }
        
        // Chunk the content
        const chunks = chunkText(content, 500, 100); // 500 chars per chunk, 100 char overlap
        
        console.log(`Created ${chunks.length} chunks from ${fileName}`);
        
        // Create embeddings for chunks
        for (let i = 0; i < chunks.length; i++) {
          const chunk: DocumentChunk = {
            id: `${relativePath}-chunk-${i}`,
            content: chunks[i],
            metadata: {
              source: fileName,
              section: `chunk-${i}`,
            },
          };
          vectorStore.push(chunk);
        }
      } catch (error) {
        console.error(`Error processing file ${fileName}:`, error);
      }
    }

    // Generate embeddings for all chunks
    if (vectorStore.length > 0 && (process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY)) {
      console.log(`Generating embeddings for ${vectorStore.length} chunks...`);
      await generateEmbeddings();
    }

    isInitialized = true;
    console.log(`RAG initialized with ${vectorStore.length} document chunks`);
  } catch (error) {
    console.error('Error initializing RAG:', error);
  }
}

/**
 * Get all data files recursively from directory
 */
function getAllDataFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively search subdirectories
      getAllDataFiles(filePath, fileList);
    } else if (
      file.endsWith('.txt') || 
      file.endsWith('.json') || 
      file.endsWith('.md') ||
      file.endsWith('.csv')
    ) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Parse CSV file into readable text format and extract problem options
 */
function parseCSVWithOptions(csvContent: string): { 
  content: string; 
  problemOptions: Array<{ label: string; value: string; action: string }> 
} {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { content: '', problemOptions: [] };

  // Parse header
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  
  if (headers.length === 0) return { content: '', problemOptions: [] };

  // Find Product_Issues column index
  const issuesColumnIndex = headers.findIndex(h => 
    h.toLowerCase().includes('issue') || 
    h.toLowerCase().includes('problem') ||
    h.toLowerCase().includes('troubleshoot')
  );

  // Extract unique problem types
  const problemSet = new Set<string>();
  const problemMap = new Map<string, string>();

  // Parse rows
  const rows: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length === 0) continue;

    // Extract problems from Product_Issues column if it exists
    if (issuesColumnIndex >= 0 && values[issuesColumnIndex]) {
      const issues = values[issuesColumnIndex].trim().replace(/^"|"$/g, '');
      if (issues) {
        // Split by common delimiters (comma, semicolon, newline, pipe)
        const issueList = issues.split(/[,;|\n]/).map(i => i.trim()).filter(Boolean);
        issueList.forEach(issue => {
          if (issue && issue.length > 3) {
            problemSet.add(issue);
            // Create action from issue (simplified)
            const actionKey = issue.toLowerCase()
              .replace(/[^a-z0-9]/g, '_')
              .substring(0, 30);
            problemMap.set(issue, actionKey);
          }
        });
      }
    }

    // Create a readable text representation of each row
    const rowText = headers.map((header, index) => {
      const value = (values[index] || '').trim().replace(/^"|"$/g, '');
      return value ? `${header}: ${value}` : null;
    }).filter(Boolean).join(' | ');

    if (rowText) {
      rows.push(`Product ${i}: ${rowText}`);
    }
  }

  // Convert problem set to options array
  const problemOptions: Array<{ label: string; value: string; action: string }> = [];
  let optionIndex = 1;
  problemSet.forEach(problem => {
    const action = problemMap.get(problem) || `troubleshoot_${optionIndex}`;
    problemOptions.push({
      label: `🔧 ${problem}`,
      value: problem.toLowerCase(),
      action: action
    });
    optionIndex++;
  });

  // If no problems found in CSV, use default options
  if (problemOptions.length === 0) {
    problemOptions.push(
      { label: "🔌 Not turning on / Power issue", value: "power issue", action: "troubleshoot_power" },
      { label: "⚡ Charging problem", value: "charging problem", action: "troubleshoot_charging" },
      { label: "🔧 Mechanical issue / Not cutting properly", value: "mechanical issue", action: "troubleshoot_mechanical" },
      { label: "🔋 Battery not holding charge", value: "battery issue", action: "troubleshoot_battery" },
      { label: "🧹 Blockage or jammed", value: "blockage", action: "troubleshoot_blockage" },
      { label: "📱 Other problem", value: "other problem", action: "troubleshoot_other" }
    );
  }

  return {
    content: rows.join('\n\n'),
    problemOptions: problemOptions.slice(0, 10) // Limit to 10 options
  };
}

/**
 * Parse CSV file into readable text format (legacy function for compatibility)
 */
function parseCSV(csvContent: string): string {
  const result = parseCSVWithOptions(csvContent);
  return result.content;
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  values.push(current.trim());
  
  return values.map(v => v.replace(/^"|"$/g, ''));
}

/**
 * Chunk text into smaller pieces for better retrieval
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    start = end - overlap;
  }

  return chunks;
}

/**
 * Generate embeddings for all document chunks
 */
async function generateEmbeddings(): Promise<void> {
  if (!process.env.OPENAI_API_KEY && !process.env.OPEN_AI_KEY) {
    console.log('No OpenAI API key found. Skipping embeddings generation.');
    return;
  }

  try {
    // Process in batches to avoid rate limits
    const batchSize = 100;
    for (let i = 0; i < vectorStore.length; i += batchSize) {
      const batch = vectorStore.slice(i, i + batchSize);
      
      const embeddings = await Promise.all(
        batch.map(chunk => getEmbedding(chunk.content))
      );

      batch.forEach((chunk, index) => {
        chunk.embedding = embeddings[index];
      });

      console.log(`Processed embeddings batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectorStore.length / batchSize)}`);
    }
  } catch (error) {
    console.error('Error generating embeddings:', error);
  }
}

/**
 * Get embedding for a text using OpenAI
 */
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // or 'text-embedding-ada-002'
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retrieve relevant document chunks based on query
 */
export async function retrieveRelevantChunks(
  query: string,
  topK: number = 5
): Promise<DocumentChunk[]> {
  // Initialize RAG if not already done
  if (!isInitialized) {
    await initializeRAG();
  }

  if (vectorStore.length === 0) {
    return [];
  }

  try {
    // Get query embedding
    const queryEmbedding = await getEmbedding(query);

    if (queryEmbedding.length === 0) {
      // Fallback to keyword matching if embeddings fail
      return keywordSearch(query, topK);
    }

    // Calculate similarity scores
    const scoredChunks = vectorStore
      .filter(chunk => chunk.embedding && chunk.embedding.length > 0)
      .map(chunk => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.chunk);

    return scoredChunks;
  } catch (error) {
    console.error('Error retrieving chunks:', error);
    // Fallback to keyword search
    return keywordSearch(query, topK);
  }
}

/**
 * Fallback keyword-based search
 */
function keywordSearch(query: string, topK: number): DocumentChunk[] {
  const lowerQuery = query.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/);
  
  // Extract product codes (e.g., HT50, LHT50, GT50) - uppercase letters followed by numbers
  const productCodePattern = /\b([A-Z]{2,}\d+)\b/gi;
  const productCodes: string[] = [];
  let match;
  while ((match = productCodePattern.exec(query)) !== null) {
    productCodes.push(match[1].toUpperCase());
  }

  const scoredChunks = vectorStore.map(chunk => {
    const lowerContent = chunk.content.toLowerCase();
    let score = 0;

    // Boost score if product code matches (case-insensitive)
    productCodes.forEach(code => {
      const codeRegex = new RegExp(code, 'gi');
      const codeMatches = (chunk.content.match(codeRegex) || []).length;
      score += codeMatches * 10; // Higher weight for product code matches
    });

    // Regular word matching
    queryWords.forEach(word => {
      // Skip very short words unless they're part of a product code
      if (word.length < 2 && !productCodes.some(code => code.toLowerCase().includes(word))) {
        return;
      }
      const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = (chunk.content.match(wordRegex) || []).length;
      score += matches;
    });

    return { chunk, score };
  });

  return scoredChunks
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(item => item.chunk);
}

/**
 * Get RAG context for a query
 */
export async function getRAGContext(query: string): Promise<string> {
  // Check if query contains a product code (e.g., HT50, LHT50, GT50)
  const productCodePattern = /\b([A-Z]{2,}\d+)\b/gi;
  const hasProductCode = productCodePattern.test(query);
  
  // Increase chunks for product queries to get more comprehensive information
  const topK = hasProductCode ? 10 : 5;
  const relevantChunks = await retrieveRelevantChunks(query, topK);

  if (relevantChunks.length === 0) {
    return '';
  }

  let context = 'Relevant information from knowledge base:\n\n';
  relevantChunks.forEach((chunk, index) => {
    context += `[${index + 1}] ${chunk.content}\n\n`;
  });

  return context;
}

/**
 * Get problem options from RAG data (extracted from CSV)
 */
export function getProblemOptions(): Array<{ label: string; value: string; action: string }> {
  // Return problem options if they were extracted from CSV
  if (problemOptions.length > 0) {
    return problemOptions;
  }
  
  // Fallback to default options if no CSV data
  return [
    { label: "🔌 Not turning on / Power issue", value: "power issue", action: "troubleshoot_power" },
    { label: "⚡ Charging problem", value: "charging problem", action: "troubleshoot_charging" },
    { label: "🔧 Mechanical issue / Not cutting properly", value: "mechanical issue", action: "troubleshoot_mechanical" },
    { label: "🔋 Battery not holding charge", value: "battery issue", action: "troubleshoot_battery" },
    { label: "🧹 Blockage or jammed", value: "blockage", action: "troubleshoot_blockage" },
    { label: "📱 Other problem", value: "other problem", action: "troubleshoot_other" }
  ];
}

/**
 * Manually add document to RAG (for dynamic content)
 */
export async function addDocumentToRAG(
  content: string,
  metadata?: { source?: string; section?: string }
): Promise<void> {
  const chunks = chunkText(content, 500, 100);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk: DocumentChunk = {
      id: `manual-chunk-${Date.now()}-${i}`,
      content: chunks[i],
      metadata: metadata || {},
    };

    // Generate embedding
    if (process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY) {
      chunk.embedding = await getEmbedding(chunk.content);
    }

    vectorStore.push(chunk);
  }
}

