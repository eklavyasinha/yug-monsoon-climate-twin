import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Trash2, XCircle } from 'lucide-react';
import {
  formatCalendarDate,
  formatForecastWindow,
} from '../utils/forecastDates';
import {
  MAX_IC_FILE_BYTES,
  parseAndValidateMomIcJson,
} from '../utils/icSchema';
import { useAppData } from '../context/AppDataContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function IcFileDropzone() {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { loadedIc, setLoadedIc, setLastContractTest } = useAppData();

  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [rejectedFileName, setRejectedFileName] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setValidationErrors([]);
    setRejectedFileName(null);

    if (file.size > MAX_IC_FILE_BYTES) {
      setRejectedFileName(file.name);
      setValidationErrors([
        `File "${file.name}" (${formatBytes(file.size)}) exceeds the ${(MAX_IC_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB limit for mom-ic-v1 files.`,
      ]);
      return;
    }

    setIsReading(true);
    try {
      const rawText = await file.text();
      const result = parseAndValidateMomIcJson(rawText, {
        fileName: file.name,
        fileSizeBytes: file.size,
      });

      if (!result.ok) {
        setRejectedFileName(file.name);
        setValidationErrors(result.errors);
        return;
      }

      setLoadedIc({
        data: result.data,
        summary: result.summary,
        loadedAtIso: new Date().toISOString(),
      });
      setLastContractTest(null);
    } catch {
      setRejectedFileName(file.name);
      setValidationErrors(['Could not read the selected file from disk.']);
    } finally {
      setIsReading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleClear = () => {
    setLoadedIc(null);
    setLastContractTest(null);
    setValidationErrors([]);
    setRejectedFileName(null);
  };

  const forecastWindow = loadedIc
    ? formatForecastWindow(loadedIc.summary.initDateIso, 10)
    : null;

  return (
    <div className="space-y-3.5">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xs border border-dashed p-5 transition-colors duration-150 ${
          isDragging
            ? 'border-[#5CC8E0] bg-[#142238]'
            : 'border-[#2B4264] bg-[#060B14] hover:border-[#5CC8E0]/60'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-[#E6EDF7]">
              <FileUp className="h-4 w-4 text-[#5CC8E0] shrink-0" aria-hidden="true" />
              <span>Load local mom-ic-v1 initial-conditions JSON</span>
            </div>
            <p className="text-xs text-[#93A4BD] leading-relaxed max-w-xl">
              Drag and drop a validated <code className="font-mono text-[#BFE6F2]">mom-ic-v1</code> JSON
              file here, or select one from your computer. Files remain strictly in browser
              memory and are only sent to your configured backend when you run a simulation.
            </p>
            <p className="font-mono text-[11px] text-[#93A4BD] tabular-nums">
              Required shape: [3, 6, 32, 36] · Channels: t2m, tp, u10, v10, msl, tcwv · Max 5 MB
            </p>
          </div>

          <div className="shrink-0">
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Choose mom-ic-v1 initial-conditions JSON file"
            />
            <label
              htmlFor={inputId}
              className="inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-xs border border-[#5CC8E0] bg-[#142238] px-4 py-2 text-xs font-mono font-medium text-[#BFE6F2] hover:bg-[#5CC8E0] hover:text-[#08101D] transition-colors duration-150 whitespace-nowrap"
            >
              {isReading ? 'Validating…' : 'Choose JSON file'}
            </label>
          </div>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div
          role="alert"
          className="rounded-xs border border-[#E5646B] bg-[#142238] p-4 space-y-2"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E5646B]">
            <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Validation failed{rejectedFileName ? ` for ${rejectedFileName}` : ''}
            </span>
          </div>
          <ul className="list-disc pl-5 space-y-1 font-mono text-xs text-[#E6EDF7]">
            {validationErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
          <p className="text-xs text-[#93A4BD]">
            No data was altered or loaded. Fix the file against the mom-ic-v1 schema and retry.
          </p>
        </div>
      )}

      {loadedIc && (
        <div className="rounded-xs border border-[#5FC9A0]/45 bg-[#08101D] p-4 space-y-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E2F4A] pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#5FC9A0]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Valid mom-ic-v1 loaded</span>
              </div>
              <p className="text-sm text-[#E6EDF7] font-medium">
                {loadedIc.summary.label}
              </p>
              <p className="text-xs text-[#93A4BD]">
                {loadedIc.summary.sourceNote}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xs border border-[#1E2F4A] bg-[#060B14] px-3 py-1.5 text-xs font-mono text-[#93A4BD] hover:border-[#E5646B] hover:text-[#E5646B] transition-colors duration-150 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Unload file</span>
            </button>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 font-mono text-xs tabular-nums">
            <div className="space-y-0.5">
              <dt className="text-[#93A4BD]">File / Size</dt>
              <dd className="text-[#E6EDF7] truncate" title={loadedIc.summary.fileName}>
                {loadedIc.summary.fileName} ({formatBytes(loadedIc.summary.fileSizeBytes)})
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[#93A4BD]">Initialization date</dt>
              <dd
                className={
                  loadedIc.summary.initDateIso ? 'text-[#5CC8E0]' : 'text-[#93A4BD]'
                }
              >
                {loadedIc.summary.initDateIso
                  ? `${formatCalendarDate(loadedIc.summary.initDateIso, 'long')} (${loadedIc.summary.initDateIso})`
                  : 'Not specified in IC metadata'}
              </dd>
              {forecastWindow && (
                <p className="text-[10px] text-[#93A4BD]">
                  10-day window: {forecastWindow}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <dt className="text-[#93A4BD]">Tensor shape</dt>
              <dd className="text-[#E6EDF7]">
                [{loadedIc.summary.shape.join(', ')}]
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[#93A4BD]">Latitude orientation</dt>
              <dd className="text-[#E6EDF7]">
                {loadedIc.summary.latOrientation} ({loadedIc.summary.latRange[0].toFixed(1)}° →{' '}
                {loadedIc.summary.latRange[1].toFixed(1)}°)
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[#93A4BD]">Longitude / Mask</dt>
              <dd className="text-[#E6EDF7]">
                {loadedIc.summary.lonRange[0].toFixed(1)}° → {loadedIc.summary.lonRange[1].toFixed(1)}° ·{' '}
                {loadedIc.summary.hasLandSeaMask ? 'mask present' : 'no mask'}
              </dd>
            </div>
          </dl>

          {loadedIc.summary.warnings.length > 0 && (
            <div
              role="status"
              className="rounded-xs border border-[#F2A93B]/60 bg-[#0E1829] p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F2A93B]">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Plausibility &amp; orientation warnings ({loadedIc.summary.warnings.length})
                </span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-[#E6EDF7]">
                {loadedIc.summary.warnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
