export type SearchStatus = 'searching' | 'done' | 'failed';
export type JobState = 'idle' | 'queued' | 'running' | 'done' | 'failed';
export type ProspectStatus = 'new' | 'qualified' | 'contacted' | 'meeting' | 'converted' | 'discarded';

export const PROSPECT_STATUSES: { key: ProspectStatus; label: string; cls: string }[] = [
  { key: 'new', label: 'Nuevo', cls: 'badge-neutral' },
  { key: 'qualified', label: 'Calificado', cls: 'badge-info' },
  { key: 'contacted', label: 'Contactado', cls: 'badge-brand' },
  { key: 'meeting', label: 'Reunión', cls: 'badge-warning' },
  { key: 'converted', label: 'En seguimiento', cls: 'badge-success' },
  { key: 'discarded', label: 'Descartado', cls: 'badge-danger' },
];

export interface ProspectSearch {
  _id: string;
  name: string;
  services: string;
  idealCustomer: string;
  location: string;
  industries: string[];
  maxResults: number;
  status: SearchStatus;
  queries: string[];
  idealProfile: string;
  sources: string[];
  progress: string;
  found: number;
  error?: string;
  createdAt: string;
  total?: number;
  researched?: number;
  converted?: number;
  prospects?: Prospect[];
}

export interface ProspectPerson {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  source?: string;
  notes?: string;
  customerId?: string;
}

export interface ResearchStep {
  key: string;
  label: string;
  status: 'ok' | 'skipped' | 'failed';
  detail?: string;
}

export interface PageSpeedResult {
  strategy: 'mobile' | 'desktop';
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
  metrics: Record<string, string>;
  opportunities: { title: string; savings?: string }[];
}

export interface WebsiteReport {
  url: string;
  finalUrl?: string;
  reachable: boolean;
  https: boolean;
  responseMs?: number;
  title?: string;
  description?: string;
  hasViewport: boolean;
  hasOpenGraph: boolean;
  hasSchemaOrg: boolean;
  hasFavicon: boolean;
  h1Count: number;
  images: number;
  imagesWithoutAlt: number;
  wordCount: number;
  copyrightYear?: number;
  technologies: string[];
  hasContactForm: boolean;
  hasBlog: boolean;
  hasEcommerce: boolean;
  pagesVisited: string[];
  error?: string;
}

export interface ResearchAi {
  summary?: string;
  industry?: string;
  sizeEstimate?: string;
  yearsActive?: string | null;
  valueProposition?: string;
  digitalMaturity?: number;
  fitScore?: number;
  fitReason?: string;
  strengths?: string[];
  weaknesses?: string[];
  painPoints?: string[];
  opportunities?: string[];
  reviewsInsight?: string | null;
  socialPresence?: string;
  decisionMakers?: string;
  approach?: string;
  talkingPoints?: string[];
  risks?: string[];
}

export interface ProspectResearch {
  state: JobState;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  steps?: ResearchStep[];
  place?: {
    rating?: number;
    reviewsCount?: number;
    openingHours?: string[];
    summary?: string;
    reviews?: { rating?: number; text: string; when?: string }[];
  } | null;
  website?: WebsiteReport | null;
  pageSpeed?: { mobile?: PageSpeedResult; desktop?: PageSpeedResult } | null;
  social?: { network: string; url: string }[];
  searchResults?: { title: string; link: string; snippet?: string }[];
  emails?: string[];
  phones?: string[];
  people?: ProspectPerson[];
  ai?: ResearchAi;
}

export interface DiagnosisArea {
  area: string;
  score?: number;
  status?: 'good' | 'warning' | 'critical';
  findings?: string[];
  recommendations?: string[];
}

export interface ProspectMaterial {
  state: JobState;
  instructions?: string;
  error?: string;
  generatedAt?: string;
  diagnosis?: { score?: number; headline?: string; summary?: string; areas?: DiagnosisArea[] };
  plan?: {
    vision?: string;
    quickWins?: string[];
    initiatives?: { title: string; description?: string; impact?: string; effort?: string; timeline?: string }[];
    kpis?: string[];
    suggestedServices?: { service: string; why?: string; outcome?: string }[];
    extraIdeas?: string[];
  };
  outreach?: {
    emailSubject?: string;
    email?: string;
    whatsapp?: string;
    linkedin?: string;
    callScript?: string;
    followUps?: string[];
  };
}

export interface Prospect {
  _id: string;
  searchId?: string;
  name: string;
  website?: string;
  domain?: string;
  phone?: string;
  email?: string;
  address?: string;
  industry?: string;
  description?: string;
  source: string;
  placeId?: string;
  rating?: number;
  reviewsCount?: number;
  mapsUrl?: string;
  fitScore: number;
  fitReason?: string;
  status: ProspectStatus;
  research: ProspectResearch;
  material: ProspectMaterial;
  notes: string;
  tags: string[];
  customerId?: string;
  leadId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProspectingIntegrations {
  places: boolean;
  pageSpeed: boolean;
  serper: boolean;
  hunter: boolean;
  ai: boolean;
}

export function isBusy(state?: JobState): boolean {
  return state === 'queued' || state === 'running';
}
