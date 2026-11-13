import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGroupMessages, useLoadEarlierMessages, useSendMessage } from '../../api/hooks';
import type { Group, Message } from '../../api/types';
import { errorMessage } from '../../lib/errors';
import { useMe } from '../../session/SessionContext';
import { useToast } from '../../components/Toasts';
import { Avatar, ErrorBox, Spinner } from '../../components/ui';

const BODY_MAX = 2000;
const NEAR_BOTTOM_PX = 120;

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dayKey = (iso: string) => new Date(iso).toDateString();

/** Group chat (E33, E34): members plan the trip together. Polls every few seconds while open. */
export function ChatPanel({ group }: { group: Group }) {
  const me = useMe();
  const { data, isLoading, isError, error, refetch } = useGroupMessages(group.groupId, true);
  const send = useSendMessage(group.groupId);
  const earlier = useLoadEarlierMessages(group.groupId);
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const keepFromBottom = useRef<number | null>(null); // set while prepending older messages
  const items = data?.items ?? [];
  const lastId = items.length ? items[items.length - 1].messageId : null;
  const firstId = items.length ? items[0].messageId : null;

  // Scrolling: keep the view still when older messages are prepended; otherwise follow new
  // messages if the reader is already near the bottom (or just sent one).
  const wasNearBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
      return;
    }
    const mineLast = items.length > 0 && items[items.length - 1].sender.travellerId === me.travellerId;
    if (wasNearBottom.current || mineLast) el.scrollTop = el.scrollHeight;
  }, [lastId, firstId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scroller.current;
    if (el) wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const loadEarlier = () => {
    const el = scroller.current;
    if (!firstId || !el) return;
    earlier.mutate(firstId, {
      onSuccess: () => { keepFromBottom.current = el.scrollHeight - el.scrollTop; },
      onError: (e) => toast(errorMessage(e), 'error'),
    });
  };

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, {
      onSuccess: () => setDraft(''),
      onError: (e) => toast(errorMessage(e), 'error'), // the draft stays, so nothing is lost
    });
  };

  return (
    <section className="card chat" aria-label={`${group.name} chat`}>
      <header className="chat-head row between">
        <div>
          <h2 style={{ fontSize: 24 }}>Group chat</h2>
          <span className="small muted">Only the {group.memberCount} members of this trip can see these messages.</span>
        </div>
      </header>

      <div className="chat-scroll" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions">
        {isLoading && <Spinner label="Loading messages" />}
        {isError && <ErrorBox error={error} onRetry={() => refetch()} />}
        {data?.hasMoreOlder && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn ghost sm" onClick={loadEarlier} disabled={earlier.isPending}>
              {earlier.isPending ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {data && items.length === 0 && (
          <div className="chat-empty">
            <p className="strong">No messages yet</p>
            <p className="small muted">Say hi and start planning — dates, places to see, which hotel to pick.</p>
          </div>
        )}
        {items.map((m, i) => {
          const prev = items[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          // Consecutive messages from one person within 5 minutes form one run (name shown once)
          const sameRun = !!prev && !newDay && prev.sender.travellerId === m.sender.travellerId
            && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <Fragment key={m.messageId}>
              {newDay && <div className="chat-day" role="separator"><span>{day.format(new Date(m.createdAt))}</span></div>}
              <ChatMessage m={m} mine={m.sender.travellerId === me.travellerId} showName={!sameRun} ownerId={group.owner.travellerId} />
            </Fragment>
          );
        })}
      </div>

      <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea className="input" rows={2} maxLength={BODY_MAX} value={draft} disabled={send.isPending}
          aria-label="Message" placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }} />
        <div className="stack" style={{ ['--gap' as string]: '4px', alignItems: 'flex-end' }}>
          <button className="btn ocean" type="submit" disabled={!draft.trim() || send.isPending}>
            {send.isPending ? 'Sending…' : 'Send'}
          </button>
          {draft.length > BODY_MAX - 200 && <span className="tiny muted">{BODY_MAX - draft.length} left</span>}
        </div>
      </form>
    </section>
  );
}

function ChatMessage({ m, mine, showName, ownerId }: { m: Message; mine: boolean; showName: boolean; ownerId: string }) {
  const name = m.sender.name ?? 'Former member';
  const at = new Date(m.createdAt);
  return (
    <div className={`chat-msg ${mine ? 'mine' : ''} ${showName ? 'first' : ''}`}>
      {!mine && (
        <span className="chat-avatar">{showName && <Avatar id={m.sender.travellerId} name={name} size="xs" />}</span>
      )}
      <div className="chat-bubble-wrap">
        {showName && !mine && (
          <Link to={`/travellers/${m.sender.travellerId}`} className="chat-name">
            {name}{m.sender.travellerId === ownerId && <span className="tiny muted"> · owner</span>}
          </Link>
        )}
        <div className="chat-bubble">
          <span className="sr-only">{mine ? 'You' : name} said: </span>
          {m.body}
        </div>
        <time className="chat-time" dateTime={m.createdAt} title={at.toLocaleString()}>{time.format(at)}</time>
      </div>
    </div>
  );
}

/** Unread count for the Chat tab: messages from others newer than the last one this person saw here. */
export function useChatUnread(groupId: string, travellerId: string, items: Message[] | undefined, open: boolean) {
  const storageKey = `gtm.chatSeen.${travellerId}.${groupId}`;
  const read = () => { try { return Number(localStorage.getItem(storageKey) ?? 0); } catch { return 0; } };
  const [seen, setSeen] = useState(read);
  const last = items && items.length ? Number(items[items.length - 1].messageId.slice(4)) : 0;

  useEffect(() => { setSeen(read()); }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && last > seen) {
      try { localStorage.setItem(storageKey, String(last)); } catch { /* storage blocked: badge just resets */ }
      setSeen(last);
    }
  }, [open, last, seen, storageKey]);

  if (open || !items) return 0;
  return items.filter((m) => m.sender.travellerId !== travellerId && Number(m.messageId.slice(4)) > seen).length;
}
