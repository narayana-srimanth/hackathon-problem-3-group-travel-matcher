import { useInterests } from '../api/hooks';

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  legend: string;
  error?: string;
  size?: 'sm';
}

/** All 16 interests come from GET /meta/interests; nothing is hard-coded. */
export function InterestPicker({ value, onChange, legend, error, size }: Props) {
  const { data, isLoading, isError } = useInterests();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <fieldset>
      <legend>{legend}</legend>
      {isLoading && <span className="small muted">Loading interests…</span>}
      {isError && <span className="field-error">Couldn't load interests.</span>}
      <div className="chips">
        {data?.map((i) => (
          <button key={i.interest} type="button" className={`chip ${size ?? ''}`}
            aria-pressed={value.includes(i.interest)} onClick={() => toggle(i.interest)}>
            {i.label}
          </button>
        ))}
      </div>
      {error && <p className="field-error" style={{ marginTop: 8 }}>{error}</p>}
    </fieldset>
  );
}
