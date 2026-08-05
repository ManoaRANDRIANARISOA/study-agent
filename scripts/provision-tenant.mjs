import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
  process.exit(1)
}

// We MUST use the service_role key to bypass RLS and create users
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function provisionTenant() {
  const tenantId = process.argv[2] || 'ecole_dev'
  const email = `sync-${tenantId}@studyagent.local`
  const password = process.argv[3] || 'StudyAgent2026!'

  console.log(`Provisioning Tenant: ${tenantId}`)
  console.log(`Creating Sync Account: ${email}`)

  // 1. Create or Update the user in Supabase Auth
  const { data: user, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true,
    app_metadata: {
      ecole_id: tenantId,
      role: 'service_account'
    }
  })

  if (createError) {
    if (createError.message.includes('already exists') || createError.message.includes('already been registered')) {
      console.log(`User ${email} already exists. Updating metadata...`)
      // Fetch existing user to update
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = list?.users.find((u) => u.email === email)
      
      if (existingUser) {
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          password: password,
          app_metadata: {
            ecole_id: tenantId,
            role: 'service_account'
          }
        })
        console.log("User updated successfully.")
      }
    } else {
      console.error('Failed to create user:', createError)
      process.exit(1)
    }
  } else {
    console.log("User created successfully:", user.user.id)
  }

  // 2. Ensure tenant exists in `ecoles` table (Optional but good practice)
  const { error: dbError } = await supabaseAdmin.from('ecoles').upsert({
    id: tenantId,
    name: tenantId === 'ecole_dev' ? 'École de Démonstration' : tenantId,
    status: 'active'
  })

  if (dbError) {
    console.warn("Could not insert into ecoles table:", dbError.message)
  } else {
    console.log(`Tenant ${tenantId} registered in ecoles table.`)
  }

  console.log("✅ Provisioning complete.")
}

provisionTenant()
