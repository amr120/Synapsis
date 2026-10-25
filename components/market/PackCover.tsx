// A generated cover for a knowledge pack: a small "synapse" network whose layout comes from the
// file's sha256 (so every file looks different and always the same) and whose tint comes from its
// category. No image assets needed for 100+ files.

const PALETTES: Record<string, [string, string, string]> = {
  "Life sciences": ["#e1f7f5", "#94c9c4", "#2f8a86"],
  "Policy & law": ["#edf1ff", "#a4b4e2", "#3d5aa8"],
  "AI & crypto": ["#eef6ff", "#8fb6e0", "#246bb1"],
  "Energy & climate": ["#eef8ef", "#a7cfa4", "#3f8a4a"],
  Engineering: ["#f3f1ec", "#c9b99a", "#7d6233"],
  Other: ["#eef4fa", "#a9bfd4", "#4a6f93"],
};

export function PackCover({ seed, category }: { seed: string; category: string }) {
  const [light, mid, dark] = PALETTES[category] ?? PALETTES.Other;
  const bytes = Array.from({ length: 32 }, (_, i) => parseInt(seed.slice(i * 2, i * 2 + 2) || "80", 16));
  const nodes = Array.from({ length: 9 }, (_, i) => ({
    x: 40 + (bytes[i * 3] / 255) * 300,
    y: 26 + (bytes[i * 3 + 1] / 255) * 148,
    r: 5 + (bytes[i * 3 + 2] / 255) * 9,
  }));
  // Connect each node to its two nearest neighbours: reads as a small neural network.
  const edges = new Set<string>();
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .filter((n) => n.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach(({ j }) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  const id = `g${seed.slice(0, 8)}`;
  return (
    <svg viewBox="0 0 380 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={mid} />
        </linearGradient>
        <radialGradient id={`${id}n`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <rect width="380" height="200" fill={`url(#${id})`} />
      {[...edges].map((e) => {
        const [a, b] = e.split("-").map(Number);
        return <line key={e} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="#ffffff" strokeOpacity="0.85" strokeWidth="3" strokeLinecap="round" />;
      })}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={`url(#${id}n)`} />
      ))}
    </svg>
  );
}
