import * as fs from 'fs'
import * as path from 'path'
import { supabase } from './sync.service'

/**
 * Uploads a local file to Supabase Storage bucket 'school_files'
 * and returns the public URL.
 * If the upload fails (e.g., offline) or if the path is already a URL,
 * it returns the original path.
 */
export async function uploadToStorage(localPath: string, folder: string = ''): Promise<string> {
  // If it's already a URL or a base64, do not upload
  if (
    !localPath ||
    localPath.startsWith('http://') ||
    localPath.startsWith('https://') ||
    localPath.startsWith('data:')
  ) {
    return localPath
  }

  // Normalize path
  const normalizedPath = path.normalize(localPath)

  try {
    if (!fs.existsSync(normalizedPath)) {
      console.warn(`[StorageService] File not found: ${normalizedPath}`)
      return localPath
    }

    const fileBuffer = await fs.promises.readFile(normalizedPath)

    // Determine mime type
    const ext = path.extname(normalizedPath).toLowerCase()
    let mimeType = 'application/octet-stream'
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
    else if (ext === '.png') mimeType = 'image/png'
    else if (ext === '.webp') mimeType = 'image/webp'
    else if (ext === '.gif') mimeType = 'image/gif'

    // Create a unique filename
    const fileName = `${folder ? folder + '/' : ''}${Date.now()}_${path.basename(normalizedPath)}`

    console.log(`[StorageService] Uploading ${fileName} to school_files...`)

    const { error } = await supabase.storage.from('school_files').upload(fileName, fileBuffer, {
      contentType: mimeType,
      upsert: true
    })

    if (error) {
      console.error(`[StorageService] Upload error:`, error)
      return localPath // Fallback to local path if upload fails
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('school_files').getPublicUrl(fileName)

    if (urlData && urlData.publicUrl) {
      console.log(`[StorageService] Upload successful: ${urlData.publicUrl}`)
      return urlData.publicUrl
    }

    return localPath
  } catch (error) {
    console.error(`[StorageService] Error processing file:`, error)
    return localPath
  }
}

/**
 * Uploads a base64 logo to the school_files bucket.
 */
export async function uploadSchoolLogo(ecoleId: string, base64Data: string): Promise<string> {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return base64Data
  }

  try {
    const matches = base64Data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/)
    if (!matches || matches.length !== 3) {
      return base64Data
    }
    
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
    const buffer = Buffer.from(matches[2], 'base64')
    const fileName = `logos/${ecoleId}/logo.${ext}`

    console.log(`[StorageService] Uploading school logo to school_files/${fileName}...`)

    const { error } = await supabase.storage.from('school_files').upload(fileName, buffer, {
      contentType: `image/${matches[1]}`,
      upsert: true
    })

    if (error) {
      console.error(`[StorageService] Logo upload error:`, error)
      return base64Data
    }

    const { data: urlData } = supabase.storage.from('school_files').getPublicUrl(fileName)
    
    if (urlData && urlData.publicUrl) {
      console.log(`[StorageService] Logo upload successful: ${urlData.publicUrl}`)
      return urlData.publicUrl
    }
    
    return base64Data
  } catch (error) {
    console.error(`[StorageService] Error processing logo upload:`, error)
    return base64Data
  }
}
