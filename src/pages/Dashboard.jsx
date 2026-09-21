import { useEffect, useState } from 'react'
import { BarChart3, BookOpen, Check, FileText, Settings, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DashboardNav } from '../components/Layout'
import ArticleEditor from '../components/ArticleEditor'
import ArticleCard from '../components/ArticleCard'
import { useAuth } from '../context/AuthContext'
import { deleteArticle, getArticleById, getMyArticles, setArticlePublished } from '../services/api'
import { supabase } from '../lib/supabase'

function DashboardLayout({ children, title, subtitle }) {
  return <main className="dashboard-page"><DashboardNav /><section className="dashboard-main"><div className="dash-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section></main>
}

function LoadingState({ label = 'Loading articles...' }) {
  return <div className="screen-state"><span className="spinner" />{label}</div>
}

function ArticleList({ articles, userId, onChange, onError }) {
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')

  const remove = async article => {
    if (!window.confirm(`Delete "${article.title || 'this article'}"?`)) return
    setBusyId(article.id)
    setNotice('')
    try {
      await deleteArticle(article.id, userId)
      onChange(current => current.filter(item => item.id !== article.id))
      setNotice('Article deleted.')
    } catch (error) {
      onError(error)
    } finally {
      setBusyId('')
    }
  }

  const publish = async article => {
    setBusyId(article.id)
    setNotice('')
    try {
      const saved = await setArticlePublished(article.id, userId, !article.published)
      onChange(current => current.map(item => item.id === saved.id ? { ...item, ...saved } : item))
      setNotice(saved.published ? 'Article published.' : 'Article moved back to drafts.')
    } catch (error) {
      onError(error)
    } finally {
      setBusyId('')
    }
  }

  if (!articles.length) return <div className="workspace-empty"><h3>No articles here yet.</h3><Link className="button" to="/dashboard/create">Create your first article</Link></div>

  return <>
    {notice && <div className="alert success">{notice}</div>}
    <div className="manage-list">{articles.map(article => {
      const busy = busyId === article.id
      return <div className="manage-row" key={article.id}>
        <div className="manage-thumb" style={{ backgroundImage: article.cover_image ? `url(${article.cover_image})` : undefined }} />
        <div className="manage-copy"><h3>{article.title || 'Untitled article'}</h3><p>{article.excerpt || 'No excerpt yet.'}</p><small>{article.categories?.name || 'Uncategorized'} · {article.profiles?.full_name || article.profiles?.username || 'You'} · Updated {new Date(article.updated_at).toLocaleDateString()}</small></div>
        <span className={`status-pill ${article.published ? 'published' : 'draft'}`}>{article.published ? 'Published' : 'Draft'}</span>
        <div className="manage-actions">
          {article.published && <Link className="button outline small" to={`/article/${article.slug}`}>View</Link>}
          <Link className="button outline small" to={`/dashboard/edit/${article.id}`}>Edit</Link>
          <button className="button outline small" disabled={busy} onClick={() => publish(article)}>{busy ? 'Saving...' : article.published ? 'Unpublish' : 'Publish'}</button>
          <button className="icon-danger" disabled={busy} onClick={() => remove(article)} aria-label={`Delete ${article.title || 'article'}`}><Trash2 size={16} /></button>
        </div>
      </div>
    })}</div>
  </>
}

function useDashboardArticles(userId) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setArticles(await getMyArticles(userId))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])
  return { articles, setArticles, loading, error, setError }
}

export function Dashboard() {
  const { user, profile } = useAuth()
  const { articles, setArticles, loading, error, setError } = useDashboardArticles(user.id)
  const published = articles.filter(article => article.published)
  const drafts = articles.filter(article => !article.published)
  const handleError = requestError => setError(requestError.message)

  return <DashboardLayout title={`Good to see you, ${(profile?.full_name || 'creator').split(' ')[0]}.`} subtitle="Your ideas, in motion.">
    {error && <div className="alert error">{error}</div>}
    {loading ? <LoadingState /> : <>
      <div className="stats-grid"><Stat icon={<FileText />} label="Total articles" value={articles.length} /><Stat icon={<Check />} label="Published" value={published.length} /><Stat icon={<BarChart3 />} label="Drafts" value={drafts.length} /><Stat icon={<BookOpen />} label="Bookmarks" value="—" /></div>
      <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">ALL ARTICLES</span><h2>Your articles</h2></div><Link className="section-link" to="/dashboard/create">Create article</Link></div><ArticleList articles={articles} userId={user.id} onChange={setArticles} onError={handleError} /></section>
      <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">PUBLISHED</span><h2>Published articles</h2></div></div><ArticleList articles={published} userId={user.id} onChange={setArticles} onError={handleError} /></section>
      <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">DRAFTS</span><h2>Drafts</h2></div></div><ArticleList articles={drafts} userId={user.id} onChange={setArticles} onError={handleError} /></section>
    </>}
  </DashboardLayout>
}

