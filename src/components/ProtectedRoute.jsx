import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
export function ProtectedRoute() { const { user, loading }=useAuth(); const location=useLocation(); if(loading)return <div className="screen-state"><span className="spinner"/>Loading your workspace...</div>; return user?<Outlet/>:<Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace/> }
export function AdminRoute() { const { user, profile, loading }=useAuth(); if(loading)return <div className="screen-state"><span className="spinner"/>Checking permissions...</div>; if(!user)return <Navigate to="/login" replace/>; return profile?.role==='admin'?<Outlet/>:<Navigate to="/dashboard" replace/> }
