import type { PrayerTimesData } from "./types";

interface SunArcProps {
  data: PrayerTimesData;
  activePrayerId?: string;
}

export function SunArc({ data, activePrayerId }: SunArcProps) {
  // Arc geometry
  const width = 260;
  const height = 70;
  const xStart = 15;
  const xEnd = 245;
  const yBase = 60;
  const yApex = 12;
  const hDiff = yBase - yApex;

  // Formula: y(t) = yBase - 4 * hDiff * t * (1 - t)
  function getY(t: number) {
    const clampedT = Math.max(0, Math.min(1, t));
    return yBase - 4 * hDiff * clampedT * (1 - clampedT);
  }

  function getX(t: number) {
    const clampedT = Math.max(0, Math.min(1, t));
    return xStart + clampedT * (xEnd - xStart);
  }

  // Prayer positions on the arc (Subuh, Dzuhur, Ashar, Maghrib, Isya)
  const prayerRatios = [
    { id: "Subuh", name: "Subuh", t: 0.03, time: data.subuh },
    { id: "Dzuhur", name: "Dzuhur", t: 0.48, time: data.dzuhur },
    { id: "Ashar", name: "Ashar", t: 0.66, time: data.ashar },
    { id: "Maghrib", name: "Maghrib", t: 0.88, time: data.maghrib },
    { id: "Isya", name: "Isya", t: 0.98, time: data.isya },
  ];

  const sunT = Math.max(0.01, Math.min(0.99, data.sunProgress));
  const sunX = getX(sunT);
  const sunY = getY(sunT);

  // Generate curve path samples for accurate segmented stroke & fill
  const steps = 40;
  const totalPoints: [number, number][] = [];
  const litPoints: [number, number][] = [];
  const unlitPoints: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt: [number, number] = [getX(t), getY(t)];
    totalPoints.push(pt);
    if (t <= sunT) {
      litPoints.push(pt);
    } else {
      if (unlitPoints.length === 0 && litPoints.length > 0) {
        unlitPoints.push([sunX, sunY]);
      }
      unlitPoints.push(pt);
    }
  }

  if (litPoints.length > 0) {
    litPoints.push([sunX, sunY]);
  }

  const litPathD =
    litPoints.length > 1
      ? `M ${litPoints.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}`
      : "";

  const unlitPathD =
    unlitPoints.length > 1
      ? `M ${unlitPoints.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}`
      : "";

  const fillAreaD =
    litPoints.length > 1
      ? `${litPathD} L ${sunX.toFixed(1)} ${yBase} L ${xStart} ${yBase} Z`
      : "";

  const currentNextId = activePrayerId || data.next.prayer.id;

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        <defs>
          {/* Subtle white glow underneath the active part of the sun arc */}
          <linearGradient id="sunArcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Clean white radial halo around the sun */}
          <radialGradient id="sunHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Shaded area under the active arc */}
        {fillAreaD && <path d={fillAreaD} fill="url(#sunArcFill)" />}

        {/* Subtle baseline */}
        <line
          x1={xStart}
          y1={yBase}
          x2={xEnd}
          y2={yBase}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
        />

        {/* Unlit arc path (ahead of sun) */}
        {unlitPathD && (
          <path
            d={unlitPathD}
            fill="none"
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        )}

        {/* Lit arc path (up to the current sun position) */}
        {litPathD && (
          <path
            d={litPathD}
            fill="none"
            stroke="var(--tint, #ffffff)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}

        {/* Prayer checkpoint dots along the arc */}
        {prayerRatios.map((p) => {
          const px = getX(p.t);
          const py = getY(p.t);
          const isPassed = p.t <= sunT;
          const isActive = p.id === currentNextId;

          return (
            <g key={p.id}>
              {/* Outer pulse if active */}
              {isActive && (
                <circle
                  cx={px}
                  cy={py}
                  r="5"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  opacity="0.7"
                />
              )}
              {/* Dot */}
              <circle
                cx={px}
                cy={py}
                r={isActive ? "2.8" : "2"}
                fill={isActive ? "#ffffff" : isPassed ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)"}
              />
            </g>
          );
        })}

        {/* The glowing Sun indicator */}
        <g transform={`translate(${sunX}, ${sunY})`}>
          {/* Outer glowing halo */}
          <circle cx="0" cy="0" r="14" fill="url(#sunHalo)" />
          {/* Subtle sun ring */}
          <circle cx="0" cy="0" r="5.5" fill="#ffffff" opacity="0.3" />
          {/* Bright center orb */}
          <circle cx="0" cy="0" r="3.5" fill="#ffffff" />
        </g>
      </svg>

      {/* Prayer times labels row below the baseline */}
      <div className="flex w-[240px] justify-between pt-1 text-center">
        {prayerRatios.map((p) => {
          const isNext = p.id === currentNextId;
          return (
            <div key={p.id} className="flex flex-col items-center">
              <span
                className={`text-[10px] tracking-tight ${
                  isNext ? "font-bold text-white" : "font-medium text-white/50"
                }`}
              >
                {p.name}
              </span>
              <span
                className={`tabular text-[10px] ${
                  isNext ? "font-bold text-white" : "text-white/40"
                }`}
              >
                {p.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
