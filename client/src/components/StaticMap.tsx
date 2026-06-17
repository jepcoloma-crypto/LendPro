import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png' });

interface StaticMapProps {
  latitude: number;
  longitude: number;
  label?: string;
}

export const StaticMap = ({ latitude, longitude, label }: StaticMapProps) => {
  const center: [number, number] = [Number(latitude), Number(longitude)];
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <MapContainer center={center} zoom={15} className="h-[250px] w-full" scrollWheelZoom={false} dragging={false} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' />
        <Marker position={center} />
      </MapContainer>
      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500">
        {Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}{label ? ` — ${label}` : ''}
      </div>
    </div>
  );
};
