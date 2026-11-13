import { useState } from 'react';
import { useHotels, useSaveOption } from '../../api/hooks';
import type { HotelFilters } from '../../api/endpoints';
import { ROOM_TYPES, type Group, type RoomType } from '../../api/types';
import { errorMessage } from '../../lib/errors';
import { fmtRange, inr, plural, roomTypeLabel } from '../../lib/format';
import { useToast } from '../../components/Toasts';
import { ErrorBox, Icon, Pager, Spinner } from '../../components/ui';

/** M6 hotel search (E21). Always uses the group's own city and dates; all prices from the server. */
export function HotelsPanel({ group, onSaved }: { group: Group; onSaved: () => void }) {
  const [f, setF] = useState<HotelFilters>({ sort: 'perMember', planFor: 'CURRENT', page: 1, limit: 10 });
  const set = (patch: Partial<HotelFilters>) => setF((cur) => ({ ...cur, ...patch, page: 1 }));
  const { data, isLoading, isError, error, refetch, isFetching } = useHotels(group.groupId, f, true);
  const save = useSaveOption(group.groupId);
  const toast = useToast();
  const booked = group.status === 'BOOKED';

  return (
    <div className="stack">
      <div className="card tight row" style={{ ['--row-gap' as string]: '10px' }}>
        <span className="strong">Searching for the group</span>
        <span className="tag">{group.city}</span>
        <span className="tag">{fmtRange(group.checkIn, group.checkOut)}</span>
        <span className="tag">{plural(data?.context.partySize ?? (f.planFor === 'MAX' ? group.maxSize : group.memberCount), 'guest')}</span>
        {isFetching && !isLoading && <span className="tiny muted">updating…</span>}
      </div>

      <div className="row" style={{ ['--row-gap' as string]: '10px' }}>
        <Select label="Sort" value={f.sort ?? 'perMember'} onChange={(v) => set({ sort: v as HotelFilters['sort'] })}
          options={[['perMember', 'Cheapest per person'], ['rating', 'Best rated'], ['stars', 'Most stars']]} />
        <Select label="Stars" value={String(f.minStars ?? '')} onChange={(v) => set({ minStars: v ? Number(v) : undefined })}
          options={[['', 'Any stars'], ['3', '3+ stars'], ['4', '4+ stars'], ['5', '5 stars']]} />
        <Select label="Rating" value={String(f.minRating ?? '')} onChange={(v) => set({ minRating: v ? Number(v) : undefined })}
          options={[['', 'Any rating'], ['7', '7+'], ['8', '8+'], ['9', '9+']]} />
        <Select label="Room type" value={f.roomType ?? ''} onChange={(v) => set({ roomType: (v || undefined) as RoomType | undefined })}
          options={[['', 'Any room'], ...ROOM_TYPES.map((t) => [t, roomTypeLabel[t]] as [string, string])]} />
        <Select label="Price for" value={f.planFor ?? 'CURRENT'} onChange={(v) => set({ planFor: v as 'CURRENT' | 'MAX' })}
          options={[['CURRENT', `Current members (${group.memberCount})`], ['MAX', `Full group (${group.maxSize})`]]} />
        <label className="row" style={{ ['--row-gap' as string]: '6px' }}>
          <span className="small muted">Max ₹ / person</span>
          <input className="input" type="number" min={0} step={1000} style={{ width: 130, height: 40 }}
            value={f.maxPerMemberInr ?? ''} onChange={(e) => set({ maxPerMemberInr: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
      </div>

      {booked && <div className="alert info">Your group has booked. You can still browse, but saving is closed.</div>}
      {isLoading && <Spinner label="Finding hotels" />}
      {isError && <ErrorBox error={error} onRetry={() => refetch()} />}
      {data && data.total === 0 && (
        <div className="empty"><h3>No hotels with free rooms match</h3><p className="muted">Loosen the filters above.</p></div>
      )}

      {data?.items.map(({ hotel, options, cheapestPerMemberInr }) => (
        <article key={hotel.hotelId} className="card" style={{ padding: 0 }}>
          <div className="hotel">
            <img className="hotel-photo" src={hotel.image} alt={`${hotel.name}`} loading="lazy" />
            <div className="stack" style={{ flex: '1 1 260px', minWidth: 0, ['--gap' as string]: '6px' }}>
              <h3>{hotel.name}</h3>
              <span className="small muted">
                {hotel.area} · {'★'.repeat(hotel.stars)}<span className="sr-only">{hotel.stars} stars</span> · rated {hotel.rating}/10
              </span>
              <span className="tiny muted">Check-in from {hotel.checkInFrom} · check-out by {hotel.checkOutUntil}</span>
              <span className="small" style={{ marginTop: 'auto' }}>From <strong>{inr(cheapestPerMemberInr)}</strong> per person</span>
            </div>
          </div>
          <div style={{ padding: '0 18px 8px' }}>
            {options.map((o) => (
              <div key={o.roomId} className="room-row">
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <strong>{o.name}</strong>
                  <div className="tiny muted">
                    {roomTypeLabel[o.roomType]} · up to {o.maxAdults} · {plural(o.roomsNeeded, 'room')} × {plural(o.nights, 'night')} · {inr(o.pricePerNightInr)}/night
                    {o.refundable ? ' · refundable' : ' · non-refundable'}
                    {o.minRoomsLeft <= 2 && <span style={{ color: 'var(--danger)' }}> · only {o.minRoomsLeft} left</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="price-big">{inr(o.perMemberInr)}<span className="small muted" style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}> / person</span></div>
                  <div className="tiny muted">{inr(o.totalInr)} total · {o.budgetSharePct}% of budget</div>
                </div>
                {!booked && (o.savedOptionId ? (
                  <button className="btn sm ghost" onClick={onSaved}><Icon name="bookmark" size={16} /> Saved</button>
                ) : (
                  <button className="btn sm ocean" disabled={save.isPending && save.variables === o.roomId}
                    onClick={() => save.mutate(o.roomId, {
                      onSuccess: () => toast(`Saved ${o.name} at ${hotel.name} to the shortlist`),
                      onError: (e) => toast(errorMessage(e), 'error'),
                    })}>
                    <Icon name="bookmark" size={16} /> Save
                  </button>
                ))}
              </div>
            ))}
          </div>
        </article>
      ))}

      {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={(p) => setF((c) => ({ ...c, page: p }))} />}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select className="input" style={{ height: 40, width: 'auto', borderRadius: 999, fontSize: 14 }} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
