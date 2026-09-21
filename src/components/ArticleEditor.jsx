import { useEffect, useState } from 'react'
import { ImagePlus, Save, Send, X } from 'lucide-react'
import { getCategories, saveArticle, uploadImage } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function ArticleEditor({ existing, initialMessage = '', onSaved }) {
	const { user } = useAuth()
	const [categories, setCategories] = useState([])
	const [form, setForm] = useState(
		existing || {
			title: '',
			slug: '',
			excerpt: '',
			content: '',
			cover_image: '',
			category_id: '',
			tags: [],
			published: false,
			reading_time: 1,
		}
	)
	const [tag, setTag] = useState('')
	const [busy, setBusy] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [error, setError] = useState('')
	const [message, setMessage] = useState(initialMessage)

	useEffect(() => {
		getCategories().then(setCategories).catch(err => setError(err.message))
	}, [])

	useEffect(() => {
		if (existing) setForm(existing)
	}, [existing])

	const update = (key, value) => setForm(current => ({ ...current, [key]: value }))

	const makeSlug = value =>
		value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '')

	const addTag = e => {
		if (e.key === 'Enter' && tag.trim()) {
			e.preventDefault()
			update('tags', [...(form.tags || []), tag.trim()])
			setTag('')
		}
	}

	const submit = async (e, forcedPublished = null) => {
		e.preventDefault()
		setError('')
		setMessage('')

		if (!user) {
			setError('Please log in before saving articles.')
			return
		}

		const published = forcedPublished === null ? Boolean(form.published) : forcedPublished
		if (!form.title.trim()) {
			setError('A title is required before saving a draft.')
			return
		}
		if (published && (!form.excerpt.trim() || !form.content.trim() || !form.category_id)) {
			setError('Title, excerpt, content, and category are required before publishing.')
			return
		}

		setBusy(true)

		try {
			const saved = await saveArticle(
				{
					...form,
					published,
					slug: form.slug || makeSlug(form.title),
					reading_time: Math.max(1, Math.ceil((form.content.match(/\S+/g) || []).length / 200)),
				},
				user.id
			)
			setForm(saved)
			setMessage(published ? 'Article published.' : 'Draft saved.')
			onSaved?.(saved)
		} catch (err) {
			setError(err.message)
		} finally {
			setBusy(false)
		}
	}

	const image = async e => {
		const file = e.target.files?.[0]
		if (!file) return

		setError('')
		setMessage('')
		setUploading(true)

		try {
			if (!user) throw new Error('Please log in before uploading images.')
			update('cover_image', await uploadImage(file, 'cover', user.id))
		} catch (err) {
			setError(err.message)
		} finally {
			setUploading(false)
		}
	}

	return (
		<form className="editor" onSubmit={submit}>
			{error && <div className="alert error">{error}</div>}
			{message && <div className="alert success">{message}</div>}

			<div className="editor-main">
				<label>
					Title
					<input
						className="title-input"
						value={form.title}
						onChange={e => {
							const title = e.target.value
							update('title', title)
							update('slug', existing?.id && title === existing.title ? existing.slug : makeSlug(title))
						}}
						placeholder="Give your idea a clear title"
					/>
				</label>

				<label>
					Excerpt
					<textarea
						value={form.excerpt}
						onChange={e => update('excerpt', e.target.value)}
						rows="3"
						placeholder="A short description that earns the click"
					/>
				</label>

				<label>
					Article content
					<textarea
						className="content-input"
						value={form.content}
						onChange={e => update('content', e.target.value)}
						rows="18"
						placeholder="Write in Markdown. Headings, lists, and paragraphs are supported."
					/>
				</label>
			</div>

			<aside className="editor-side">
				<label>
					Category
					<select value={form.category_id} onChange={e => update('category_id', e.target.value)}>
						<option value="">Choose a category</option>
						{categories.map(c => (
							<option value={c.id} key={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</label>

				<label>
					Slug
					<input value={form.slug} onChange={e => update('slug', makeSlug(e.target.value))} />
				</label>

				<label>
					Tags
					<input
						value={tag}
						onChange={e => setTag(e.target.value)}
						onKeyDown={addTag}
						placeholder="Press Enter to add"
					/>
					<div className="tag-list">
						{(form.tags || []).map(t => (
							<button type="button" key={t} onClick={() => update('tags', (form.tags || []).filter(x => x !== t))}>
								{t}
								<X size={12} />
							</button>
						))}
					</div>
				</label>

				<label className="upload-box">
					<ImagePlus size={22} />
					<span>{uploading ? 'Uploading cover image...' : form.cover_image ? 'Cover image ready' : 'Add cover image'}</span>
					<input type="file" accept="image/*" onChange={image} disabled={busy || uploading} />
				</label>

				{form.cover_image && <img className="cover-preview" src={form.cover_image} alt="Cover preview" />}

				<div className="editor-actions">
					<button type="submit" className="button full" disabled={busy || uploading}>
						<Save size={16} />
						{uploading ? 'Uploading...' : busy ? 'Saving...' : 'Save draft'}
					</button>

					<button type="button" className="button outline full" disabled={busy || uploading} onClick={e => submit(e, true)}>
						<Send size={16} />
						Publish
					</button>
				</div>
			</aside>
		</form>
	)
}
