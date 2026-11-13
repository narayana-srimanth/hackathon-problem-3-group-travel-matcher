import { useState, type ReactNode } from 'react';
import { useDestinations } from '../api/hooks';

// City photos, in order of preference:
//   1. cities[].image from GET /meta/destinations (the backend serves /static/cities/<city>.jpg)
//   2. public/cities/<city>.jpg, e.g. public/cities/abu-dhabi.jpg (optional, add your own)
//   3. a clean colour block
const slug = (city: string) => city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function useCityImages(city: string): string[] {
  const { data } = useDestinations();
  const known = data?.cities.find((c) => c.name === city);
  if (!known) return []; // e.g. the "Your destination" placeholder in the create-trip preview
  return [known.image, `/cities/${slug(city)}.jpg`].filter((x): x is string => !!x);
}

// A palette colour per city, so cards without a photo still differ.
const TONES = ['#34515B', '#1F3138', '#2B4A52', '#3E5F68'];
function tone(city: string) {
  let h = 0;
  for (const ch of city) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

// The photo to show for a city right now, and what to call when it fails to load
// (moves on to the next candidate; undefined once all have failed → show the colour block).
export function useCityPhoto(city: string): { src: string | undefined; onError: () => void } {
  const images = useCityImages(city);
  // How many candidates failed to load, for this city (resets when the city changes)
  const [failed, setFailed] = useState({ city, count: 0 });
  const count = failed.city === city ? failed.count : 0;
  return { src: images[count], onError: () => setFailed({ city, count: count + 1 }) };
}

export function CityBanner({ city, children, height = 180 }: { city: string; children?: ReactNode; height?: number }) {
  const { src: image, onError } = useCityPhoto(city);
  return (
    <div className="city-banner" style={{ height, background: tone(city) }}>
      {image && (
        <>
          <img key={image} className="photo" src={image} alt="" onError={onError} />
          <span className="shade" />
        </>
      )}
      <span className="city-name">{city}</span>
      {children}
    </div>
  );
}
