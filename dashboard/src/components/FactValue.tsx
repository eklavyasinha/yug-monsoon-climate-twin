import { formatFactOrPlaceholder } from '../config/projectFacts';

interface FactValueProps {
  value: string | number | null | undefined;
  unit?: string;
  mono?: boolean;
  className?: string;
}

export function FactValue({
  value,
  unit,
  mono = false,
  className = '',
}: FactValueProps) {
  const formatted = formatFactOrPlaceholder(value, unit);

  if (formatted.isPlaceholder) {
    return (
      <span
        className={`font-mono text-xs tracking-wide text-[#F2A93B] ${className}`}
      >
        {formatted.text}
      </span>
    );
  }

  return (
    <span
      className={`${mono ? 'font-mono tabular-nums' : ''} text-[#E6EDF7] ${className}`}
    >
      {formatted.text}
    </span>
  );
}
