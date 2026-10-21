import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isUuid } from '@/lib/uuid';
import type { ChatMessage, SendChatMessageInput } from '@/types/chat';
import type { Database } from '@/types/database';
import {
  OffPlatformContactError,
  maskOffPlatformContact,
  sanitizeUserText,
} from '@/utils/filter';

const CHAT_COLUMNS = 'id, auction_id, sender_id, sender_name, body, created_at';

type ChatRow = Database['public']['Tables']['chat_messages']['Row'];

type DataResult<T> = {
  data: T;
  error: string | null;
};

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

let mockMessages: ChatMessage[] = [];

function mapChatRow(row: Partial<ChatRow> & Pick<ChatRow, 'id'>): ChatMessage {
  return {
    id: row.id,
    auctionId: row.auction_id ?? '',
    senderId: row.sender_id ?? null,
    senderName: row.sender_name?.trim() || '참여자',
    body: maskOffPlatformContact(row.body ?? ''),
    createdAt: row.created_at ?? '',
  };
}

function sanitizeMessage(item: ChatMessage): ChatMessage {
  return {
    ...item,
    body: maskOffPlatformContact(item.body),
  };
}

export async function listChatMessages(
  auctionId: string,
): Promise<DataResult<ChatMessage[]>> {
  const id = auctionId.trim();
  if (!id) {
    return fail([], '경매 ID가 필요합니다.');
  }

  const supabase = await getDataClient();
  if (!supabase || !isUuid(id)) {
    return ok(
      mockMessages
        .filter((item) => item.auctionId === id)
        .map(sanitizeMessage)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    );
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(CHAT_COLUMNS)
      .eq('auction_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      if (isSchemaMismatch(error)) {
        return ok(
          mockMessages
            .filter((item) => item.auctionId === id)
            .map(sanitizeMessage),
        );
      }
      return fail([], '채팅 메시지를 불러오지 못했습니다.');
    }

    return ok((data ?? []).map((row) => mapChatRow(row)));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '채팅 메시지를 불러오지 못했습니다.';
    return fail([], message);
  }
}

export async function sendChatMessage(
  input: SendChatMessageInput,
): Promise<DataResult<ChatMessage | null>> {
  const auctionId = input.auctionId.trim();
  const senderName = (input.senderName ?? '').trim() || '참여자';
  const senderId = input.senderId?.trim() || null;

  if (!auctionId) {
    return fail(null, '경매 ID가 필요합니다.');
  }

  let body: string;
  try {
    body = sanitizeUserText(input.body, 'reject');
  } catch (error) {
    if (error instanceof OffPlatformContactError) {
      return fail(null, error.message);
    }
    return fail(null, '메시지를 저장하지 못했습니다.');
  }

  if (!body) {
    return fail(null, '메시지 내용을 입력해 주세요.');
  }

  const supabase = await getDataClient();
  if (!supabase || !isUuid(auctionId) || (senderId && !isUuid(senderId))) {
    const created: ChatMessage = {
      id: `chat-${Date.now()}`,
      auctionId,
      senderId,
      senderName,
      body,
      createdAt: new Date().toISOString(),
    };
    mockMessages = [...mockMessages, created];
    return ok(sanitizeMessage(created));
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        auction_id: auctionId,
        sender_id: senderId,
        sender_name: senderName,
        body,
      })
      .select(CHAT_COLUMNS)
      .single();

    if (error || !data) {
      if (error && isSchemaMismatch(error)) {
        const created: ChatMessage = {
          id: `chat-${Date.now()}`,
          auctionId,
          senderId,
          senderName,
          body,
          createdAt: new Date().toISOString(),
        };
        mockMessages = [...mockMessages, created];
        return ok(sanitizeMessage(created));
      }
      return fail(null, '메시지를 저장하지 못했습니다.');
    }

    return ok(mapChatRow(data));
  } catch (error) {
    if (error instanceof OffPlatformContactError) {
      return fail(null, error.message);
    }
    const message =
      error instanceof Error ? error.message : '메시지를 저장하지 못했습니다.';
    return fail(null, message);
  }
}
