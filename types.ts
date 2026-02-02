
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface Coordinates {
  x: number;
  y: number;
}

export interface Observation {
  id: string;
  note: string;
  priority: Priority;
  planId: string | null;
  coords: Coordinates | null;
  images: string[]; // Base64 strings
  tags: string[];
  trade: string;
  responsibleParty: string;
  recommendedAction: string;
  timestamp: number;
}

export interface FloorPlan {
  id: string;
  name: string;
  imageData: string; // Base64
}

export interface ProjectInfo {
  id: string;
  name: string;
  location: string;
  inspector: string;
  emailTo: string;
  lastModified: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  location: string;
  findingCount: number;
  lastModified: number;
}

export interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  wind: number;
}
