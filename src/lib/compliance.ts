import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/uuid';
import type { ComplianceLog, ComplianceSource, RecordBypassInput } from '@/types/compliance';
import {
  findBypassKeywords,
  findOffPlatformHits,
  maskOffPlatformContact,
} from '@/utils/filter';

const MEMORY_CAP = 300;
const memoryLogs: ComplianceLog[] = [];

function clipSnippet(text: string) {
  const masked = maskOffPlatformContact(text).replace(/\s+/g, ' ').trim();
  return masked.slice(0, 160);
}

function pushMemory(log: ComplianceLog) {
  memoryLogs.unshift(log);
  if (memoryLogs.length > MEMORY_CAP) {
    memoryLogs.pop();
  }
}

export function inspectBypassText(text: string | null | undefined) {
  const source = text ?? '';
  const keywords = findBypassKeywords(source);
  const hits = findOffPlatformHits(source);
  return {
    keywords,
    hits,
    shouldLog: keywords.length > 0 || hits.length > 0,
    shouldBlock: hits.length > 0,
  };
}

export async function recordBypassIfNeeded(input: RecordBypassInput): Promise<ComplianceLog | null> {
  const inspected = inspectBypassText(input.text);
  if (!inspected.shouldLog) {
    return null;
  }

  const keywords = [
    ...new Set([
      ...inspected.keywords,
      ...inspected.hits.map((hit) => hit.kind),
    ]),
  ];
  const log: ComplianceLog = {
    id: `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: input.source,
    keywords,
    snippet: clipSnippet(input.text),
    blocked: Boolean(input.blocked || inspected.shouldBlock),
    actorId: input.actorId ?? null,
    auctionId: input.auctionId ?? null,
    createdAt: new Date().toISOString(),
  };
    pushMemory(log);

  const client = createAdminClient();
  if (!client) {
    return log;
  }

  try {
    const { data, error } = await client
      .from('compliance_logs')
      .insert({
        source: log.source,
        keywords: log.keywords,
        snippet: log.snippet,
        blocked: log.blocked,
        actor_id: log.actorId && isUuid(log.actorId) ? log.actorId : null,
        auction_id: log.auctionId,
      })
      .select('id, source, keywords, snippet, blocked, actor_id, auction_id, created_at')
      .maybeSingle();
    if (error || !data) {
      return log;
    }
    const stored: ComplianceLog = {
      id: data.id,
      source: data.source as ComplianceSource,
      keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : log.keywords,
      snippet: data.snippet ?? log.snippet,
      blocked: Boolean(data.blocked),
      actorId: data.actor_id ?? null,
      auctionId: data.auction_id ?? null,
      createdAt: data.created_at ?? log.createdAt,
    };
    const memoryIndex = memoryLogs.findIndex((item) => item.id === log.id);
    if (memoryIndex >= 0) {
      memoryLogs.splice(memoryIndex, 1);
    }
    return stored;
  } catch {
    return log;
  }
}

export async function listComplianceLogs(): Promise<ComplianceLog[]> {
  const client = createAdminClient();
  if (!client) {
    return [...memoryLogs];
  }

  try {
    const { data, error } = await client
      .from('compliance_logs')
      .select('id, source, keywords, snippet, blocked, actor_id, auction_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) {
      return [...memoryLogs];
    }
    const rows: ComplianceLog[] = data.map((row) => ({
      id: row.id,
      source: (row.source as ComplianceSource) || 'bid',
      keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
      snippet: row.snippet ?? '',
      blocked: Boolean(row.blocked),
      actorId: row.actor_id ?? null,
      auctionId: row.auction_id ?? null,
      createdAt: row.created_at ?? '',
    }));
    const seen = new Set(rows.map((item) => item.id));
    return [...rows, ...memoryLogs.filter((item) => !seen.has(item.id))];
  } catch {
    return [...memoryLogs];
  }
}
