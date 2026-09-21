import { supabase } from '../lib/supabase'

function logSupabaseResult(operation, data, error) {
  if (import.meta.env.DEV) console.debug(`[Supabase] ${operation}`, { data, error })
}

const articleFields = 'id, title, slug, excerpt, content, cover_image, category_id, tags, author_id, published, reading_time, created_at, updated_at'

export async function getCategories() { if (!supabase) return []; const { data, error } = await supabase.from('categories').select('*').order('name'); if (error) throw error; return data || [] }

async function hydrateArticles(articles) {
  if (!articles.length) return []

  const authorIds = [...new Set(articles.map(article => article.author_id).filter(Boolean))]
  const categoryIds = [...new Set(articles.map(article => article.category_id).filter(Boolean))]
  const [profilesResult, categoriesResult] = await Promise.all([
    authorIds.length ? supabase.from('profiles').select('id, username, full_name, avatar_url, bio').in('id', authorIds) : { data: [], error: null },
    categoryIds.length ? supabase.from('categories').select('id, name, slug, description').in('id', categoryIds) : { data: [], error: null },
  ])
  if (profilesResult.error) throw profilesResult.error
  if (categoriesResult.error) throw categoriesResult.error

  const profiles = Object.fromEntries((profilesResult.data || []).map(profile => [profile.id, profile]))
  const categories = Object.fromEntries((categoriesResult.data || []).map(category => [category.id, category]))
  return articles.map(article => ({
    ...article,
    profiles: profiles[article.author_id] || null,
    categories: categories[article.category_id] || null,
  }))
}

export async function getArticles({ search = '', category = '', sort = 'latest', limit } = {}) {
  if (!supabase) return []
  let query = supabase.from('articles').select(articleFields).eq('published', true)
  if (search) query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%`)
  if (category) {
    const categories = await getCategories()
    const selected = categories.find(item => item.slug === category)
    if (!selected) return []
    query = query.eq('category_id', selected.id)
  }
  query = query.order('created_at', { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw error
  const hydrated = await hydrateArticles(data || [])
  if (sort !== 'latest') hydrated.sort((a, b) => (b[sort] || 0) - (a[sort] || 0))
  return hydrated
}
export async function getArticleById(id, userId) { if (!supabase) return null; let query = supabase.from('articles').select(articleFields).eq('id', id); if (userId) query = query.eq('author_id', userId); const { data, error } = await query.maybeSingle(); logSupabaseResult('getArticleById', data, error); if (error) throw error; return data ? (await hydrateArticles([data]))[0] : null }
export async function getArticleBySlug(slug) { if (!supabase) return null; const { data, error } = await supabase.from('articles').select(articleFields).eq('slug', slug).eq('published', true).maybeSingle(); logSupabaseResult('getArticleBySlug', data, error); if (error) throw error; return data ? (await hydrateArticles([data]))[0] : null }
export async function getComments(articleId) { if (!supabase) return []; const { data, error } = await supabase.from('comments').select('*').eq('article_id', articleId).order('created_at', { ascending: true }); logSupabaseResult('getComments', data, error); if (error) throw error; return data || [] }
export async function getReactionState(table, articleId, userId) {
  if (!supabase) return { count: 0, active: false }
  const countResult = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('article_id', articleId)
  if (countResult.error) throw countResult.error
  if (!userId) return { count: countResult.count || 0, active: false }
  const currentResult = await supabase.from(table).select('id').eq('article_id', articleId).eq('user_id', userId).maybeSingle()
  if (currentResult.error) throw currentResult.error
  return { count: countResult.count || 0, active: Boolean(currentResult.data) }
}
export async function getMyArticles(userId, published) { if (!supabase) return []; let query = supabase.from('articles').select(articleFields).eq('author_id', userId).order('updated_at', { ascending: false }); if (published !== undefined) query = query.eq('published', published); const { data, error } = await query; logSupabaseResult('getMyArticles', data, error); if (error) throw error; return hydrateArticles(data || []) }
async function findUniqueSlug(baseSlug, articleId) {
  const normalizedBase = baseSlug || 'untitled-article'
  let candidate = normalizedBase
  let suffix = 1

  while (true) {
    const { data, error } = await supabase.from('articles').select('id').eq('slug', candidate).maybeSingle()
    if (error) throw error
    if (!data || data.id === articleId) return candidate
    suffix += 1
    candidate = `${normalizedBase}-${suffix}`
  }
}

export async function saveArticle(article, userId) {
  if (!supabase) throw new Error('Connect Supabase in .env.local before saving articles.')

  const payload = { title: article.title, slug: await findUniqueSlug(article.slug, article.id), excerpt: article.excerpt, content: article.content, cover_image: article.cover_image || null, category_id: article.category_id || null, tags: Array.isArray(article.tags) ? article.tags : [], published: Boolean(article.published), reading_time: article.reading_time || 1, author_id: userId, updated_at: new Date().toISOString() }
  const save = () => article.id
    ? supabase.from('articles').update(payload).eq('id', article.id).eq('author_id', userId)
    : supabase.from('articles').insert(payload)
  let { data, error } = await save().select(articleFields).single()

  if (error?.code === '23505') {
    payload.slug = await findUniqueSlug(payload.slug, article.id)
    ;({ data, error } = await save().select(articleFields).single())
  }

  logSupabaseResult('saveArticle', data, error)
  if (error) throw error
  return data
}
export async function setArticlePublished(id, userId, published) {
  if (!supabase) throw new Error('Connect Supabase in .env.local before updating articles.')
  const { data, error } = await supabase.from('articles').update({ published, updated_at: new Date().toISOString() }).eq('id', id).eq('author_id', userId).select(articleFields).single()
  logSupabaseResult('setArticlePublished', data, error)
  if (error) throw error
  return data
}
export async function deleteArticle(id, userId) { const { error } = await supabase.from('articles').delete().eq('id', id).eq('author_id', userId); if (error) throw error }
export async function toggleReaction(table, articleId, userId) { if (!supabase || !userId) throw new Error('Log in to react to this article.'); const { data: existing, error: lookupError } = await supabase.from(table).select('id').eq('article_id', articleId).eq('user_id', userId).maybeSingle(); if (lookupError) throw lookupError; if (existing) { const { error } = await supabase.from(table).delete().eq('id', existing.id).eq('user_id', userId); if (error) throw error; return false } const { error } = await supabase.from(table).insert({ article_id: articleId, user_id: userId }); if (error) throw error; return true }
export async function addComment(articleId, userId, content) { const { data, error } = await supabase.from('comments').insert({ article_id: articleId, user_id: userId, content }).select('*').single(); if (error) throw error; return data }
export async function deleteComment(id, userId) { const { error } = await supabase.from('comments').delete().eq('id', id).eq('user_id', userId); if (error) throw error }
export async function uploadImage(file, folder, userId) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!file.type.startsWith('image/')) throw new Error('Invalid file: please choose an image file.')
  if (file.size > 5 * 1024 * 1024) throw new Error('File too large: images must be smaller than 5MB.')

  const safeName = file.name.replace(/[^a-z0-9.]/gi, '-')
  const uniqueName = `${crypto.randomUUID()}-${safeName}`
  const path = `article-covers/${userId}/${folder}-${uniqueName}`
  const bucket = supabase.storage.from('article-images')
  const { error } = await bucket.upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw error

  const { data } = bucket.getPublicUrl(path)
  return data.publicUrl
}
