import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function authErrorMessage(error) {
	const message = error?.message || 'Something went wrong. Please try again.'
	if (/rate limit|email rate limit|too many requests/i.test(message)) {
		return 'Email sending is temporarily rate-limited by Supabase. Wait before trying again, or configure custom SMTP in your Supabase project.'
	}
	return message
}

export default function AuthForm({ mode }) {
	const isRegister = mode === 'register'
	const isForgot = mode === 'forgot'
	const [form, setForm] = useState({ name: '', username: '', email: '', password: '' })
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [busy, setBusy] = useState(false)
	const navigate = useNavigate()
	const location = useLocation()

	const update = (key, value) => setForm(current => ({ ...current, [key]: value }))

	const submit = async event => {
		event.preventDefault()
		setError('')
		setMessage('')
		if (!supabase) {
			setError('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local first.')
			return
		}
		if (!form.email || (!isForgot && !form.password)) {
			setError('Please complete the required fields.')
			return
		}

		setBusy(true)
		try {
			if (isForgot) {
				const { error: requestError } = await supabase.auth.resetPasswordForEmail(form.email, {
					redirectTo: `${window.location.origin}/reset-password`,
				})
				if (requestError) throw requestError
				setMessage('Check your email for a password reset link.')
			} else if (isRegister) {
				const { error: signupError } = await supabase.auth.signUp({
					email: form.email,
					password: form.password,
					options: { data: { full_name: form.name, username: form.username } },
				})
				if (signupError) throw signupError
				setMessage('Account created. Check your email to confirm your address.')
			} else {
				const { error: loginError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
				if (loginError) throw loginError
				navigate(new URLSearchParams(location.search).get('next') || '/dashboard')
			}
		} catch (requestError) {
			setError(authErrorMessage(requestError))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="auth-page">
			<div className="auth-card">
				<Link className="auth-brand" to="/"><span className="brand-icon">N</span> Nexora</Link>
				<div className="auth-intro">
					<span className="eyebrow">{isForgot ? 'ACCOUNT RECOVERY' : isRegister ? 'JOIN NEXORA' : 'WELCOME BACK'}</span>
					<h1>{isForgot ? 'Reset your password.' : isRegister ? 'Start moving forward.' : 'Good ideas, kept close.'}</h1>
					<p>{isForgot ? 'We will send a secure reset link to your inbox.' : isRegister ? 'Publish the ideas that move people forward.' : 'Sign in to write, save, and keep exploring.'}</p>
				</div>
				{error && <div className="alert error">{error}</div>}
				{message && <div className="alert success">{message}</div>}
				<form onSubmit={submit}>
					{isRegister && <>
						<label>Full name<input value={form.name} onChange={event => update('name', event.target.value)} required /></label>
						<label>Username<input value={form.username} onChange={event => update('username', event.target.value)} required pattern="[A-Za-z0-9_-]+" /></label>
					</>}
					<label>Email<input type="email" value={form.email} onChange={event => update('email', event.target.value)} required /></label>
					{!isForgot && <label>Password<input type="password" value={form.password} onChange={event => update('password', event.target.value)} minLength="8" required /></label>}
					<button className="button full" disabled={busy}>{busy ? 'Working...' : isForgot ? 'Send reset link' : isRegister ? 'Create account' : 'Log in'}</button>
				</form>
				{!isForgot && !isRegister && <Link className="form-link center" to="/forgot-password">Forgot password?</Link>}
				<p className="auth-switch">{isRegister ? 'Already have an account?' : isForgot ? 'Remembered it?' : 'New to Nexora?'} <Link to={isRegister ? '/login' : isForgot ? '/login' : '/register'}>{isRegister ? 'Log in' : isForgot ? 'Log in' : 'Create an account'}</Link></p>
			</div>
		</div>
	)
}