function Stat({ icon, label, value }) { return <div className="stat-card"><span>{icon}</span><b>{value}</b><small>{label}</small></div> }

export function MyArticles({ draftsOnly = false }) {
  const { user } = useAuth()
  const { articles, setArticles, loading, error, setError } = useDashboardArticles(user.id)
  const visible = draftsOnly ? articles.filter(article => !article.published) : articles
  return <DashboardLayout title={draftsOnly ? 'Drafts' : 'My articles'} subtitle={draftsOnly ? 'Ideas still becoming themselves.' : 'Everything you have written in one place.'}>{error && <div className="alert error">{error}</div>}{loading ? <LoadingState /> : <ArticleList articles={visible} userId={user.id} onChange={setArticles} onError={requestError => setError(requestError.message)} />}</DashboardLayout>
}

export function CreateArticle() {
  const navigate = useNavigate()
  return <DashboardLayout title="Create article" subtitle="Make something worth keeping."><ArticleEditor onSaved={article => navigate(`/dashboard/edit/${article.id}`, { state: { message: article.published ? 'Article published.' : 'Draft saved.' } })} /></DashboardLayout>
}

export function EditArticle() {
  const { id } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getArticleById(id, user.id).then(data => {
      if (!data) throw new Error('Article not found or you do not have permission to view it.')
      if (active) setArticle(data)
    }).catch(requestError => { if (active) setError(requestError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, user.id])
  if (loading) return <LoadingState label="Loading editor..." />
  if (error) return <DashboardLayout title="Edit article"><div className="alert error">{error}</div></DashboardLayout>
  return <DashboardLayout title="Edit article" subtitle="Keep shaping the idea."><ArticleEditor existing={article} initialMessage={location.state?.message} onSaved={setArticle} /></DashboardLayout>
}

export function Profile() { const { user, profile, refreshProfile } = useAuth(); const [form, setForm] = useState({ full_name: '', username: '', bio: '' }); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); useEffect(() => { if (profile) setForm({ full_name: profile.full_name || '', username: profile.username || '', bio: profile.bio || '' }) }, [profile]); const save = async e => { e.preventDefault(); setBusy(true); const { error } = await supabase.from('profiles').upsert({ id: user.id, ...form }, { onConflict: 'id' }).select().single(); setMessage(error ? error.message : 'Profile saved.'); if (!error) await refreshProfile(); setBusy(false) }; return <DashboardLayout title="Your profile" subtitle="The person behind the perspective."><form className="settings-form" onSubmit={save}><label>Full name<input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></label><label>Username<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label><label>Bio<textarea rows="5" value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} /></label>{message && <div className={`alert ${message === 'Profile saved.' ? 'success' : 'error'}`}>{message}</div>}<button className="button" disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button></form></DashboardLayout> }
export function SettingsPage() { const { user } = useAuth(); const [message, setMessage] = useState(''); const submit = async e => { e.preventDefault(); const email = e.currentTarget.email.value; const { error } = await supabase.auth.updateUser({ email }); setMessage(error ? error.message : 'A confirmation link was sent to your new email.') }; return <DashboardLayout title="Settings" subtitle="Control your Nexora account."><form className="settings-form" onSubmit={submit}><label>Email address<input name="email" type="email" defaultValue={user.email} /></label>{message && <div className="alert success">{message}</div>}<button className="button"><Settings size={16} /> Update email</button></form></DashboardLayout> }
export function Bookmarks() { const { user } = useAuth(); const [articles, setArticles] = useState([]); const [error, setError] = useState(''); useEffect(() => { supabase.from('bookmarks').select('article_id').eq('user_id', user.id).then(async ({ data, error: requestError }) => { if (requestError) { setError(requestError.message); return } try { const results = await Promise.all((data || []).map(item => getArticleById(item.article_id))); setArticles(results.filter(Boolean)) } catch (requestError) { setError(requestError.message) } }) }, [user.id]); return <DashboardLayout title="Bookmarks" subtitle="Stories you want to return to.">{error && <div className="alert error">{error}</div>}{articles.length ? <div className="article-grid">{articles.map(article => <ArticleCard key={article.id} article={article} />)}</div> : <div className="workspace-empty"><h3>Your reading list is empty.</h3><Link className="button" to="/explore">Find something to keep</Link></div>}</DashboardLayout> }
