import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { supabase, supabaseConfigured } from '../../lib/supabase';

interface Season {
  id: string;
  name: string;
  total_rounds: number;
  is_active: boolean;
}

interface RoundInfo {
  id: string;
  round_number: number;
  round_date: string;
}

interface StandingRow {
  player_id: string;
  player_name: string;
  rounds_played: number;
  total_wins: number;
  total_losses: number;
  total_points: number;
}

interface RoundResultRow {
  player_name: string;
  wins: number;
  losses: number;
  points: number;
  paste_url: string | null;
}

type Tab = 'standings' | number;

const tabButtonClass = (active: boolean) =>
  'shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition-colors ' +
  (active ? 'bg-prank-purple text-white' : 'bg-prank-surface-2 text-white/60 hover:text-white');

// Cores em hex/rgba puro (não classes Tailwind) porque o html2canvas não entende
// as funções de cor modernas (oklch/color-mix) que o Tailwind v4 gera por padrão.
const EXPORT_COLORS = {
  bg: '#0b0710',
  border: '#e2b84b',
  divider: 'rgba(51, 32, 74, 0.7)',
  gold: '#e2b84b',
  purple: 'rgba(124, 58, 237, 0.35)',
  white: '#f5f3fa',
  muted: 'rgba(245, 243, 250, 0.45)',
  gold1: '#f4c430',
  silver: '#c9d3e0',
  bronze: '#b8722f',
  badgeText: '#1a1025',
};

interface ExportRow {
  name: string;
  points: number;
}

function medalStyle(position: number): CSSProperties {
  if (position === 0) return { backgroundColor: EXPORT_COLORS.gold1, color: EXPORT_COLORS.badgeText };
  if (position === 1) return { backgroundColor: EXPORT_COLORS.silver, color: EXPORT_COLORS.badgeText };
  if (position === 2) return { backgroundColor: EXPORT_COLORS.bronze, color: EXPORT_COLORS.badgeText };
  return { backgroundColor: 'rgba(124, 58, 237, 0.25)', color: EXPORT_COLORS.gold };
}

const ExportCard = ({ seasonName, etapaLabel, rows }: { seasonName: string; etapaLabel: string; rows: ExportRow[] }) => (
  <div
    style={{
      width: 440,
      backgroundColor: EXPORT_COLORS.bg,
      border: `2px solid ${EXPORT_COLORS.border}`,
      borderRadius: 24,
      padding: 28,
      fontFamily: 'Rajdhani, Arial, sans-serif',
    }}
  >
    <p
      style={{
        margin: 0,
        textAlign: 'center',
        fontSize: 12,
        letterSpacing: 4,
        textTransform: 'uppercase',
        color: EXPORT_COLORS.muted,
      }}
    >
      Team Pranksters
    </p>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 2,
          color: EXPORT_COLORS.gold,
        }}
      >
        Standings
      </h2>
      <span
        style={{
          borderRadius: 999,
          border: `1px solid ${EXPORT_COLORS.gold}`,
          backgroundColor: EXPORT_COLORS.purple,
          color: EXPORT_COLORS.white,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          padding: '4px 12px',
        }}
      >
        {etapaLabel}
      </span>
    </div>
    <p style={{ margin: '2px 0 0', textAlign: 'center', fontSize: 11, color: EXPORT_COLORS.muted }}>
      {seasonName}
    </p>

    <div
      style={{
        height: 1,
        margin: '16px 0',
        background: `linear-gradient(90deg, transparent, ${EXPORT_COLORS.gold}, transparent)`,
      }}
    />

    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px 8px',
        fontSize: 10,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: EXPORT_COLORS.muted,
      }}
    >
      <span style={{ width: 40 }}>Pos.</span>
      <span style={{ flex: 1 }}>Jogador</span>
      <span>Pontos</span>
    </div>

    <div>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 4px',
            borderTop: `1px solid ${EXPORT_COLORS.divider}`,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              ...medalStyle(i),
            }}
          >
            {i + 1}º
          </span>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: EXPORT_COLORS.white }}>{r.name}</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: EXPORT_COLORS.gold }}>{r.points}</span>
        </div>
      ))}
    </div>
  </div>
);

