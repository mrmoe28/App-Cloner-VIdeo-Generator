export interface StockMediaItem {
  id: string;
  provider: 'unsplash' | 'pixabay' | 'pexels' | 'freesound' | 'scraped_unsplash';
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  license: string;
  downloadUrl: string;
  author?: string;
  authorUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  views?: number;
  downloads?: number;
  avgColor?: string;
  filesize?: number;
  previewUrl?: string;
}

export interface SearchParams {
  query: string;
  type?: 'image' | 'video' | 'audio';
  page?: number;
  limit?: number;
  orientation?: 'portrait' | 'landscape' | 'square';
  category?: string;
}

export interface SearchResult {
  results: StockMediaItem[];
  total: number;
  grouped: Record<string, StockMediaItem[]>;
  providers: {
    provider: string;
    type: string;
    count: number;
    name: string;
  }[];
}

export interface LibraryItem extends StockMediaItem {
  addedAt: string;
  tags: string[];
  category: string;
  notes?: string;
}

export interface TrendingParams {
  type?: 'image' | 'video' | 'audio';
  category?: string;
  limit?: number;
}

export interface MCPError {
  code: string;
  message: string;
  details?: any;
}