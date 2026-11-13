import { useEffect, useRef, useState } from 'react';
import { useBookingQuote, useCreateBooking, useDeleteOption, useSavedOptions, useToggleVote } from '../../api/hooks';
import type { Group, SavedOption } from '../../api/types';
import { errorMessage } from '../../lib/errors';
import { fmtRange, inr, plural } from '../../lib/format';
import { useMe } from '../../session/SessionContext';
import { useToast } from '../../components/Toasts';
import { Avatar, ErrorBox, Icon, Modal, Spinner } from '../../components/ui';

/** M6 save and compare (E23–E26) and finalise (E27 quote → E28 booking). */
export function ShortlistPanel({ group, onBooked, onBrowse }: { group: Group; onBooked: () => void; onBrowse: () => void }) {
  const me = useMe();
  const { data, isLoading, isError, error, refetch } = useSavedOptions(group.groupId, true);
  const vote = useToggleVote(group.groupId);
  const del = useDeleteOption(group.groupId);
  const toast = useToast();
  const [booking, setBooking] = useState<SavedOption | null>(null);
  const booked = group.status === 'BOOKED';
  const nameOf = (id: string) => group.members.find((m) => m.travellerId === id)?.name ?? id;

  if (isLoading) return <Spinner label="Loading the shortlist" />;
  if (isError) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (!data?.length) {
    return (
      <div className="empty">
        <h3>Nothing saved yet</h3>
        <p className="muted">Save hotel options from the search. Everyone votes, then anyone can book.</p>
        <button className="btn ocean" onClick={onBrowse}>Browse hotels</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="small muted">Most votes first. Prices update live for the current group size.</p>
      {data.map((o) => {
        const voted = o.votes.includes(me.travellerId);
        const canDelete = !booked && (o.savedBy === me.travellerId || group.viewer.relation === 'OWNER');
        return (
          <article key={o.optionId} className="card" style={{ padding: 0 }}>
            <div className="hotel">
              <img className="hotel-photo" src={o.hotel.image} alt={o.hotel.name} loading="lazy" style={{ width: 160, height: 120 }} />
              <div className="stack" style={{ flex: '1 1 240px', minWidth: 0, ['--gap' as string]: '6px' }}>
                <h3>{o.hotel.name}</h3>
                <span className="small muted">{o.room.name} · {o.hotel.area} · rated {o.hotel.rating}/10 · saved by {nameOf(o.savedBy).split(' ')[0]}</span>
                <div className="row" style={{ ['--row-gap' as string]: '8px', marginTop: 'auto' }}>
                  <span className="avatars">
                    {o.votes.map((id) => <Avatar key={id} id={id} name={nameOf(id)} size="xs" />)}
                  </span>
                  <span className="small">{o.voteCount} of {o.memberCount} agree</span>
                  {o.allAgree && <span className="tag sea">Everyone agrees</span>}
                  {!o.live.available && <span className="tag danger">Sold out for these dates</span>}
                  {o.stale && <span className="tag coral">Group size changed — price updated</span>}
                </div>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', textAlign: 'right', ['--gap' as string]: '10px', flex: '0 1 240px' }}>
                <div>
                  <div className="price-big">{inr(o.live.perMemberInr)}<span className="small muted" style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}> / person</span></div>
                  <div className="tiny muted">{inr(o.live.totalInr)} total · {plural(o.live.roomsNeeded, 'room')}</div>
                  {o.stale && <div className="tiny muted">was {inr(o.snapshot.perMemberInr)} for {o.snapshot.memberCount}</div>}
                </div>
                {!booked && (
                  <div className="row" style={{ ['--row-gap' as string]: '8px' }}>
                    {canDelete && (
                      <button className="icon-btn" aria-label={`Remove ${o.hotel.name} from shortlist`}
                        onClick={() => del.mutate(o.optionId, { onError: (e) => toast(errorMessage(e), 'error') })}>
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                    <button className="btn sm ghost" aria-pressed={voted}
                      style={voted ? { background: 'var(--seafoam-soft)', borderColor: 'var(--seafoam)' } : undefined}
                      onClick={() => vote.mutate({ optionId: o.optionId, voted }, { onError: (e) => toast(errorMessage(e), 'error') })}>
                      <Icon name="thumb" size={16} /> {voted ? 'Voted' : 'Vote'}
                    </button>
                    <button className="btn sm primary" disabled={!o.live.available} onClick={() => setBooking(o)}>Book for group</button>
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {booking && <ConfirmBooking group={group} option={booking} onClose={() => setBooking(null)} onBooked={() => { setBooking(null); onBooked(); }} />}
    </div>
  );
}

/** Popup with fresh numbers from E27, then E28 on confirm. */
function ConfirmBooking({ group, option, onClose, onBooked }: { group: Group; option: SavedOption; onClose: () => void; onBooked: () => void }) {
  const quote = useBookingQuote(group.groupId);
  const book = useCreateBooking(group.groupId);
  const toast = useToast();
  const asked = useRef(false);
  const { mutate: fetchQuote } = quote;
  useEffect(() => {
    if (asked.current) return; // StrictMode runs effects twice in dev
    asked.current = true;
    fetchQuote(option.optionId);
  }, [fetchQuote, option.optionId]);

  const q = quote.data;
  return (
    <Modal title="Confirm booking" onClose={onClose}>
      {quote.isPending && <Spinner label="Getting the latest price" />}
      {quote.isError && <ErrorBox error={quote.error} />}
      {q && (
        <>
          <div className="stack" style={{ ['--gap' as string]: '4px' }}>
            <strong className="display" style={{ fontSize: 22 }}>{q.hotelName}</strong>
            <span className="muted">{q.roomName} · {plural(q.roomsNeeded, 'room')} · {fmtRange(q.checkIn, q.checkOut)} ({plural(q.nights, 'night')})</span>
          </div>
          <div className="money-tiles">
            <div className="money-tile" style={{ background: 'var(--cream)' }}><div className="small muted">Total</div><div className="v">{inr(q.totalInr)}</div></div>
            <div className="money-tile sun"><div className="small">Each person pays</div><div className="v">{inr(q.perMemberInr)}</div></div>
          </div>
          <p className="small muted">{inr(q.pricePerNightInr)} per room per night, split equally between {q.members.map((m) => m.name.split(' ')[0]).join(', ')}.</p>
          {!q.available && <div className="alert error">These rooms are no longer free on every night. Pick another option.</div>}
          <div className="alert warn small"><Icon name="lock" size={16} /> Once booked, the booking can't be changed and the group closes to new members.</div>
          {book.isError && <ErrorBox error={book.error} />}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!q.available || book.isPending || book.isSuccess}
              onClick={() => book.mutate(q.optionId, {
                onSuccess: () => { toast('Booked! Everyone in the group can see it.'); onBooked(); },
              })}>
              {book.isPending ? 'Booking…' : `Confirm · ${inr(q.totalInr)}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
