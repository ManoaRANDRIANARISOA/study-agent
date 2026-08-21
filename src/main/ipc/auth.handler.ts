/**
 * auth.handler.ts — IPC Handlers for Authentication & User Management
 *
 * Registers all IPC channels related to:
 *   - Login / Logout / Session checking
 *   - User CRUD operations (admin only)
 *   - Password management
 *   - Audit log queries
 *
 * All user management channels are protected by RBAC checks.
 * Login/logout channels are public (no prior auth needed).
 *
 * @module AuthHandler
 */

import { ipcMain } from 'electron'
import {
  loginWithPassword,
  logout as authLogout,
  getCurrentUser as authGetCurrentUser,
  checkSession,
  changePassword as authChangePassword,
  resetPassword as authResetPassword
} from '../auth/auth.service'
import { UserRepository, type UserRole } from '../database/repositories/user.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { v4 as uuidv4 } from 'uuid'
import { reinitSupabaseClient, getSupabaseAdmin } from '../services/sync.service'
import db from '../database/db'
import {
  canWrite,
  canRead,
  getCurrentUser,
  getCurrentUserPermissions,
  getAccessibleResources
} from '../auth/rbac.service'
import { destroyAllUserSessions, renewSessionActivity } from '../auth/session.service'
import {
  logLogin,
  logLogout,
  logAction,
  getAuditLogs,
  getAuditLogCount
} from '../auth/audit.service'

/**
 * Register all auth-related IPC handlers.
 * Called once from index.ts on app startup.
 */
