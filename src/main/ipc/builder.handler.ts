import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { getSupabaseAdmin } from '../services/sync.service' // Uses the initialized supabase client
import { uploadSchoolLogo } from '../services/storage.service'

export function registerBuilderHandlers(): void {
  ipcMain.handle('builder:createAndBuild', async (event, config: any) => {
    const sender = event.sender;
    
    // Send log helper
    const log = (msg: string) => {
      console.log(`[Builder] ${msg}`);
      sender.send('builder:log', msg + '\n');
    };

    try {
      // 1. Create Tenant in Supabase
      log(`Création de l'école "${config.nom}" dans Supabase...`);
      
      const defaultParametrage = {
        exonerate_personnel_children: config.exonerate_personnel_children !== false,
        recipient_email: config.recipient_email || config.email || '',
        ...(config.parametrage || {})
      }

      const adminClient = getSupabaseAdmin()

      const { data, error } = await adminClient
        .from('ecoles')
        .insert([
          { nom: config.nom, parametrage: defaultParametrage }
        ])
        .select();

      if (error) {
        throw new Error(`Erreur Supabase: ${error.message}`);
      }

      if (!data || data.length === 0) {
         throw new Error("Aucune donnée retournée par Supabase.");
      }

      const ecoleId = data[0].id;
      log(`✅ École créée avec succès. ID: ${ecoleId}`);

      if (config.logoBase64) {
        log(`Upload du logo vers le cloud...`)
        const logoUrl = await uploadSchoolLogo(ecoleId, config.logoBase64)
        
        // Update parametrage with the logo URL
        const updatedParametrage = { ...defaultParametrage, school_logo: logoUrl }
        await adminClient.from('ecoles').update({ parametrage: updatedParametrage }).eq('id', ecoleId)
        log(`✅ Logo uploadé et configuration mise à jour.`)
      }

      // 2. Modifying .env
      const envPath = path.join(process.cwd(), '.env');
      log(`Lecture du fichier .env: ${envPath}`);
      
      if (!fs.existsSync(envPath)) {
        throw new Error("Fichier .env introuvable à la racine.");
      }
      
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Nettoyer si les lignes existent déjà
      envContent = envContent.replace(/^VITE_DEFAULT_TENANT_ID=.*$/gm, '');
      envContent = envContent.replace(/^VITE_APP_NAME=.*$/gm, '');
      
      // Ajouter les nouvelles valeurs
      envContent += `\nVITE_DEFAULT_TENANT_ID=${ecoleId}`;
      if (config.appName) {
        envContent += `\nVITE_APP_NAME="${config.appName}"`;
      }
      envContent += '\n';
      
      fs.writeFileSync(envPath, envContent, 'utf8');
      log(`✅ Identifiants et Noms injectés dans le .env.`);

      // 2.5 Traitement du Logo
      if (config.logoBase64) {
        log(`Traitement du Logo personnalisé...`);
        const matches = config.logoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const buffer = Buffer.from(matches[2], 'base64');
          const iconPath = path.join(process.cwd(), 'resources', 'icon.png');
          const logoPath = path.join(process.cwd(), 'resources', 'logo.png');
          
          fs.writeFileSync(iconPath, buffer);
          fs.writeFileSync(logoPath, buffer);
          log(`✅ Logo sauvegardé dans les ressources.`);
        }
      }

      // 3. Spawning npm run build:win
      log(`Lancement de la compilation (npm run build:win)... Cela peut prendre quelques minutes.`);
      
      // On Windows it's usually npm.cmd
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      
      return new Promise((resolve) => {
        const buildProcess = spawn(npmCmd, ['run', 'build:win'], {
          cwd: process.cwd(),
          shell: true,
          env: {
            ...process.env,
            VITE_APP_NAME: config.appName || 'Study Agent'
          } // Inject APP_NAME for electron-builder
        });

        buildProcess.stdout.on('data', (data) => {
          sender.send('builder:log', data.toString());
        });

        buildProcess.stderr.on('data', (data) => {
          sender.send('builder:log', data.toString());
        });

        buildProcess.on('close', (code) => {
          if (code === 0) {
            log(`✅ Compilation terminée avec succès ! (Code ${code})`);
            log(`L'exécutable personnalisé se trouve dans le dossier 'dist'.`);
            
            // Clean up .env
            log(`Nettoyage du fichier .env...`);
            let finalEnv = fs.readFileSync(envPath, 'utf8');
            finalEnv = finalEnv.replace(/^VITE_DEFAULT_TENANT_ID=.*$/gm, '');
            finalEnv = finalEnv.replace(/^VITE_APP_NAME=.*$/gm, '');
            fs.writeFileSync(envPath, finalEnv, 'utf8');
            log(`✅ Nettoyage terminé.`);
            
            resolve({ success: true, ecoleId });
          } else {
            log(`❌ La compilation a échoué avec le code ${code}.`);
            // Toujours nettoyer le env en cas d'erreur
            let finalEnv = fs.readFileSync(envPath, 'utf8');
            finalEnv = finalEnv.replace(/^VITE_DEFAULT_TENANT_ID=.*$/gm, '');
            finalEnv = finalEnv.replace(/^VITE_APP_NAME=.*$/gm, '');
            fs.writeFileSync(envPath, finalEnv, 'utf8');
            resolve({ success: false, error: `Build failed with code ${code}` });
          }
        });
        
        buildProcess.on('error', (err) => {
           log(`❌ Erreur de lancement du processus de build: ${err.message}`);
           resolve({ success: false, error: err.message });
        });
      });

    } catch (e: any) {
      log(`❌ Erreur Critique : ${e.message}`);
      return { success: false, error: e.message };
    }
  });
}
