import knowledge from "../src/data/knowledge.json";

type Row = Record<string, any>;

export function searchKnowledge(query: string, limit = 5): Row[] {
  try {
    const q = query.toLowerCase();
    
    // Ensure knowledge is an array
    if (!Array.isArray(knowledge)) {
      console.warn('[Knowledge] knowledge.json is not a valid array');
      return [];
    }

    return (knowledge as Row[])
      .map((row) => {
        const text = Object.values(row).join(" ").toLowerCase();
        let score = 0;

        for (const word of q.split(/\s+/)) {
          if (word && text.includes(word)) score++;
        }

        return { row, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.row);
  } catch (error) {
    console.error('[Knowledge] Error searching knowledge:', error);
    return [];
  }
}
