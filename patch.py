import re

with open('C:/rep/School/study agent/src/main/services/sync.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

helper = '''
function getLocalEcoleId() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ecole_id'").get() as any
    if (row && row.value) return row.value.replace(/['"]/g, '')
  } catch(e) {}
  return null
}
'''

# Add getLocalEcoleId at the top after reinitSupabaseClient
content = re.sub(r'(reinitSupabaseClient\(\)\n)', r'\1' + helper, content)

# Update pushLocalChanges to inject ecole_id
push_replacement = '''
        const ecoleId = getLocalEcoleId()
        if (ecoleId && item.table_name !== 'settings') {
          supabasePayload.ecole_id = ecoleId
        }

        // Handle tables with composite unique constraints
'''
content = content.replace('        // Handle tables with composite unique constraints', push_replacement)

# Update pullRemoteChanges to filter by ecole_id
pull_search = "const { data, error } = await supabase.from(table).select('*').gt('updated_at', lastSync)"
pull_replacement = '''
    const ecoleId = getLocalEcoleId()
    let query = supabase.from(table).select('*').gt('updated_at', lastSync)
    if (ecoleId && table !== 'settings') {
      query = query.eq('ecole_id', ecoleId)
    }
    const { data, error } = await query
'''
content = content.replace(pull_search, pull_replacement)

with open('C:/rep/School/study agent/src/main/services/sync.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)
