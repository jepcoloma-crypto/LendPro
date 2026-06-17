import { useEffect, useState, useRef } from 'react';
import { Button } from 'rsuite';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png' });

const defaultCenter: [number, number] = [14.5995, 120.9842];

export interface AddressDetails {
  display_name?: string;
  city?: string;
  province?: string;
}

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  address?: string;
  onChange: (lat: number, lng: number, details?: AddressDetails) => void;
}

const reverseGeocode = async (lat: number, lng: number): Promise<AddressDetails | undefined> => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' },
    });
    const data = await res.json();
    if (data && data.address) {
      return {
        display_name: data.display_name,
        city: data.address.city || data.address.town || data.address.municipality || data.address.village || '',
        province: data.address.state || data.address.region || '',
      };
    }
  } catch { /* ignore */ }
  return undefined;
};

const ClickHandler = ({ onLocationChange }: { onLocationChange: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const MapCenterUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
};

export const LocationPicker = ({ latitude, longitude, address, onChange }: LocationPickerProps) => {
  const [search, setSearch] = useState(address || '');
  const [searching, setSearching] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasPos = !!(latitude && longitude);
  const [center, setCenter] = useState<[number, number]>(hasPos ? [lat, lng] : defaultCenter);
  const markerPos: [number, number] | null = hasPos ? [lat, lng] : null;
  const lastReverse = useRef(0);

  useEffect(() => { if (hasPos) setCenter([lat, lng]); }, [lat, lng]);

  const handleLocationChange = async (newLat: number, newLng: number) => {
    setCenter([newLat, newLng]);
    setGeocoding(true);
    const now = Date.now();
    if (now - lastReverse.current >= 1100) {
      lastReverse.current = now;
      const details = await reverseGeocode(newLat, newLng);
      onChange(newLat, newLng, details);
    } else {
      onChange(newLat, newLng);
    }
    setGeocoding(false);
  };

  const handleMapClick = (lat: number, lng: number) => {
    handleLocationChange(lat, lng);
  };

  const handleDragEnd = (e: L.LeafletEvent) => {
    const pos = (e.target as L.Marker).getLatLng();
    handleLocationChange(pos.lat, pos.lng);
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.length > 0) {
        const r = data[0];
        const newLat = parseFloat(r.lat);
        const newLng = parseFloat(r.lon);
        setCenter([newLat, newLng]);
        onChange(newLat, newLng, {
          display_name: r.display_name,
          city: r.address?.city || r.address?.town || r.address?.municipality || r.address?.village || '',
          province: r.address?.state || r.address?.region || '',
        });
      }
    } catch { /* ignore */ }
    finally { setSearching(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="text" placeholder="Search for an address..." value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          className="rs-input flex-1" />
        <Button onClick={handleSearch} loading={searching} size="sm" appearance="primary">Search</Button>
        {geocoding && <span className="text-xs text-gray-400 self-center">Looking up address...</span>}
      </div>
      <div className="h-[300px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <MapContainer center={center} zoom={markerPos ? 16 : 12} className="h-full w-full" scrollWheelZoom={true}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' />
          <ClickHandler onLocationChange={handleMapClick} />
          <MapCenterUpdater center={center} />
          {markerPos && (
            <Marker position={markerPos} draggable eventHandlers={{ dragend: handleDragEnd }} />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-gray-400">Click the map to drop a pin, or drag the pin to adjust. Search above to find an address.</p>
    </div>
  );
};
