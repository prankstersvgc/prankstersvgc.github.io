import { useEffect, useState, type FormEvent } from 'react';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { base } from '../../lib/base';
import ImageCropper from './ImageCropper';

type Tab = 'liga' | 'noticias' | 'torneios';

const inputClass =
  'w-full rounded-md border border-prank-border bg-prank-bg px-3 py-2 text-white outline-none focus:border-prank-gold';
const labelClass = 'mb-1 block text-sm text-white/60';
const cardClass = 'rounded-lg border border-prank-border bg-prank-surface p-5';
const buttonClass =
  'rounded-md bg-prank-purple px-4 py-2 font-display font-semibold text-white transition-colors hover:bg-prank-purple/80 disabled:opacity-50';
const deleteButtonClass = 'text-xs font-semibold text-red-400 hover:text-red-300';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminDashboard() {
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('liga');

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = `${base}admin`;
        return;
      }
      setUserEmail(data.session.user.email ?? null);
      setReady(true);
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = `${base}admin`;
  }

  if (!supabaseConfigured) {
    return (
      <p className="text-red-400">
        Site ainda sem conexão com o banco (configure as chaves do Supabase no .env).
      </p>
    );
  }

  if (!ready) return <p className="text-white/50">Carregando...</p>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'liga', label: 'Rodada da liga' },
    { id: 'noticias', label: 'Notícia' },
    { id: 'torneios', label: 'Torneio' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/50">
          Logado como <span className="text-white">{userEmail}</span>
        </p>
        <button onClick={handleLogout} className="text-sm font-semibold text-white/60 hover:text-prank-gold">
          Sair
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-prank-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              'rounded-md px-3 py-2 text-sm font-semibold ' +
              (tab === t.id
                ? 'bg-prank-purple text-white'
                : 'bg-prank-surface-2 text-white/60 hover:text-white')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'liga' && <LeagueRoundPanel />}
      {tab === 'noticias' && <NewsPanel />}
      {tab === 'torneios' && <TournamentPanel />}
    </div>
  );
}

// ---------- Liga ----------

interface Season {
  id: string;
  name: string;
  total_rounds: number;
  is_active: boolean;
}

interface Round {
  id: string;
  season_id: string;
  round_number: number;
  round_date: string;
}

interface ResultRow {
  id: string;
  player_id: string;
  wins: number;
  losses: number;
  points: number;
  paste_url: string | null;
  league_players: { name: string } | null;
}

interface RosterPlayer {
  player_id: string;
  player_name: string;
}

interface RoundEntry {
  player_id: string;
  name: string;
  checked: boolean;
  wins: number;
  losses: number;
  pasteUrl: string;
  resultId: string | null;
}

