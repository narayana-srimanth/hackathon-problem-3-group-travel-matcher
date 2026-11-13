import { useBooking } from '../../api/hooks';
import type { Group } from '../../api/types';
import { fmtDateLong, fmtRange, inr, plural } from '../../lib/format';
import { useMe } from '../../session/SessionContext';
import { Avatar, ErrorBox, Icon, Spinner } from '../../components/ui';

/** M6 final booking and cost split (E29). A 404 from the server means "not booked yet". */
export function BookingPanel({ group, onShortlist }: { group: Group; onShortlist: () => void }) {
  const me = useMe();
  const { data: booking, isLoading, isError, error, refetch } = useBooking(group.groupId, true);
  const nameOf = (id: string) => group.members.find((m) => m.travellerId === id)?.name ?? id;

  if (isLoading) return <Spinner label="Checking the booking" />;
  if (isError) return <ErrorBox error={error} onRetry={() => refetch()} />;

  if (!booking) {
    return (
      <div className="empty">
        <h3>Not booked yet</h3>
        <p className="muted">When the group agrees on a shortlisted hotel, any member can book it. The cost is split equally.</p>
        <button className="btn ocean" onClick={onShortlist}>Go to shortlist</button>
      </div>
    );
  }

  return (
    <section className="card dark stack" style={{ ['--gap' as string]: '20px' }}>
      <div className="row between">
        <h2>Booking and split</h2>
        <span className="tag sun"><Icon name="lock" size={14} /> Confirmed · {booking.bookingId}</span>
      </div>

      <div className="money-tiles">
        <div className="money-tile"><div className="small" style={{ color: 'var(--seafoam-soft)' }}>Hotel</div>
          <div className="v" style={{ fontSize: 20 }}>{booking.hotel.name}</div>
          <div className="small" style={{ color: 'var(--seafoam-soft)' }}>{booking.room.name} · {plural(booking.roomsBooked, 'room')}</div></div>
        <div className="money-tile"><div className="small" style={{ color: 'var(--seafoam-soft)' }}>Total</div>
          <div className="v">{inr(booking.totalInr)}</div>
          <div className="small" style={{ color: 'var(--seafoam-soft)' }}>{plural(booking.nights.length, 'night')} · {fmtRange(group.checkIn, group.checkOut)}</div></div>
        <div className="money-tile sun"><div className="small">Each person pays</div>
          <div className="v">{inr(booking.perMemberInr)}</div>
          <div className="small">split {booking.memberIds.length} ways</div></div>
      </div>

      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, ['--gap' as string]: '0px' }}>
        {booking.memberIds.map((id, i) => (
          <li key={id} className="row" style={{ padding: '12px 0', borderTop: i ? '1px solid rgba(247,243,233,0.12)' : 0 }}>
            <Avatar id={id} name={nameOf(id)} size="sm" />
            <span style={{ flex: 1 }}>{nameOf(id)}{id === me.travellerId && ' (you)'}</span>
            <span className="strong">{inr(booking.perMemberInr)}</span>
          </li>
        ))}
      </ul>

      <p className="small" style={{ color: 'var(--seafoam-soft)' }}>
        Booked by {nameOf(booking.bookedBy)} on {fmtDateLong(booking.createdAt.slice(0, 10))}. Bookings can't be changed or cancelled.
      </p>
    </section>
  );
}