export default function LeagueTable() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [roundResults, setRoundResults] = useState<Record<number, RoundResultRow[]>>({});
  const [tab, setTab] = useState<Tab>('standings');
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setError('Site ainda sem conexão com o banco (configure as chaves do Supabase).');
      setLoadingSeasons(false);
      return;
    }

    (async () => {
      const { data, error: err } = await supabase
        .from('league_seasons')
        .select('id, name, total_rounds, is_active')
        .order('created_at', { ascending: false });

      if (err) {
        setError(err.message);
        setLoadingSeasons(false);
        return;
      }

      const list = (data as Season[]) ?? [];
      setSeasons(list);
      const initial = list.find((s) => s.is_active) ?? list[0];
      if (initial) setSelectedSeasonId(initial.id);
      setLoadingSeasons(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) return;
    setLoadingSeasonData(true);
    setTab('standings');

    (async () => {
      const [roundsRes, standingsRes, resultsRes] = await Promise.all([
        supabase
          .from('league_rounds')
          .select('id, round_number, round_date')
          .eq('season_id', selectedSeasonId)
          .order('round_number', { ascending: true }),
        supabase.from('league_standings').select('*').eq('season_id', selectedSeasonId),
        supabase
          .from('league_results')
          .select(
            'wins, losses, points, paste_url, league_players(name), league_rounds!inner(round_number, season_id)',
          )
          .eq('league_rounds.season_id', selectedSeasonId),
      ]);

      setRounds((roundsRes.data as RoundInfo[]) ?? []);
      setStandings((standingsRes.data as StandingRow[]) ?? []);

      const grouped: Record<number, RoundResultRow[]> = {};
      for (const row of (resultsRes.data as unknown as Array<{
        wins: number;
        losses: number;
        points: number;
        paste_url: string | null;
        league_players: { name: string } | null;
        league_rounds: { round_number: number } | null;
      }>) ?? []) {
        const roundNumber = row.league_rounds?.round_number;
        if (roundNumber == null) continue;
        if (!grouped[roundNumber]) grouped[roundNumber] = [];
        grouped[roundNumber].push({
          player_name: row.league_players?.name ?? '—',
          wins: row.wins,
          losses: row.losses,
          points: row.points,
          paste_url: row.paste_url,
        });
      }
      for (const key of Object.keys(grouped)) {
        grouped[Number(key)].sort(
          (a, b) => b.points - a.points || b.wins - a.wins || a.player_name.localeCompare(b.player_name, 'pt-BR'),
        );
      }
      setRoundResults(grouped);
      setLoadingSeasonData(false);
    })();
  }, [selectedSeasonId]);

  if (loadingSeasons) return <p className="text-white/50">Carregando...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (seasons.length === 0) return <p className="text-white/50">Nenhuma liga cadastrada ainda.</p>;

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);
  const etapaLabel = tab === 'standings' ? 'Geral' : `Rodada ${tab}`;
  const exportRows: ExportRow[] =
    tab === 'standings'
      ? standings.map((s) => ({ name: s.player_name, points: s.total_points }))
      : (roundResults[tab] ?? []).map((r) => ({ name: r.player_name, points: r.points }));

  async function handleExport() {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(exportRef.current, { backgroundColor: null, scale: 3 });
      const suffix = tab === 'standings' ? 'geral' : `rodada-${tab}`;
      const namePart = (selectedSeason?.name ?? 'pranksters').toLowerCase().replace(/\s+/g, '-');
      const link = document.createElement('a');
      link.download = `liga-${namePart}-${suffix}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={selectedSeasonId}
          onChange={(e) => setSelectedSeasonId(e.target.value)}
          className="rounded-md border border-prank-border bg-prank-surface px-3 py-2 text-white outline-none focus:border-prank-gold"
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.is_active ? ' (ativa)' : ''}
            </option>
          ))}
        </select>
        {selectedSeason && (
          <span className="rounded bg-prank-surface-2 px-3 py-1 text-sm font-semibold text-prank-gold">
            Rodada {rounds.length} de {selectedSeason.total_rounds}
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-prank-border pb-3">
        <div className="flex flex-wrap gap-2 overflow-x-auto">
          <button onClick={() => setTab('standings')} className={tabButtonClass(tab === 'standings')}>
            Classificação
          </button>
          {rounds.map((r) => (
            <button
              key={r.id}
              onClick={() => setTab(r.round_number)}
              className={tabButtonClass(tab === r.round_number)}
            >
              Rodada {r.round_number}
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || exportRows.length === 0}
          className="shrink-0 rounded-md border border-prank-gold px-3 py-2 text-sm font-semibold text-prank-gold transition-colors hover:bg-prank-gold hover:text-black disabled:opacity-40"
        >
          {exporting ? 'Gerando...' : '⬇ Exportar imagem'}
        </button>
      </div>

      {loadingSeasonData ? (
        <p className="text-white/50">Carregando...</p>
      ) : tab === 'standings' ? (
        <StandingsTable rows={standings} />
      ) : (
        <RoundTable rows={roundResults[tab] ?? []} />
      )}

      <p className="mt-3 text-xs text-white/40">
        Pontuação: 3 pontos por vitória + 1 ponto de participação na rodada.
      </p>

      <div style={{ position: 'fixed', top: -10000, left: -10000, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={exportRef}>
          <ExportCard
            seasonName={selectedSeason?.name ?? ''}
            etapaLabel={etapaLabel}
            rows={exportRows}
          />
        </div>
      </div>
    </div>
  );
}

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0)
    return <p className="text-white/50">Nenhuma rodada lançada ainda nesta temporada.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-prank-border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-prank-surface-2 text-xs uppercase tracking-wide text-white/50">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Jogador</th>
            <th className="px-4 py-3 text-right">Pontos</th>
            <th className="px-4 py-3 text-center">V</th>
            <th className="px-4 py-3 text-center">D</th>
            <th className="px-4 py-3 text-center">Rodadas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.player_id} className="border-t border-prank-border/60">
              <td className="px-4 py-3 font-display font-semibold text-prank-gold">{i + 1}</td>
              <td className="px-4 py-3 font-medium">{row.player_name}</td>
              <td className="px-4 py-3 text-right font-display text-lg font-bold">
                {row.total_points}
              </td>
              <td className="px-4 py-3 text-center text-emerald-400">{row.total_wins}</td>
              <td className="px-4 py-3 text-center text-red-400">{row.total_losses}</td>
              <td className="px-4 py-3 text-center text-white/70">{row.rounds_played}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoundTable({ rows }: { rows: RoundResultRow[] }) {
  if (rows.length === 0)
    return <p className="text-white/50">Nenhum resultado lançado nessa rodada ainda.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-prank-border">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="bg-prank-surface-2 text-xs uppercase tracking-wide text-white/50">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Jogador</th>
            <th className="px-4 py-3 text-center">W-L</th>
            <th className="px-4 py-3 text-right">Pontos</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player_name + i} className="border-t border-prank-border/60">
              <td className="px-4 py-3 font-display font-semibold text-prank-gold">{i + 1}</td>
              <td className="px-4 py-3 font-medium">{r.player_name}</td>
              <td className="px-4 py-3 text-center text-white/70">
                {r.wins}-{r.losses}
              </td>
              <td className="px-4 py-3 text-right font-display text-lg font-bold">{r.points}</td>
              <td className="px-4 py-3 text-right">
                {r.paste_url && (
                  <a
                    href={r.paste_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Ver paste do time"
                    className="text-prank-purple-light hover:text-prank-gold"
                  >
                    🔗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-prank-border/60 px-4 py-2 text-xs text-white/40">
        {rows.length} jogador{rows.length === 1 ? '' : 'es'} nessa rodada
      </p>
    </div>
  );
}
