import React, { useState } from 'react'


export const SuperAdminSetup: React.FC = () => {
  const [ecoleId, setEcoleId] = useState('')
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    try {
      // Appel IPC pour sauvegarder dans la base locale
      await window.electron.ipcRenderer.invoke('save-setting', 'ecole_id', ecoleId)
      setMessage("Configuration sauvegardée. Veuillez redémarrer l'application.")
    } catch (e: any) {
      setMessage('Erreur: ' + e.message)
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto bg-white rounded-xl shadow-md mt-10">
      <h2 className="text-2xl font-bold mb-4 text-red-600">Configuration SuperAdmin</h2>
      <p className="mb-4 text-gray-600">
        Attention : Cette interface permet d'associer cette instance locale à un établissement côté serveur (SaaS). 
        Ne modifiez cet ID que si vous savez ce que vous faites.
      </p>
      
      <div className="mb-4">
        <label className="block text-gray-700 font-bold mb-2">ID de l'établissement (ecole_id)</label>
        <input 
          type="text" 
          value={ecoleId}
          onChange={(e) => setEcoleId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="ex: 123e4567-e89b-12d3-a456-426614174000"
        />
      </div>

      <button 
        onClick={handleSave}
        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
      >
        Sauvegarder et Lier
      </button>

      {message && (
        <div className="mt-4 p-3 bg-gray-100 rounded text-sm text-gray-800">
          {message}
        </div>
      )}
    </div>
  )
}
