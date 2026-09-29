import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { supabase, supabaseConfigured } from '../../lib/supabase';

marked.setOptions({ breaks: true });

// DOMPurify precisa de um DOM de verdade — no build (SSR/prerender em Node) essa página não
// tem window, então só registra o hook e sanitiza no navegador.
if (typeof window !== 'undefined') {
  // Links de posts abrem em nova aba, sem dar acesso da nova aba de volta pro site.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

function renderBody(markdown: string) {
  const html = marked.parse(markdown, { async: false });
  return typeof window !== 'undefined' ? DOMPurify.sanitize(html) : '';
}

const PAGE_SIZE = 5;

interface Post {
  id: string;
  title: string;
  body: string;
  cover_image_path: string | null;
  post_date: string;
}

interface PostResult {
  post_id: string;
  player_name: string;
  wins: number;
  losses: number;
  paste_url: string | null;
}

export default function NewsFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [resultsByPost, setResultsByPost] = useState<Record<string, PostResult[]>>({});
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(pageIndex: number) {
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: err } = await supabase
      .from('news_posts')
      .select('id, title, body, cover_image_path, post_date')
      .order('post_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (err) {
      setError(err.message);
      return;
    }

    const newPosts = (data as Post[]) ?? [];
    setPosts((prev) => (pageIndex === 0 ? newPosts : [...prev, ...newPosts]));
    setHasMore(newPosts.length === PAGE_SIZE);

    if (newPosts.length > 0) {
      const ids = newPosts.map((p) => p.id);
      const { data: resultsData } = await supabase
        .from('post_results')
        .select('post_id, wins, losses, paste_url, league_players(name)')
        .in('post_id', ids);

      const grouped: Record<string, PostResult[]> = {};
      for (const row of (resultsData as unknown as Array<{
        post_id: string;
        wins: number;
        losses: number;
        paste_url: string | null;
        league_players: { name: string } | null;
      }>) ?? []) {
        const entry: PostResult = {
          post_id: row.post_id,
          player_name: row.league_players?.name ?? '—',
          wins: row.wins,
          losses: row.losses,
          paste_url: row.paste_url,
        };
        if (!grouped[entry.post_id]) grouped[entry.post_id] = [];
        grouped[entry.post_id].push(entry);
      }
      for (const key of Object.keys(grouped)) {
        grouped[key].sort(
          (a, b) => b.wins - a.wins || a.player_name.localeCompare(b.player_name, 'pt-BR'),
        );
      }
      setResultsByPost((prev) => ({ ...prev, ...grouped }));
    }
  }

  useEffect(() => {
    if (!supabaseConfigured) {
      setError('Site ainda sem conexão com o banco (configure as chaves do Supabase).');
      setLoading(false);
      return;
    }
    loadPage(0).finally(() => setLoading(false));
  }, []);

  async function handleLoadMore() {
    setLoadingMore(true);
    const next = page + 1;
    await loadPage(next);
    setPage(next);
    setLoadingMore(false);
  }

  if (loading) return <p className="text-white/50">Carregando...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (posts.length === 0)
    return <p className="text-white/50">Nenhuma notícia publicada ainda. Volte em breve!</p>;

  return (
    <div className="flex flex-col gap-8">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} results={resultsByPost[post.id] ?? []} />
      ))}

      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="self-center rounded-md border border-prank-border px-5 py-2 text-sm font-semibold text-white/70 transition-colors hover:border-prank-gold hover:text-prank-gold disabled:opacity-40"
        >
          {loadingMore ? 'Carregando...' : 'Carregar mais notícias'}
        </button>
      )}
    </div>
  );
}

function PostCard({ post, results }: { post: Post; results: PostResult[] }) {
  const coverUrl = post.cover_image_path
    ? supabase.storage.from('gallery').getPublicUrl(post.cover_image_path).data.publicUrl
    : null;

  return (
    <article className="overflow-hidden rounded-lg border border-prank-border bg-prank-surface">
      {coverUrl && (
        <img
          src={coverUrl}
          alt={post.title}
          loading="lazy"
          className="max-h-96 w-full object-cover"
        />
      )}
      <div className="p-5">
        <p className="text-xs uppercase tracking-wide text-white/40">
          {new Date(post.post_date + 'T00:00:00').toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <h2 className="font-display mt-1 text-2xl font-bold text-white">{post.title}</h2>
        <div
          className="mt-3 space-y-3 text-white/70 [&_a]:text-prank-purple-light [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-prank-gold [&_strong]:font-semibold [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          dangerouslySetInnerHTML={{ __html: renderBody(post.body) }}
        />

        {results.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-lg border border-prank-border">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-prank-surface-2 text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Jogador</th>
                  <th className="px-4 py-3 text-center">W-L</th>
                  <th className="px-4 py-3 text-center" title="Open Team Sheet">
                    OTS
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.player_name + i} className="border-t border-prank-border/60">
                    <td className="px-4 py-3 font-display font-semibold text-prank-gold">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.player_name}</td>
                    <td className="px-4 py-3 text-center text-white/70">
                      {r.wins}-{r.losses}
                    </td>
                    <td className="px-4 py-3 text-center">
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
          </div>
        )}
      </div>
    </article>
  );
}
