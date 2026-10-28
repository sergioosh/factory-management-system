import { fmtQty } from "@/lib/format";

/** Dependency-free daily bar chart (server-renderable SVG). */
export function SparkBars({
  points,
  height = 120,
}: {
  points: { label: string; value: number }[];
  height?: number;
}) {
  const width = 560;
  const padL = 8;
  const padB = 16;
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerW = width - padL;
  const innerH = height - padB;
  const step = innerW / points.length;
  const barW = Math.max(3, step - 3);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      preserveAspectRatio="none"
      role="img"
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={padL}
          x2={width}
          y1={innerH - innerH * f}
          y2={innerH - innerH * f}
          stroke="var(--color-line)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}
      <line x1={padL} x2={width} y1={innerH} y2={innerH} stroke="var(--color-line-strong)" strokeWidth="1" />
      {points.map((p, i) => {
        const h = (p.value / max) * (innerH - 4);
        return (
          <g key={i}>
            <rect
              x={padL + i * step + (step - barW) / 2}
              y={innerH - h}
              width={barW}
              height={Math.max(h, p.value > 0 ? 2 : 0)}
              rx="1.5"
              fill="var(--color-accent)"
              opacity={p.value > 0 ? 0.9 : 0}
            />
            <title>{`${p.label}: ${fmtQty(p.value)}`}</title>
            {i % 5 === 0 && (
              <text
                x={padL + i * step + step / 2}
                y={height - 3}
                textAnchor="middle"
                fontSize="8.5"
                fill="var(--color-ink-faint)"
                fontFamily="var(--font-mono)"
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
