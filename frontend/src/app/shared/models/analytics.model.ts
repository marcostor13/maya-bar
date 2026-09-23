/** Respuesta de GET /dashboard/analytics (backend/src/dashboard). */

export type AnalyticsRange = '7d' | '30d' | '90d' | '12m';
export type AnalyticsChannel = '' | 'whatsapp' | 'instagram' | 'messenger' | 'email';

export interface Kpi {
  value: number;
  previous: number;
  delta: number | null;
  series: number[];
}

export interface Breakdown { key: string; label: string; count: number; value?: number }

export interface DashboardAnalytics {
  range: { key: AnalyticsRange; from: string; to: string; bucket: 'day' | 'month'; buckets: string[]; timezone: string };
  channel: string | null;
  kpis: {
    wonValue: Kpi; wonDeals: Kpi; newContacts: Kpi; newConversations: Kpi;
    inbound: Kpi; aiShare: Kpi; newLeads: Kpi; conversionRate: Kpi;
  };
  pipeline: { open: number; openValue: number; weightedValue: number };
  activity: { inbound: number[]; ai: number[]; human: number[] };
  heatmap: number[][];
  response: {
    medianMinutes: number | null; p90Minutes: number | null; withinFiveMinutes: number | null;
    aiMedianMinutes: number | null; humanMedianMinutes: number | null; answered: number; unanswered: number;
  };
  channels: Breakdown[];
  sources: Breakdown[];
  funnel: (Breakdown & { color: string; probability: number })[];
  outcomes: { won: number; lost: number; lostSeries: number[]; lostReasons: Breakdown[] };
  agents: { id: string; name: string; replies: number; conversations: number; handoffs: number }[];
  marketing: {
    campaigns: { sent: number; recipients: number; byType: Breakdown[] };
    recovery: { sent: number; failed: number };
    forms: { submissions: number; top: Breakdown[] };
    events: { registrations: number; attendees: number; checkedIn: number };
    suppression: { added: number };
  };
  prospecting: { found: number; researched: number; withMaterial: number; contacted: number; converted: number };
  tags: Breakdown[];
  alerts: { overdueTasks: number; unread: number; escalated: number };
}
