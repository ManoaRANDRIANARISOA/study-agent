/**
 * App.tsx — Root Application Component (lightweight)
 *
 * Responsabilités :
 *   - Router HashRouter
 *   - ErrorBoundary global
 *   - AuthInitializer (vérifie session existante)
 *   - AppRoutes (login vs layout authentifié)
 *
 * Tout le layout authentifié est délégué à <MainLayout />.
 *
 * @module App
 */

import React, { useEffect, useState } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import { useAppStore } from '@/store/useAppStore'

import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LoginPage from '@/pages/auth/LoginPage'
import MainLayout from '@/components/layout/MainLayout'

import TenantOnboarding from '@/components/TenantOnboarding'
import SuperAdminBuilder from '@/pages/SuperAdminBuilder'
import FirstBootOnboarding from '@/pages/FirstBootOnboarding'

import SubscriptionBlocker from '@/components/SubscriptionBlocker'

// --------------------------------------------
// Auth Initialization Wrapper
// --------------------------------------------
function AuthInitializer({ children }: { children: React.ReactNode | ((isFirstBoot: boolean | null) => React.ReactNode) }) {
  const checkExistingSession = useAuthStore((s) => s.checkExistingSession)
  const loading = useAuthStore((s) => s.loading)
  const fetchSettings = useAppStore((s) => s.fetchSettings)
  const [initialized, setInitialized] = useState(false)
  const [tenantConfigured, setTenantConfigured] = useState<boolean | null>(null)
  const [isFirstBoot, setIsFirstBoot] = useState<boolean | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockedSchoolName, setBlockedSchoolName] = useState('')

  const checkSub = async () => {
    try {
      const subRes = await window.api.tenant.checkSubscription()
      if (subRes && subRes.success) {
        setIsBlocked(!!subRes.isBlocked)
        if (subRes.schoolName) {
          setBlockedSchoolName(subRes.schoolName)
        }
      }
    } catch (err) {
      console.warn('Subscription check error:', err)
    }
  }

  useEffect(() => {
    // 1. D'abord vérifier si le Tenant est configuré
    window.api.tenant.check().then((res) => {
      setTenantConfigured(res.isConfigured)
      if (res.isConfigured) {
        // Vérifier le statut de l'abonnement
        checkSub()

        // Charger la configuration de l'école (nom, logo, couleurs, etc.)
        fetchSettings().finally(() => {
          // 2. Vérifier s'il n'y a aucun utilisateur (First Boot)
          window.api.auth.checkFirstBoot().then((bootRes) => {
            setIsFirstBoot(bootRes.isFirstBoot)
            
            if (!bootRes.isFirstBoot) {
              // 3. S'il y a des utilisateurs, on check la session
              checkExistingSession().finally(() => setInitialized(true))
            } else {
              // C'est le premier lancement, on est prêt
              setInitialized(true)
            }
          })
        })
      } else {
        // S'il n'est pas configuré, on arrête le chargement pour afficher l'onboarding
        setInitialized(true)
      }
    })
  }, [checkExistingSession])

  if (tenantConfigured === null || (!initialized || (tenantConfigured && loading))) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  // Si pas de tenant, on affiche la page d'onboarding
  if (!tenantConfigured) {
    return (
      <TenantOnboarding
        onComplete={() => {
          // Recharge complètement l'app pour relancer les stores et sync.service avec le nouveau tenant
          window.location.reload()
        }}
      />
    )
  }

  // Si l'abonnement est suspendu, afficher l'écran de blocage poli
  // (sauf si on est sur la route de superadmin en dev)
  const isSuperAdminRoute = window.location.hash.includes('/superadmin')

  return (
    <>
      {isBlocked && !isSuperAdminRoute && (
        <SubscriptionBlocker
          schoolName={blockedSchoolName}
          onRefresh={checkSub}
        />
      )}
      {typeof children === 'function' ? children(isFirstBoot) : children}
    </>
  )
}

// --------------------------------------------
// Route Switcher
// --------------------------------------------
function AppRoutes({ isFirstBoot }: { isFirstBoot: boolean | null }): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return (
    <Routes>
      <Route
        path="/onboarding"
        element={isFirstBoot ? <FirstBootOnboarding /> : <Navigate to="/" replace />}
      />
      <Route
        path="/login"
        element={isFirstBoot ? <Navigate to="/onboarding" replace /> : isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/*"
        element={isFirstBoot ? <Navigate to="/onboarding" replace /> : isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />}
      />
      {/* Route protégée : uniquement en mode développement */}
      {import.meta.env.DEV && (
        <Route path="/superadmin" element={<SuperAdminBuilder />} />
      )}
    </Routes>
  )
}

// --------------------------------------------
// Root
// --------------------------------------------
export default function App(): React.JSX.Element {
  // On remonte isFirstBoot au niveau de AuthInitializer en utilisant un context ou via children prop render
  // Ou plus simple, on modifie AuthInitializer pour passer isFirstBoot en cloneElement ou Context
  // Pour la simplicité, déplaçons la logique de Router dans AppRoutes 
  return (
    <Router>
      <ErrorBoundary>
        <AuthInitializer>
          {(isFirstBoot) => (
            <>
              <AppRoutes isFirstBoot={isFirstBoot} />
              <Toaster position="top-center" richColors />
            </>
          )}
        </AuthInitializer>
      </ErrorBoundary>
    </Router>
  )
}
