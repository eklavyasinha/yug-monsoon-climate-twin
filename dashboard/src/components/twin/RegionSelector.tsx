import { useState, type FormEvent } from 'react';
import { PRESET_REGIONS, type GeoRegion } from '../../utils/aggregation';

interface RegionSelectorProps {
  selectedRegion: GeoRegion;
  onSelectRegion: (region: GeoRegion) => void;
  latMinLimit: number;
  latMaxLimit: number;
  lonMinLimit: number;
  lonMaxLimit: number;
}

export function RegionSelector({
  selectedRegion,
  onSelectRegion,
  latMinLimit,
  latMaxLimit,
  lonMinLimit,
  lonMaxLimit,
}: RegionSelectorProps) {
  const [latMinStr, setLatMinStr] = useState(String(selectedRegion.latMin));
  const [latMaxStr, setLatMaxStr] = useState(String(selectedRegion.latMax));
  const [lonMinStr, setLonMinStr] = useState(String(selectedRegion.lonMin));
  const [lonMaxStr, setLonMaxStr] = useState(String(selectedRegion.lonMax));
  const [error, setError] = useState<string | null>(null);

  const handlePresetChange = (presetId: string) => {
    const preset = PRESET_REGIONS.find((r) => r.id === presetId);
    if (!preset) return;
    setError(null);
    setLatMinStr(String(preset.latMin));
    setLatMaxStr(String(preset.latMax));
    setLonMinStr(String(preset.lonMin));
    setLonMaxStr(String(preset.lonMax));
    onSelectRegion(preset);
  };

  const handleApplyCustom = (event: FormEvent) => {
    event.preventDefault();
    const la0 = Number(latMinStr);
    const la1 = Number(latMaxStr);
    const lo0 = Number(lonMinStr);
    const lo1 = Number(lonMaxStr);

    if (
      !Number.isFinite(la0) ||
      !Number.isFinite(la1) ||
      !Number.isFinite(lo0) ||
      !Number.isFinite(lo1)
    ) {
      setError('Enter finite numeric latitude and longitude bounds.');
      return;
    }
    if (la0 >= la1 || lo0 >= lo1) {
      setError('Minimum latitude/longitude must be strictly less than maximum.');
      return;
    }
    if (
      la0 < latMinLimit ||
      la1 > latMaxLimit ||
      lo0 < lonMinLimit ||
      lo1 > lonMaxLimit
    ) {
      setError(
        `Bounds must stay within grid extent ${latMinLimit.toFixed(1)}–${latMaxLimit.toFixed(1)}°N, ${lonMinLimit.toFixed(1)}–${lonMaxLimit.toFixed(1)}°E.`,
      );
      return;
    }

    setError(null);
    onSelectRegion({
      id: 'custom',
      label: `Custom box (${la0.toFixed(1)}–${la1.toFixed(1)}°N, ${lo0.toFixed(1)}–${lo1.toFixed(1)}°E)`,
      note: 'User-defined lat/lon bounding box',
      latMin: la0,
      latMax: la1,
      lonMin: lo0,
      lonMax: lo1,
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label
          htmlFor="region-preset-select"
          className="block font-mono text-[11px] text-[#93A4BD]"
        >
          Selected analysis region
        </label>
        <select
          id="region-preset-select"
          value={
            PRESET_REGIONS.some((r) => r.id === selectedRegion.id)
              ? selectedRegion.id
              : 'custom'
          }
          onChange={(e) => handlePresetChange(e.target.value)}
          className="w-full min-h-[38px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-xs font-mono text-[#E6EDF7]"
        >
          {PRESET_REGIONS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          {selectedRegion.id === 'custom' && (
            <option value="custom">{selectedRegion.label}</option>
          )}
        </select>
      </div>

      <form onSubmit={handleApplyCustom} className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
          <label className="space-y-1">
            <span className="text-[#93A4BD]">Lat min (°N)</span>
            <input
              type="number"
              step="0.5"
              value={latMinStr}
              onChange={(e) => setLatMinStr(e.target.value)}
              className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-xs text-[#E6EDF7] tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[#93A4BD]">Lat max (°N)</span>
            <input
              type="number"
              step="0.5"
              value={latMaxStr}
              onChange={(e) => setLatMaxStr(e.target.value)}
              className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-xs text-[#E6EDF7] tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[#93A4BD]">Lon min (°E)</span>
            <input
              type="number"
              step="0.5"
              value={lonMinStr}
              onChange={(e) => setLonMinStr(e.target.value)}
              className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-xs text-[#E6EDF7] tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[#93A4BD]">Lon max (°E)</span>
            <input
              type="number"
              step="0.5"
              value={lonMaxStr}
              onChange={(e) => setLonMaxStr(e.target.value)}
              className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-xs text-[#E6EDF7] tabular-nums"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="font-mono text-xs text-[#E5646B]">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full min-h-[38px] rounded-xs border border-[#1E2F4A] bg-[#142238] px-3 text-xs font-mono text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors duration-150"
        >
          Apply custom lat/lon box
        </button>
      </form>
    </div>
  );
}