export function registerAuthHandlers(): void {
  // ========================================
  // PUBLIC CHANNELS (no auth required)
  // ========================================

  /**
   * Login with username and password.
   * Returns user data and session token on success.
   */
  ipcMain.handle('auth:login', async (_, username: string, password: string) => {
    try {
      const result = await loginWithPassword(username, password)

      // Log the login attempt
      if (result.ok && result.user) {
        logLogin(result.user.id, true)
      } else {
        logLogin(null, false)
      }

      return result
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur de connexion'
      return { ok: false, error: message }
    }
  })

  /**
   * Logout the current user.
   * Requires a session token to destroy.
   */
  ipcMain.handle('auth:logout', async (_, token?: string) => {
    try {
      const user = getCurrentUser()
      logLogout(user?.id || null)
      authLogout(token)
      return { ok: true }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur de déconnexion'
      return { ok: false, error: message }
    }
  })

  /**
   * Get the current authenticated user.
   * Used by the renderer to check auth state on mount.
   */
  ipcMain.handle('auth:getCurrentUser', async () => {
    try {
      const user = authGetCurrentUser()
      return user ?? null
    } catch (e) {
      return null
    }
  })

  /**
   * Check if a session token is still valid.
   * Used on app startup to restore sessions.
   */
  ipcMain.handle('auth:checkSession', async (_, token: string) => {
    try {
      const user = checkSession(token)
      return user
    } catch (e) {
      return null
    }
  })

  /**
   * Check if the database has 0 users (First Boot scenario).
   * Automatically attempts to pull remote users from Supabase before declaring first boot.
   */
  ipcMain.handle('auth:checkFirstBoot', async () => {
    try {
      let count = UserRepository.count()
      if (count === 0) {
        // Tentative de récupération des utilisateurs distants depuis Supabase avant de déclarer le premier boot
        const tenantId = (SettingsRepository.get('ecole_id') as string) || process.env.VITE_DEFAULT_TENANT_ID
        const supabaseAdmin = getSupabaseAdmin()
        if (supabaseAdmin && tenantId) {
          try {
            const { data: remoteUsers, error } = await supabaseAdmin
              .from('users')
              .select('*')
              .eq('ecole_id', tenantId)
              .eq('deleted', false)

            if (!error && remoteUsers && remoteUsers.length > 0) {
              for (const u of remoteUsers) {
                try {
                  db.prepare(`
                    INSERT OR REPLACE INTO users (id, username, password_hash, role, full_name, email, active, version, sync_status, deleted, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)
                  `).run(
                    u.id,
                    u.username,
                    u.password_hash,
                    u.role,
                    u.full_name || null,
                    u.email || null,
                    u.active === false ? 0 : 1,
                    u.version || 1,
                    u.deleted ? 1 : 0,
                    u.created_at || new Date().toISOString(),
                    u.updated_at || new Date().toISOString()
                  )
                } catch (insertErr) {
                  console.warn('Error inserting pulled user into local SQLite:', insertErr)
                }
              }
              count = UserRepository.count()
            }
          } catch (fetchErr) {
            console.warn('[Auth] Remote user check failed:', fetchErr)
          }
        }
      }
      return { isFirstBoot: count === 0 }
    } catch (e) {
      return { isFirstBoot: false }
    }
  })

  /**
   * Create the first admin user (unauthenticated route).
   * Only works if the database has 0 users.
   */
  ipcMain.handle('auth:createFirstAdmin', async (_, userData) => {
    try {
      const count = UserRepository.count()
      if (count > 0) {
        return { success: false, error: "Création non autorisée : un administrateur existe déjà." }
      }

      // Force role to admin for the first user
      const result = UserRepository.create({
        username: userData.username,
        password: userData.password,
        role: 'admin',
        full_name: userData.full_name || 'Administrateur Principal',
        email: userData.email
      })

      // Get existing ecole_id or generate a new one
      let ecoleId = SettingsRepository.get('ecole_id') as string | undefined
      if (!ecoleId) {
        ecoleId = process.env.VITE_DEFAULT_TENANT_ID || uuidv4()
        SettingsRepository.set('ecole_id', ecoleId)
      }
      
      // Initialize Supabase with the new ecoleId to ensure sync works right away
      reinitSupabaseClient(ecoleId)

      if (result.success && result.user) {
        const adminUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.user.id) as any
        if (adminUser) {
          const supabaseAdmin = getSupabaseAdmin()
          if (supabaseAdmin && ecoleId) {
            try {
              await supabaseAdmin.from('users').upsert({
                id: adminUser.id,
                username: adminUser.username,
                password_hash: adminUser.password_hash,
                role: adminUser.role,
                full_name: adminUser.full_name,
                email: adminUser.email,
                active: true,
                version: 1,
                deleted: false,
                ecole_id: ecoleId,
                created_at: adminUser.created_at,
                updated_at: adminUser.updated_at
              })
            } catch (upsertErr) {
              console.warn('[Auth] Remote user upload error:', upsertErr)
            }
          }
        }

        logAction(
          result.user.id,
          'create',
          'users',
          result.user.id,
          null,
          'First boot admin creation'
        )
      }

      return result
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erreur de création du premier admin'
      return { success: false, error: message }
    }
  })

  // ========================================
  // USER MANAGEMENT CHANNELS (admin only)
  // ========================================

  /**
   * Create a new user account.
   * Admin only.
   */
  ipcMain.handle('auth:createUser', async (_, userData) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: création utilisateur' }
    }

    const result = UserRepository.create({
      username: userData.username,
      password: userData.password,
      role: userData.role as UserRole,
      full_name: userData.full_name,
      email: userData.email
    })

    if (result.success && result.user) {
      logAction(
        getCurrentUser()?.id || null,
        'create',
        'users',
        result.user.id,
        null,
        JSON.stringify(result.user)
      )
    }

    return result
  })

  /**
   * Update a user account.
   * Admin only.
   */
  ipcMain.handle('auth:updateUser', async (_, id: string, updates) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: modification utilisateur' }
    }

    const oldUser = UserRepository.getById(id)
    const result = UserRepository.update(id, updates)

    if (result.success) {
      logAction(
        getCurrentUser()?.id || null,
        'update',
        'users',
        id,
        oldUser ? JSON.stringify(oldUser) : null,
        JSON.stringify(updates)
      )
    }

    return result
  })

  /**
   * Deactivate a user account (soft delete).
   * Admin only.
   */
  ipcMain.handle('auth:deactivateUser', async (_, id: string) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: désactivation utilisateur' }
    }

    const result = UserRepository.deactivate(id)

    if (result.success) {
      // Also destroy all sessions for this user
      destroyAllUserSessions(id)
      logAction(getCurrentUser()?.id || null, 'deactivate', 'users', id)
    }

    return result
  })

  /**
   * List all active users.
   * Admin only.
   */
  ipcMain.handle('auth:listUsers', async () => {
    if (!canRead('users')) {
      return { success: false, error: 'Accès refusé: liste utilisateurs' }
    }
    return { success: true, users: UserRepository.list() }
  })

  // ========================================
  // PASSWORD MANAGEMENT
  // ========================================

  /**
   * Change the current user's password.
   * Requires the current password for verification.
   */
  ipcMain.handle(
    'auth:changePassword',
    async (_, userId: string, currentPassword: string, newPassword: string) => {
      // Users can change their own password; admins can change anyone's
      const currentUserObj = getCurrentUser()
      if (!currentUserObj) {
        return { success: false, error: 'Non authentifié' }
      }

      if (currentUserObj.id !== userId && !canWrite('users')) {
        return { success: false, error: 'Accès refusé' }
      }

      const result = authChangePassword(userId, currentPassword, newPassword)

      if (result.success) {
        logAction(currentUserObj.id, 'change_password', 'users', userId)
      }

      return result
    }
  )

  /**
   * Reset a user's password (admin operation).
   * Does not require the current password.
   */
  ipcMain.handle('auth:resetPassword', async (_, userId: string, newPassword: string) => {
    if (!canWrite('users')) {
      return { success: false, error: 'Accès refusé: réinitialisation mot de passe' }
    }

    const result = authResetPassword(userId, newPassword)

    if (result.success) {
      logAction(getCurrentUser()?.id || null, 'reset_password', 'users', userId)
    }

    return result
  })

  // ========================================
  // AUDIT LOG CHANNELS (admin + direction read)
  // ========================================

  /**
   * Query audit logs with filters.
   */
  ipcMain.handle('auth:getAuditLogs', async (_, filters) => {
    if (!canRead('audit')) {
      return { success: false, error: 'Accès refusé: logs audit' }
    }

    const logs = getAuditLogs(filters)
    const count = getAuditLogCount(filters)

    return { success: true, logs, total: count }
  })

  // ========================================
  // SESSION ACTIVITY
  // ========================================

  /**
   * Ping to renew session activity (called by renderer periodically).
   * Prevents session timeout while the user is active.
   */
  ipcMain.handle('auth:activity', async (_, token: string) => {
    renewSessionActivity(token)
    return { ok: true }
  })

  /**
   * Get current user's permissions (for frontend RBAC).
   * Returns the permission matrix for the current user's role.
   */
  ipcMain.handle('auth:getPermissions', async () => {
    const user = getCurrentUser()
    if (!user) return { success: false, error: 'Non authentifié' }

    return {
      success: true,
      user,
      permissions: getCurrentUserPermissions(),
      accessibleResources: getAccessibleResources()
    }
  })
}
