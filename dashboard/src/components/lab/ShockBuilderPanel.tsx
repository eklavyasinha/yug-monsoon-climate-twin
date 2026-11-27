import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Download,
  Info,
  Upload,
} from 'lucide-react';
import { CHANNELS } from '../../config/projectFacts';
import { createDivergingDifferenceScale } from '../../utils/colorScales';
import { triggerClientFileDownload } from '../../utils/exportData';
import {
  cloneShockConfig,
  getShockPresetById,
  MAX_SHOCK_FILE_BYTES,
  parseAndValidateShockConfigJson,
  serializeShockConfigJson,
  SHOCK_PRESETS,
  type BuiltPerturbationResult,
  type ChannelKey,
  type ShockConfig,
  type ShockFootprintType,
} from '../../utils/shockBuilder';
import { SyncFieldCanvas } from './SyncFieldCanvas';

interface ShockBuilderPanelProps {
  config: ShockConfig;
  onChange: (next: ShockConfig) => void;
  built: BuiltPerturbationResult;
  lat: readonly number[];
  lon: readonly number[];
  landSeaMask?: number[][];
}

export function ShockBuilderPanel({
  config,
  onChange,
  built,
  lat,
  lon,
  landSeaMask,
}: ShockBuilderPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const firstEnabledChannel: ChannelKey =
    config.channels.find((c) => c.enabled)?.channel ?? 't2m';
  const [previewChannel, setPreviewChannel] =
    useState<ChannelKey>(firstEnabledChannel);

  const effectivePreviewChannel: ChannelKey = useMemo(() => {
    const enabledKeys = config.channels
      .filter((c) => c.enabled)
      .map((c) => c.channel);
    if (enabledKeys.length === 0) return previewChannel;
    return enabledKeys.includes(previewChannel) ? previewChannel : enabledKeys[0];
  }, [config.channels, previewChannel]);

  const previewMeta =
    CHANNELS.find((c) => c.key === effectivePreviewChannel) ?? CHANNELS[0];

  const previewScale = useMemo(() => {
    const maxAbs = built.maxAbsByChannel[effectivePreviewChannel] ?? 0;
    const limit = maxAbs > 1e-6 ? maxAbs : 1;
    return createDivergingDifferenceScale([-limit, limit]);
  }, [built.maxAbsByChannel, effectivePreviewChannel]);

  const activePresetMeta = getShockPresetById(config.presetId);

  const handleSelectPreset = (
    presetId: (typeof SHOCK_PRESETS)[number]['id'],
  ) => {
    const preset = SHOCK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setImportErrors([]);
    setImportNotice(null);
    onChange(cloneShockConfig(preset.config));
  };

  const handleFootprintTypeChange = (footprintType: ShockFootprintType) => {
    onChange({
      ...config,
      presetId: config.presetId === 'control_zero' ? 'custom' : config.presetId,
      footprintType,
    });
  };

  const handleBoxField = (
    field: 'latMin' | 'latMax' | 'lonMin' | 'lonMax',
    rawValue: string,
  ) => {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    onChange({
      ...config,
      box: { ...config.box, [field]: num },
    });
  };

  const handleGaussianField = (
    field: 'centerLat' | 'centerLon' | 'radiusDeg' | 'cutoffSigmas',
    rawValue: string,
  ) => {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    onChange({
      ...config,
      gaussian: { ...config.gaussian, [field]: num },
    });
  };

  const handleChannelToggle = (channel: ChannelKey, enabled: boolean) => {
    const nextChannels = config.channels.map((entry) =>
      entry.channel === channel
        ? {
            ...entry,
            enabled,
            peakDelta:
              enabled && entry.peakDelta === 0
                ? channel === 't2m'
                  ? 2.0
                  : channel === 'u10'
                    ? -2.0
                    : 1.0
                : entry.peakDelta,
          }
        : entry,
    );
    const anyEnabled = nextChannels.some((c) => c.enabled && c.peakDelta !== 0);
    onChange({
      ...config,
      presetId: anyEnabled
        ? config.presetId === 'control_zero'
          ? 'custom'
          : config.presetId
        : 'control_zero',
      channels: nextChannels,
    });
    if (enabled) setPreviewChannel(channel);
  };

  const handleChannelMagnitude = (channel: ChannelKey, rawValue: string) => {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    const nextChannels = config.channels.map((entry) =>
      entry.channel === channel ? { ...entry, peakDelta: num } : entry,
    );
    onChange({
      ...config,
      channels: nextChannels,
    });
  };

  const handleExportJson = () => {
    try {
      const json = serializeShockConfigJson(config);
      const slug = config.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      triggerClientFileDownload(
        json,
        `monsoon-shock-${slug || 'config'}.json`,
        'application/json;charset=utf-8',
      );
      setImportErrors([]);
      setImportNotice('Exported validated mom-shock-v1 JSON locally.');
    } catch (err) {
      setImportErrors([
        err instanceof Error
          ? err.message
          : 'Cannot export invalid shock config.',
      ]);
    }
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErrors([]);
    setImportNotice(null);

    if (file.size > MAX_SHOCK_FILE_BYTES) {
      setImportErrors([
        `File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 1 MB maximum size limit.`,
      ]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseAndValidateShockConfigJson(text, file.size);
      if (!parsed.ok) {
        setImportErrors(parsed.errors);
      } else {
        onChange(parsed.config);
        setImportNotice(
          `Imported validated shock config "${parsed.config.name}".`,
        );
      }
    } catch {
      setImportErrors(['Could not read imported shock JSON file.']);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <section
      aria-labelledby="shock-builder-heading"
      className="instrument-plane rounded-xs divide-y divide-[#1E2F4A]"
    >
      {/* Top Instrument Bar + Import / Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#08101D]">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="shock-builder-heading"
              className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#E6EDF7]"
            >
              Perturbation Configuration
            </h2>
            <span className="font-mono text-[11px] text-[#5CC8E0]">
              · [6, 32, 36] Physical Delta
            </span>
          </div>
          <p className="text-xs text-[#93A4BD] max-w-3xl">
            Additive delta applied to{' '}
            <code className="font-mono text-[#BFE6F2]">init_states[-1]</code> in
            raw physical wire units. Presets are exploratory live-demo starting
            points, not guaranteed equivalents of hidden challenge shocks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleImportFile(e)}
            className="sr-only"
            id="shock-json-import-input"
            aria-label="Import shock configuration JSON file (max 1 MB)"
          />
          <label
            htmlFor="shock-json-import-input"
            className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-3 py-1.5 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Import JSON (≤1 MB)</span>
          </label>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-3 py-1.5 font-mono text-xs text-[#E6EDF7] hover:border-[#5CC8E0] hover:text-[#BFE6F2] transition-colors duration-150 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* 01 · Horizontal Hairline Preset Rack */}
      <div className="divide-y divide-[#1E2F4A]">
        <div
          role="group"
          aria-label="Shock presets"
          className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1E2F4A]"
        >
          {SHOCK_PRESETS.map((preset) => {
            const active = config.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectPreset(preset.id)}
                className={`relative text-left px-4 py-3.5 transition-colors duration-150 space-y-1 ${
                  active
                    ? 'bg-[#142238] text-[#E6EDF7]'
                    : 'bg-[#08101D] hover:bg-[#0E1829]'
                }`}
              >
                {active && (
                  <span
                    className="absolute inset-x-0 top-0 h-0.5 bg-[#5CC8E0]"
                    aria-hidden="true"
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs font-semibold text-[#E6EDF7]">
                    {preset.label}
                  </p>
                  {active && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#5CC8E0]">
                      ● Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#93A4BD] leading-relaxed">
                  {preset.shortSummary}
                </p>
              </button>
            );
          })}
        </div>

        {activePresetMeta && (
          <div className="bg-[#060B14] px-5 py-2.5 text-xs flex flex-wrap gap-x-6 gap-y-1">
            <p className="text-[#93A4BD]">
              <strong className="font-mono text-[#F2A93B]">
                Preset disclosure:
              </strong>{' '}
              {activePresetMeta.scientificDisclaimer}
            </p>
            {activePresetMeta.windNote && (
              <p className="text-[#BFE6F2]">
                <strong className="font-mono text-[#5CC8E0]">
                  Wind component note:
                </strong>{' '}
                {activePresetMeta.windNote}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Builder Split: Left 7 cols Parameters | Right 5 cols Live Perturbation Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#1E2F4A]">
        <div className="lg:col-span-7 divide-y divide-[#1E2F4A]">
          {/* 02 · Spatial Footprint Geometry */}
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-[#BFE6F2]">
                02 · Spatial footprint geometry
              </span>
              <div
                role="group"
                aria-label="Footprint shape"
                className="inline-flex rounded-xs border border-[#1E2F4A] bg-[#060B14] p-0.5 font-mono text-xs"
              >
                <button
                  type="button"
                  aria-pressed={config.footprintType === 'box'}
                  onClick={() => handleFootprintTypeChange('box')}
                  className={`min-h-[32px] px-3 py-1 rounded-xs transition-colors ${
                    config.footprintType === 'box'
                      ? 'bg-[#142238] text-[#5CC8E0] font-semibold'
                      : 'text-[#93A4BD] hover:text-[#E6EDF7]'
                  }`}
                >
                  Lat/Lon Box
                </button>
                <button
                  type="button"
                  aria-pressed={config.footprintType === 'gaussian'}
                  onClick={() => handleFootprintTypeChange('gaussian')}
                  className={`min-h-[32px] px-3 py-1 rounded-xs transition-colors ${
                    config.footprintType === 'gaussian'
                      ? 'bg-[#142238] text-[#5CC8E0] font-semibold'
                      : 'text-[#93A4BD] hover:text-[#E6EDF7]'
                  }`}
                >
                  Gaussian
                </button>
              </div>
            </div>

            {config.footprintType === 'box' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-xs">
                <label className="space-y-1">
                  <span className="text-[#93A4BD]">Lat min (°N)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={config.box.latMin}
                    onChange={(e) => handleBoxField('latMin', e.target.value)}
                    className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#93A4BD]">Lat max (°N)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={config.box.latMax}
                    onChange={(e) => handleBoxField('latMax', e.target.value)}
                    className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#93A4BD]">Lon min (°E)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={config.box.lonMin}
                    onChange={(e) => handleBoxField('lonMin', e.target.value)}
                    className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[#93A4BD]">Lon max (°E)</span>
                  <input
                    type="number"
                    step="0.5"
                    value={config.box.lonMax}
                    onChange={(e) => handleBoxField('lonMax', e.target.value)}
                    className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 font-mono text-xs">
                  <label className="space-y-1">
                    <span className="text-[#93A4BD]">Centre lat (°N)</span>
                    <input
                      type="number"
                      step="0.5"
                      value={config.gaussian.centerLat}
                      onChange={(e) =>
                        handleGaussianField('centerLat', e.target.value)
                      }
                      className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#93A4BD]">Centre lon (°E)</span>
                    <input
                      type="number"
                      step="0.5"
                      value={config.gaussian.centerLon}
                      onChange={(e) =>
                        handleGaussianField('centerLon', e.target.value)
                      }
                      className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#93A4BD]">Radius σ (deg)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="25"
                      value={config.gaussian.radiusDeg}
                      onChange={(e) =>
                        handleGaussianField('radiusDeg', e.target.value)
                      }
                      className="w-full min-h-[36px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2.5 text-[#E6EDF7] tabular-nums focus:border-[#5CC8E0]"
                    />
                  </label>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-[#93A4BD] leading-relaxed">
                  <Info
                    className="h-3.5 w-3.5 text-[#5CC8E0] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    Gaussian weight{' '}
                    <code className="font-mono text-[#BFE6F2]">
                      exp(−d² / (2σ²))
                    </code>{' '}
                    using equirectangular cosine-corrected distance{' '}
                    <code className="font-mono text-[#BFE6F2]">
                      d = hypot(Δlat, Δlon·cos(lat₀))
                    </code>{' '}
                    (cells beyond {config.gaussian.cutoffSigmas}σ receive exact
                    0; diagnostics footprint outline marks 2σ).
                  </span>
                </p>
              </div>
            )}

            <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums">
              Footprint encloses{' '}
              <span className="text-[#E6EDF7]">{built.selectedCellCount}</span>{' '}
              grid cell(s) of 1,152 · Outside cells receive exact 0.
            </p>
          </div>

          {/* 03 · Target Channels & Physical Magnitudes */}
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-[#BFE6F2]">
                03 · Target channels &amp; peak perturbation (physical wire units)
              </span>
              <span className="font-mono text-[11px] text-[#93A4BD]">
                {built.isAllZero ? 'All-zero tensor' : 'Non-zero shock'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 border border-[#1E2F4A] bg-[#060B14] divide-y sm:divide-y-0 sm:gap-px sm:bg-[#1E2F4A]">
              {config.channels.map((entry) => {
                const chMeta = CHANNELS.find((c) => c.key === entry.channel)!;
                return (
                  <div
                    key={entry.channel}
                    className={`px-3 py-2.5 flex items-center justify-between gap-2.5 transition-colors ${
                      entry.enabled ? 'bg-[#142238]' : 'bg-[#08101D]'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(e) =>
                          handleChannelToggle(entry.channel, e.target.checked)
                        }
                        className="h-4 w-4 accent-[#5CC8E0] shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-xs font-semibold text-[#E6EDF7]">
                          {chMeta.key}
                        </span>
                        <span className="block text-[11px] text-[#93A4BD] truncate">
                          {chMeta.name}
                        </span>
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        step={entry.channel === 'msl' ? '50' : '0.5'}
                        disabled={!entry.enabled}
                        aria-label={`Peak perturbation for ${chMeta.key} in ${chMeta.unit}`}
                        value={entry.peakDelta}
                        onChange={(e) =>
                          handleChannelMagnitude(entry.channel, e.target.value)
                        }
                        className="w-20 min-h-[34px] rounded-xs border border-[#1E2F4A] bg-[#060B14] px-2 text-right font-mono text-xs text-[#E6EDF7] tabular-nums disabled:opacity-40 focus:border-[#5CC8E0]"
                      />
                      <span className="font-mono text-[11px] text-[#BFE6F2] w-12">
                        {chMeta.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 5 cols: Live Perturbation Preview Map */}
        <div className="lg:col-span-5 bg-[#050A12] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2F4A] pb-2.5">
            <label className="inline-flex items-center gap-2 font-mono text-xs text-[#93A4BD]">
              <span>Preview</span>
              <select
                aria-label="Preview perturbation channel"
                value={effectivePreviewChannel}
                onChange={(e) =>
                  setPreviewChannel(e.target.value as ChannelKey)
                }
                className="min-h-[34px] rounded-xs border border-[#1E2F4A] bg-[#08101D] px-2 text-xs font-mono text-[#E6EDF7]"
              >
                {CHANNELS.map((ch) => (
                  <option key={ch.key} value={ch.key}>
                    {ch.key} ({ch.unit})
                  </option>
                ))}
              </select>
            </label>
            <span className="font-mono text-[11px] text-[#BFE6F2] tabular-nums">
              Peak |Δ|:{' '}
              {(built.maxAbsByChannel[effectivePreviewChannel] ?? 0).toFixed(2)}{' '}
              {previewMeta.unit}
            </span>
          </div>

          <SyncFieldCanvas
            displayGrid={built.previewGrids[effectivePreviewChannel]}
            lat={lat}
            lon={lon}
            landSeaMask={landSeaMask}
            colorScale={previewScale}
            unitLabel={previewMeta.unit}
            decimals={2}
            signed
            title={`Perturbation Preview — ${previewMeta.key} (${previewMeta.unit})`}
            ariaLabel={`32 by 36 discrete perturbation preview for ${previewMeta.key}`}
            testId="shock-preview-canvas"
            footprintMask={built.footprintMask}
            compact
          />
        </div>
      </div>

      {/* Validation & Import feedback */}
      {importNotice && (
        <div
          role="status"
          className="bg-[#08101D] px-5 py-2.5 font-mono text-xs text-[#5FC9A0]"
        >
          {importNotice}
        </div>
      )}

      {(importErrors.length > 0 || !built.ok) && (
        <div
          role="alert"
          data-testid="shock-validation-errors"
          className="bg-[#142238] px-5 py-3.5 space-y-1.5 text-xs text-[#E5646B]"
        >
          <div className="flex items-center gap-2 font-mono font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Shock configuration validation issue</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 font-mono text-[#E6EDF7]">
            {[...importErrors, ...built.validationErrors].map((msg, idx) => (
              <li key={`${idx}-${msg}`}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
