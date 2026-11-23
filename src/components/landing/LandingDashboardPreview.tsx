import { ArrowUpRight, BookOpen, Flame, Target, TrendingUp } from 'lucide-react';

const metrics = [
  { label: 'Questões resolvidas', value: '1.280', icon: BookOpen },
  { label: 'Taxa de acertos', value: '84%', icon: Target },
  { label: 'Sequência de estudos', value: '12 dias', icon: Flame },
];

const subjects = [
  { name: 'Matemática', progress: 88 },
  { name: 'Português', progress: 76 },
  { name: 'Raciocínio lógico', progress: 65 },
];

export function LandingDashboardPreview() {
  return (
    <div
      aria-label="Prévia ilustrativa do dashboard do QuestForge"
      className="qf-landing-card p-5 shadow-2xl shadow-blue-950/30 sm:p-6"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-sky-400">QUESTFORGE ANALYTICS</p>
          <h2 className="mt-1 text-lg font-bold text-white">Seu desempenho</h2>
          <p className="mt-1 text-xs text-slate-400">Uma visão clara da sua evolução</p>
        </div>
        <div className="rounded-xl bg-blue-500/10 p-3 text-sky-400">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-white/5 bg-slate-800/60 p-3"
          >
            <Icon className="mb-3 h-4 w-4 text-sky-400" aria-hidden="true" />
            <p className="text-lg font-bold text-white sm:text-xl">{value}</p>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-white/5 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">Evolução semanal</h3>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            Tendência positiva
          </span>
        </div>

        <svg
          viewBox="0 0 320 110"
          className="mt-4 h-auto w-full"
          role="img"
          aria-label="Gráfico ilustrativo de evolução crescente durante a semana"
        >
          {[25, 55, 85].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="320"
              y2={y}
              stroke="#334155"
              strokeDasharray="4 5"
            />
          ))}
          <path
            d="M0 89 L50 75 L105 82 L160 52 L215 62 L270 27 L320 14 L320 110 L0 110Z"
            fill="#38bdf8"
            fillOpacity="0.08"
          />
          <path
            d="M0 89 L50 75 L105 82 L160 52 L215 62 L270 27 L320 14"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Desempenho por disciplina</h3>
        {subjects.map(({ name, progress }) => (
          <div key={name}>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-slate-300">{name}</span>
              <span className="text-sky-300">{progress}%</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-slate-700"
              role="progressbar"
              aria-label={name}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-white/10 pt-3 text-[11px] text-slate-400">
        Prévia demonstrativa. Os números apresentados são fictícios.
      </p>
    </div>
  );
}
