export interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchProvider {
  id: string;
  label: string;
  isAvailable(): boolean;
  search(query: string): Promise<ResearchResult[]>;
}