function buildRoundEntries(roster: RosterPlayer[], results: ResultRow[]): RoundEntry[] {
  return roster
    .map((p) => {
      const existing = results.find((r) => r.player_id === p.player_id);
      return {
        player_id: p.player_id,
        name: p.player_name,
        checked: Boolean(existing),
        wins: existing?.wins ?? 0,
        losses: existing?.losses ?? 0,
        pasteUrl: existing?.paste_url ?? '',
        resultId: existing?.id ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function LeagueRoundPanel() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [seasonName, setSeasonName] = useState('');
  const [seasonRounds, setSeasonRounds] = useState(8);
  const [seasonError, setSeasonError] = useState<string | null>(null);

  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [seasonRoster, setSeasonRoster] = useState<RosterPlayer[]>([]);
  const [roundEntries, setRoundEntries] = useState<RoundEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [newRoundNumber, setNewRoundNumber] = useState(1);
  const [newRoundDate, setNewRoundDate] = useState(today());
  const [playerName, setPlayerName] = useState('');
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [pasteUrl, setPasteUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  async function loadSeasons() {
    const { data } = await supabase
      .from('league_seasons')
      .select('*')
      .order('created_at', { ascending: false });
    const list = (data as Season[]) ?? [];
    setSeasons(list);
    const active = list.find((s) => s.is_active) ?? null;
    setActiveSeason(active);
    return active;
  }

  async function loadRounds(seasonId: string) {
    const { data } = await supabase
      .from('league_rounds')
      .select('*')
      .eq('season_id', seasonId)
      .order('round_number', { ascending: false });
    const list = (data as Round[]) ?? [];
    setRounds(list);
    setNewRoundNumber((list[0]?.round_number ?? 0) + 1);
  }

  async function loadSeasonRoster(seasonId: string) {
    const { data } = await supabase
      .from('league_standings')
      .select('player_id, player_name')
      .eq('season_id', seasonId);
    const roster = (data as RosterPlayer[]) ?? [];
    setSeasonRoster(roster);
    return roster;
  }

  async function loadResults(roundId: string, roster: RosterPlayer[]) {
    const { data } = await supabase
      .from('league_results')
      .select('id, player_id, wins, losses, points, paste_url, league_players(name)')
      .eq('round_id', roundId);
    const list = (data as unknown as ResultRow[]) ?? [];
    setRoundEntries(buildRoundEntries(roster, list));
  }

  useEffect(() => {
    loadSeasons().then((active) => {
      if (active) {
        loadRounds(active.id);
        loadSeasonRoster(active.id);
      }
    });
  }, []);

  async function createSeason(e: FormEvent) {
    e.preventDefault();
    setSeasonError(null);
    // garante que só existe uma temporada ativa por vez
    await supabase.from('league_seasons').update({ is_active: false }).eq('is_active', true);
    const { error: err } = await supabase
      .from('league_seasons')
      .insert({ name: seasonName, total_rounds: seasonRounds, is_active: true });
    if (err) {
      setSeasonError(err.message);
      return;
    }
    setSeasonName('');
    setSeasonRounds(8);
    setSelectedRound(null);
    setRoundEntries([]);
    const active = await loadSeasons();
    if (active) {
      loadRounds(active.id);
      loadSeasonRoster(active.id);
    }
  }

  async function endSeason() {
    if (!activeSeason) return;
    if (
      !confirm(
        `Encerrar "${activeSeason.name}"? Ela continua salva no histórico, mas sai da página pública e para de aceitar novas rodadas.`,
      )
    )
      return;
    await supabase.from('league_seasons').update({ is_active: false }).eq('id', activeSeason.id);
    setSelectedRound(null);
    setRoundEntries([]);
    setRounds([]);
    setSeasonRoster([]);
    loadSeasons();
  }

  async function createRound(e: FormEvent) {
    e.preventDefault();
    if (!activeSeason) return;
    setError(null);
    const { data, error: err } = await supabase
      .from('league_rounds')
      .insert({
        season_id: activeSeason.id,
        round_number: newRoundNumber,
        round_date: newRoundDate,
      })
      .select()
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    await loadRounds(activeSeason.id);
    setSelectedRound(data as Round);
    // rodada nova, sem resultados ainda — lista o elenco da temporada todo desmarcado
    setRoundEntries(buildRoundEntries(seasonRoster, []));
  }

  async function selectRound(round: Round) {
    setSelectedRound(round);
    await loadResults(round.id, seasonRoster);
  }

  async function deleteRound(round: Round) {
    if (!confirm(`Apagar a rodada ${round.round_number} e todos os resultados dela?`)) return;
    await supabase.from('league_rounds').delete().eq('id', round.id);
    if (selectedRound?.id === round.id) {
      setSelectedRound(null);
      setRoundEntries([]);
    }
    if (activeSeason) loadRounds(activeSeason.id);
  }

  function updateEntry(playerId: string, patch: Partial<RoundEntry>) {
    setRoundEntries((prev) =>
      prev.map((entry) => (entry.player_id === playerId ? { ...entry, ...patch } : entry)),
    );
  }

  async function saveRoundEntries() {
    if (!selectedRound) return;
    setError(null);
    setSaving(true);

    const toSave = roundEntries.filter((e) => e.checked);
    const toRemove = roundEntries.filter((e) => !e.checked && e.resultId);

    if (toSave.length > 0) {
      const { error: upsertErr } = await supabase.from('league_results').upsert(
        toSave.map((e) => ({
          round_id: selectedRound.id,
          player_id: e.player_id,
          wins: e.wins,
          losses: e.losses,
          paste_url: e.pasteUrl.trim() || null,
        })),
        { onConflict: 'round_id,player_id' },
      );
      if (upsertErr) {
        setError(upsertErr.message);
        setSaving(false);
        return;
      }
    }

    if (toRemove.length > 0) {
      const { error: deleteErr } = await supabase
        .from('league_results')
        .delete()
        .in(
          'id',
          toRemove.map((e) => e.resultId as string),
        );
      if (deleteErr) {
        setError(deleteErr.message);
        setSaving(false);
        return;
      }
    }

    await loadResults(selectedRound.id, seasonRoster);
    setSaving(false);
  }

  async function addResult(e: FormEvent) {
    e.preventDefault();
    if (!selectedRound || !activeSeason) return;
    setAddError(null);

    let playerId: string;
    const { data: existing } = await supabase
      .from('league_players')
      .select('id')
      .ilike('name', playerName.trim())
      .maybeSingle();

    if (existing) {
      playerId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('league_players')
        .insert({ name: playerName.trim() })
        .select()
        .single();
      if (createErr) {
        setAddError(createErr.message);
        return;
      }
      playerId = created.id;
    }

    const { error: resultErr } = await supabase.from('league_results').upsert(
      { round_id: selectedRound.id, player_id: playerId, wins, losses, paste_url: pasteUrl.trim() || null },
      { onConflict: 'round_id,player_id' },
    );
    if (resultErr) {
      setAddError(resultErr.message);
      return;
    }

    setPlayerName('');
    setWins(0);
    setLosses(0);
    setPasteUrl('');
    const roster = await loadSeasonRoster(activeSeason.id);
    loadResults(selectedRound.id, roster);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Temporada</h3>
            {activeSeason ? (
              <p className="text-sm text-white/60">
                Ativa: <span className="text-prank-gold">{activeSeason.name}</span> ·{' '}
                {rounds.length} de {activeSeason.total_rounds} rodadas lançadas
              </p>
            ) : (
              <p className="text-sm text-white/60">Nenhuma temporada ativa no momento.</p>
            )}
          </div>
          {activeSeason && (
            <button onClick={endSeason} className={deleteButtonClass}>
              Encerrar temporada
            </button>
          )}
        </div>

        {!activeSeason && (
          <form onSubmit={createSeason} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[160px] flex-1">
              <label className={labelClass}>Nome da temporada</label>
              <input
                required
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                className={inputClass}
                placeholder="Ex: Temporada 1"
              />
            </div>
            <div className="w-32">
              <label className={labelClass}>Nº de rodadas</label>
              <input
                type="number"
                min={1}
                required
                value={seasonRounds}
                onChange={(e) => setSeasonRounds(Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <button type="submit" className={buttonClass}>
              Iniciar temporada
            </button>
          </form>
        )}
        {seasonError && <p className="mt-2 text-sm text-red-400">{seasonError}</p>}

        {seasons.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-white/40 hover:text-white/60">
              Ver todas as temporadas ({seasons.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-white/60">
              {seasons.map((s) => (
                <li key={s.id}>
                  {s.name} — {s.total_rounds} rodadas {s.is_active ? '(ativa)' : '(encerrada)'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {activeSeason && (
        <div className="flex flex-col gap-6 md:flex-row">
          <div className={cardClass + ' md:w-80 md:flex-none'}>
            <h3 className="font-display mb-3 text-lg font-semibold">Nova rodada</h3>
            <form onSubmit={createRound} className="flex flex-col gap-3">
              <div>
                <label className={labelClass}>Número da rodada</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={newRoundNumber}
                  onChange={(e) => setNewRoundNumber(Number(e.target.value))}
                  className={inputClass}
                />
                {newRoundNumber > activeSeason.total_rounds && (
                  <p className="mt-1 text-xs text-amber-400">
                    Essa temporada tem {activeSeason.total_rounds} rodadas previstas.
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Data</label>
                <input
                  type="date"
                  required
                  value={newRoundDate}
                  onChange={(e) => setNewRoundDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button type="submit" className={buttonClass}>
                Criar rodada
              </button>
            </form>

            <h4 className="mt-6 mb-2 text-sm font-semibold text-white/50">
              Rodadas desta temporada
            </h4>
            <ul className="flex flex-col gap-1">
              {rounds.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <button
                    onClick={() => selectRound(r)}
                    className={
                      'flex-1 rounded px-2 py-1 text-left hover:bg-prank-surface-2 ' +
                      (selectedRound?.id === r.id ? 'bg-prank-surface-2 text-prank-gold' : '')
                    }
                  >
                    Rodada {r.round_number} ·{' '}
                    {new Date(r.round_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </button>
                  <button onClick={() => deleteRound(r)} className={deleteButtonClass}>
                    excluir
                  </button>
                </li>
              ))}
              {rounds.length === 0 && (
                <p className="text-sm text-white/40">Nenhuma rodada criada ainda.</p>
              )}
            </ul>
          </div>

          <div className={cardClass + ' flex-1'}>
            {!selectedRound ? (
              <p className="text-white/50">
                Crie ou selecione uma rodada à esquerda para lançar os resultados dos jogadores.
              </p>
            ) : (
              <>
                <h3 className="font-display mb-3 text-lg font-semibold">
                  Resultados · Rodada {selectedRound.round_number}
                </h3>

                {roundEntries.length === 0 ? (
                  <p className="mb-4 text-sm text-white/40">
                    Nenhum jogador na temporada ainda. Cadastre o primeiro no formulário abaixo.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-white/40">
                      Marque quem jogou essa rodada e ajusta o placar. Quem não jogou fica
                      desmarcado e não soma ponto nenhum.
                    </p>
                    <div className="mb-4 overflow-x-auto rounded-lg border border-prank-border">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="bg-prank-surface-2 text-xs uppercase tracking-wide text-white/50">
                          <tr>
                            <th className="px-3 py-2">Jogou</th>
                            <th className="px-3 py-2">Jogador</th>
                            <th className="px-3 py-2 text-center">V</th>
                            <th className="px-3 py-2 text-center">D</th>
                            <th className="px-3 py-2 text-right">Pts</th>
                            <th className="px-3 py-2">OTS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roundEntries.map((entry) => (
                            <tr key={entry.player_id} className="border-t border-prank-border/60">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={entry.checked}
                                  onChange={(e) =>
                                    updateEntry(entry.player_id, { checked: e.target.checked })
                                  }
                                  className="h-4 w-4 accent-prank-purple"
                                />
                              </td>
                              <td
                                className={'px-3 py-2 ' + (entry.checked ? '' : 'text-white/40')}
                              >
                                {entry.name}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  disabled={!entry.checked}
                                  value={entry.wins}
                                  onChange={(e) =>
                                    updateEntry(entry.player_id, { wins: Number(e.target.value) })
                                  }
                                  className="w-14 rounded border border-prank-border bg-prank-bg px-2 py-1 text-center text-white outline-none focus:border-prank-gold disabled:opacity-30"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  disabled={!entry.checked}
                                  value={entry.losses}
                                  onChange={(e) =>
                                    updateEntry(entry.player_id, {
                                      losses: Number(e.target.value),
                                    })
                                  }
                                  className="w-14 rounded border border-prank-border bg-prank-bg px-2 py-1 text-center text-white outline-none focus:border-prank-gold disabled:opacity-30"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-display font-semibold text-prank-gold">
                                {entry.checked ? entry.wins * 3 + 1 : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="url"
                                  placeholder="link do OTS"
                                  disabled={!entry.checked}
                                  value={entry.pasteUrl}
                                  onChange={(e) =>
                                    updateEntry(entry.player_id, { pasteUrl: e.target.value })
                                  }
                                  className="w-36 rounded border border-prank-border bg-prank-bg px-2 py-1 text-xs text-white outline-none focus:border-prank-gold disabled:opacity-30"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
                    <button
                      type="button"
                      onClick={saveRoundEntries}
                      disabled={saving}
                      className={buttonClass}
                    >
                      {saving ? 'Salvando...' : 'Salvar rodada'}
                    </button>
                  </>
                )}

                <h4 className="mt-6 mb-2 text-sm font-semibold text-white/50">
                  Jogador novo nesta rodada
                </h4>
                <form onSubmit={addResult} className="flex flex-col gap-3">
                  <div>
                    <label className={labelClass}>Nome do jogador</label>
                    <input
                      required
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      className={inputClass}
                      placeholder="Ex: Bruno"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Vitórias</label>
                      <input
                        type="number"
                        min={0}
                        value={wins}
                        onChange={(e) => setWins(Number(e.target.value))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Derrotas</label>
                      <input
                        type="number"
                        min={0}
                        value={losses}
                        onChange={(e) => setLosses(Number(e.target.value))}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Link do OTS (opcional)</label>
                    <input
                      type="url"
                      value={pasteUrl}
                      onChange={(e) => setPasteUrl(e.target.value)}
                      className={inputClass}
                      placeholder="https://pokepast.es/..."
                    />
                  </div>
                  <p className="text-xs text-white/40">
                    Pontos calculados automaticamente: <strong>{wins * 3 + 1}</strong> (3 por
                    vitória + 1 de participação)
                  </p>
                  {addError && <p className="text-sm text-red-400">{addError}</p>}
                  <button type="submit" className={buttonClass}>
                    Adicionar à rodada
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Torneios ----------

interface Tournament {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  format: string | null;
  link: string | null;
  notes: string | null;
}

function TournamentPanel() {
  const [rows, setRows] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState(today());
  const [location, setLocation] = useState('');
  const [format, setFormat] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('tournaments').select('*').order('event_date', { ascending: true });
    setRows((data as Tournament[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('tournaments').insert({
      name,
      event_date: eventDate,
      location: location || null,
      format: format || null,
      link: link || null,
      notes: notes || null,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setName('');
    setLocation('');
    setFormat('');
    setLink('');
    setNotes('');
    load();
  }

  async function remove(id: string) {
    await supabase.from('tournaments').delete().eq('id', id);
    load();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className={cardClass}>
        <h3 className="font-display mb-3 text-lg font-semibold">Novo torneio</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={labelClass}>Nome do torneio</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Data</label>
            <input
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Local (opcional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Formato (opcional)</label>
            <input
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className={inputClass}
              placeholder="Ex: Regulation I, Bo3"
            />
          </div>
          <div>
            <label className={labelClass}>Link (opcional)</label>
            <input value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Observações (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows={2} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className={buttonClass}>
            Salvar torneio
          </button>
        </form>
      </div>

      <div className={cardClass}>
        <h3 className="font-display mb-3 text-lg font-semibold">Torneios cadastrados</h3>
        <ul className="flex flex-col gap-2">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded bg-prank-surface-2 px-3 py-2 text-sm">
              <span>
                {t.name} ({new Date(t.event_date + 'T00:00:00').toLocaleDateString('pt-BR')})
              </span>
              <button onClick={() => remove(t.id)} className={deleteButtonClass}>
                excluir
              </button>
            </li>
          ))}
          {rows.length === 0 && <p className="text-sm text-white/40">Nenhum torneio ainda.</p>}
        </ul>
      </div>
    </div>
  );
}


// ---------- Notícias ----------

interface Post {
  id: string;
  title: string;
  body: string;
  cover_image_path: string | null;
  post_date: string;
  is_published: boolean;
}

interface PostResultEntry {
  id: string;
  player_id: string;
  name: string;
  wins: number;
  losses: number;
  paste_url: string;
}

function NewsPanel() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selected, setSelected] = useState<Post | null>(null);
  const [results, setResults] = useState<PostResultEntry[]>([]);

  const [title, setTitle] = useState('');
  const [postDate, setPostDate] = useState(today());
  const [body, setBody] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [rawCoverFile, setRawCoverFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [rawEditCoverFile, setRawEditCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [playerName, setPlayerName] = useState('');
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [pasteUrl, setPasteUrl] = useState('');
  const [resultError, setResultError] = useState<string | null>(null);
  const [savingResults, setSavingResults] = useState(false);
  const [saveResultsError, setSaveResultsError] = useState<string | null>(null);

  async function loadPosts() {
    const { data } = await supabase
      .from('news_posts')
      .select('*')
      .order('post_date', { ascending: false })
      .order('created_at', { ascending: false });
    setPosts((data as Post[]) ?? []);
  }

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadResults(postId: string) {
    const { data } = await supabase
      .from('post_results')
      .select('id, player_id, wins, losses, paste_url, league_players(name)')
      .eq('post_id', postId);
    const list = (
      (data as unknown as Array<{
        id: string;
        player_id: string;
        wins: number;
        losses: number;
        paste_url: string | null;
        league_players: { name: string } | null;
      }>) ?? []
    ).map((r) => ({
      id: r.id,
      player_id: r.player_id,
      name: r.league_players?.name ?? '—',
      wins: r.wins,
      losses: r.losses,
      paste_url: r.paste_url ?? '',
    }));
    list.sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, 'pt-BR'));
    setResults(list);
  }

  function updateResultEntry(id: string, patch: Partial<PostResultEntry>) {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveResults() {
    if (!selected || results.length === 0) return;
    setSaveResultsError(null);
    setSavingResults(true);
    const { error: err } = await supabase.from('post_results').upsert(
      results.map((r) => ({
        post_id: selected.id,
        player_id: r.player_id,
        wins: r.wins,
        losses: r.losses,
        paste_url: r.paste_url.trim() || null,
      })),
      { onConflict: 'post_id,player_id' },
    );
    setSavingResults(false);
    if (err) {
      setSaveResultsError(err.message);
      return;
    }
    loadResults(selected.id);
  }

  function selectPost(post: Post) {
    setSelected(post);
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditDate(post.post_date);
    setRawEditCoverFile(null);
    setCoverError(null);
    loadResults(post.id);
  }

  async function createPost(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    let coverPath: string | null = null;
    if (coverFile) {
      const path = `posts/${Date.now()}-cover.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('gallery')
        .upload(path, coverFile, { contentType: 'image/jpeg' });
      if (uploadErr) {
        setCreateError(uploadErr.message);
        setCreating(false);
        return;
      }
      coverPath = path;
    }

    const { data, error: err } = await supabase
      .from('news_posts')
      .insert({ title, body, post_date: postDate, cover_image_path: coverPath, is_published: false })
      .select()
      .single();

    setCreating(false);
    if (err) {
      setCreateError(err.message);
      return;
    }

    setTitle('');
    setBody('');
    setPostDate(today());
    setCoverFile(null);
    setRawCoverFile(null);
    await loadPosts();
    selectPost(data as Post);
  }

  async function saveEdit() {
    if (!selected) return;
    setEditError(null);
    setSavingEdit(true);
    const { error: err } = await supabase
      .from('news_posts')
      .update({ title: editTitle, body: editBody, post_date: editDate })
      .eq('id', selected.id);
    setSavingEdit(false);
    if (err) {
      setEditError(err.message);
      return;
    }
    const updated = { ...selected, title: editTitle, body: editBody, post_date: editDate };
    setSelected(updated);
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function replaceCoverImage(blob: Blob) {
    if (!selected) return;
    setCoverError(null);
    setUploadingCover(true);

    const path = `posts/${Date.now()}-cover.jpg`;
    const { error: uploadErr } = await supabase.storage
      .from('gallery')
      .upload(path, blob, { contentType: 'image/jpeg' });
    if (uploadErr) {
      setCoverError(uploadErr.message);
      setUploadingCover(false);
      return;
    }

    const { error: updateErr } = await supabase
      .from('news_posts')
      .update({ cover_image_path: path })
      .eq('id', selected.id);
    if (updateErr) {
      setCoverError(updateErr.message);
      setUploadingCover(false);
      return;
    }

    const oldPath = selected.cover_image_path;
    if (oldPath) {
      await supabase.storage.from('gallery').remove([oldPath]);
    }

    const updated = { ...selected, cover_image_path: path };
    setSelected(updated);
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setRawEditCoverFile(null);
    setUploadingCover(false);
  }

  async function togglePublish() {
    if (!selected) return;
    const next = !selected.is_published;
    await supabase.from('news_posts').update({ is_published: next }).eq('id', selected.id);
    const updated = { ...selected, is_published: next };
    setSelected(updated);
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function deletePost(post: Post) {
    if (
      !confirm(`Apagar a notícia "${post.title}"? Isso remove o texto, a foto e a tabela de resultados dela.`)
    )
      return;
    if (post.cover_image_path) {
      await supabase.storage.from('gallery').remove([post.cover_image_path]);
    }
    await supabase.from('news_posts').delete().eq('id', post.id);
    if (selected?.id === post.id) {
      setSelected(null);
      setResults([]);
    }
    loadPosts();
  }

  async function addResult(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setResultError(null);

    let playerId: string;
    const { data: existing } = await supabase
      .from('league_players')
      .select('id')
      .ilike('name', playerName.trim())
      .maybeSingle();

    if (existing) {
      playerId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('league_players')
        .insert({ name: playerName.trim() })
        .select()
        .single();
      if (createErr) {
        setResultError(createErr.message);
        return;
      }
      playerId = created.id;
    }

    const { error: resultErr } = await supabase.from('post_results').upsert(
      { post_id: selected.id, player_id: playerId, wins, losses, paste_url: pasteUrl.trim() || null },
      { onConflict: 'post_id,player_id' },
    );
    if (resultErr) {
      setResultError(resultErr.message);
      return;
    }

    setPlayerName('');
    setWins(0);
    setLosses(0);
    setPasteUrl('');
    loadResults(selected.id);
  }

  async function removeResult(id: string) {
    if (!selected) return;
    await supabase.from('post_results').delete().eq('id', id);
    loadResults(selected.id);
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className={cardClass + ' md:w-80 md:flex-none'}>
        <h3 className="font-display mb-3 text-lg font-semibold">Nova notícia</h3>
        <form onSubmit={createPost} className="flex flex-col gap-3">
          <div>
            <label className={labelClass}>Título</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Data</label>
            <input
              type="date"
              required
              value={postDate}
              onChange={(e) => setPostDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Foto de capa (opcional)</label>
            {rawCoverFile ? (
              <ImageCropper
                file={rawCoverFile}
                onCancel={() => setRawCoverFile(null)}
                onConfirm={(blob) => {
                  setCoverFile(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
                  setRawCoverFile(null);
                }}
              />
            ) : coverFile ? (
              <div className="flex items-center gap-3">
                <img
                  src={URL.createObjectURL(coverFile)}
                  alt="Prévia da capa"
                  className="h-16 w-28 rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => setCoverFile(null)}
                  className={deleteButtonClass}
                >
                  trocar imagem
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setRawCoverFile(e.target.files?.[0] ?? null)}
                className={inputClass}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>
              Texto <span className="text-white/40">(aceita Markdown)</span>
            </label>
            <textarea
              required
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={inputClass}
              placeholder={'**negrito**, _itálico_, [Liga](https://prankstersvgc.github.io/liga/)'}
            />
          </div>
          {createError && <p className="text-sm text-red-400">{createError}</p>}
          <button type="submit" disabled={creating} className={buttonClass}>
            {creating ? 'Criando...' : 'Criar rascunho'}
          </button>
          <p className="text-xs text-white/40">
            Cria como rascunho — ninguém vê até você clicar em "Publicar".
          </p>
        </form>

        <h4 className="mt-6 mb-2 text-sm font-semibold text-white/50">Notícias</h4>
        <ul className="flex flex-col gap-1">
          {posts.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => selectPost(p)}
                className={
                  'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-prank-surface-2 ' +
                  (selected?.id === p.id ? 'bg-prank-surface-2 text-prank-gold' : '')
                }
              >
                <span className="truncate">{p.title}</span>
                <span
                  className={
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ' +
                    (p.is_published
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400')
                  }
                >
                  {p.is_published ? 'Publicada' : 'Rascunho'}
                </span>
              </button>
            </li>
          ))}
          {posts.length === 0 && <p className="text-sm text-white/40">Nenhuma notícia ainda.</p>}
        </ul>
      </div>

      <div className={cardClass + ' flex-1'}>
        {!selected ? (
          <p className="text-white/50">Crie ou selecione uma notícia à esquerda.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span
                className={
                  'rounded px-2 py-1 text-xs font-bold uppercase ' +
                  (selected.is_published
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/20 text-amber-400')
                }
              >
                {selected.is_published ? 'Publicada' : 'Rascunho'}
              </span>
              <div className="flex gap-2">
                <button onClick={togglePublish} className={buttonClass}>
                  {selected.is_published ? 'Despublicar' : 'Publicar'}
                </button>
                <button onClick={() => deletePost(selected)} className={deleteButtonClass}>
                  Excluir notícia
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveEdit();
              }}
              className="mb-6 flex flex-col gap-3"
            >
              <div>
                <label className={labelClass}>Título</label>
                <input
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Data</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Texto <span className="text-white/40">(aceita Markdown)</span>
                </label>
                <textarea
                  required
                  rows={5}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className={inputClass}
                />
              </div>
              {editError && <p className="text-sm text-red-400">{editError}</p>}
              <button type="submit" disabled={savingEdit} className={buttonClass}>
                {savingEdit ? 'Salvando...' : 'Salvar texto'}
              </button>
            </form>

            <div className="mb-6">
              <h4 className="mb-2 text-sm font-semibold text-white/50">Capa</h4>
              {rawEditCoverFile ? (
                <ImageCropper
                  file={rawEditCoverFile}
                  onCancel={() => setRawEditCoverFile(null)}
                  onConfirm={(blob) => replaceCoverImage(blob)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  {selected.cover_image_path ? (
                    <img
                      src={
                        supabase.storage.from('gallery').getPublicUrl(selected.cover_image_path)
                          .data.publicUrl
                      }
                      alt="Capa atual"
                      className="h-16 w-28 rounded object-cover"
                    />
                  ) : (
                    <p className="text-sm text-white/40">Sem foto de capa.</p>
                  )}
                  <label className={buttonClass + ' cursor-pointer'}>
                    {uploadingCover
                      ? 'Enviando...'
                      : selected.cover_image_path
                        ? 'Trocar capa'
                        : 'Adicionar capa'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingCover}
                      onChange={(e) => setRawEditCoverFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
              {coverError && <p className="mt-2 text-sm text-red-400">{coverError}</p>}
            </div>

            <h4 className="mb-2 text-sm font-semibold text-white/50">Resultados da notícia (opcional)</h4>
            <p className="mb-3 text-xs text-white/40">
              Pra eventos que não são rodada da liga (ex: um Challenge).
            </p>

            {results.length === 0 ? (
              <p className="mb-4 text-sm text-white/40">Nenhum resultado adicionado ainda.</p>
            ) : (
              <>
                <div className="mb-3 overflow-x-auto rounded-lg border border-prank-border">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="bg-prank-surface-2 text-xs uppercase tracking-wide text-white/50">
                      <tr>
                        <th className="px-3 py-2">Jogador</th>
                        <th className="px-3 py-2 text-center">V</th>
                        <th className="px-3 py-2 text-center">D</th>
                        <th className="px-3 py-2">OTS</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id} className="border-t border-prank-border/60">
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              value={r.wins}
                              onChange={(e) => updateResultEntry(r.id, { wins: Number(e.target.value) })}
                              className="w-14 rounded border border-prank-border bg-prank-bg px-2 py-1 text-center text-white outline-none focus:border-prank-gold"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              value={r.losses}
                              onChange={(e) =>
                                updateResultEntry(r.id, { losses: Number(e.target.value) })
                              }
                              className="w-14 rounded border border-prank-border bg-prank-bg px-2 py-1 text-center text-white outline-none focus:border-prank-gold"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="url"
                              placeholder="link do OTS"
                              value={r.paste_url}
                              onChange={(e) => updateResultEntry(r.id, { paste_url: e.target.value })}
                              className="w-40 rounded border border-prank-border bg-prank-bg px-2 py-1 text-xs text-white outline-none focus:border-prank-gold"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => removeResult(r.id)} className={deleteButtonClass}>
                              remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {saveResultsError && <p className="mb-2 text-sm text-red-400">{saveResultsError}</p>}
                <button
                  type="button"
                  onClick={saveResults}
                  disabled={savingResults}
                  className={buttonClass + ' mb-6'}
                >
                  {savingResults ? 'Salvando...' : 'Salvar resultados'}
                </button>
              </>
            )}

            <h4 className="mt-2 mb-2 text-sm font-semibold text-white/50">Jogador novo nesta notícia</h4>
            <form onSubmit={addResult} className="flex flex-col gap-3">
              <div>
                <label className={labelClass}>Nome do jogador</label>
                <input
                  required
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className={inputClass}
                  placeholder="Ex: Bruno"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Vitórias</label>
                  <input
                    type="number"
                    min={0}
                    value={wins}
                    onChange={(e) => setWins(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Derrotas</label>
                  <input
                    type="number"
                    min={0}
                    value={losses}
                    onChange={(e) => setLosses(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Link do OTS (opcional)</label>
                <input
                  type="url"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  className={inputClass}
                  placeholder="https://pokepast.es/..."
                />
              </div>
              {resultError && <p className="text-sm text-red-400">{resultError}</p>}
              <button type="submit" className={buttonClass}>
                Adicionar jogador
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
