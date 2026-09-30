<#
.SYNOPSIS
    Script d'installation et configuration automatique de l'imprimante thermique Xprinter / POS-80 pour Study Agent.
#>

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Study Agent - Assistant d'installation Imprimante POS" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier les imprimantes installées
$printers = Get-Printer | Where-Object { $_.Name -match "POS|XP|Thermal|Receipt|80|58" }

if ($printers) {
    Write-Host "Imprimante(s) thermique(s) detectee(s) :" -ForegroundColor Green
    foreach ($p in $printers) {
        Write-Host " - $($p.Name) (Port: $($p.PortName), Pilote: $($p.DriverName))" -ForegroundColor White
    }
} else {
    Write-Host "Aucune imprimante POS detectee automatiquement." -ForegroundColor Yellow
    Write-Host "Assurez-vous que l'imprimante est branchee en USB et allumee." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Toutes les imprimantes Windows disponibles :" -ForegroundColor Cyan
Get-Printer | Select-Object Name, PortName, DriverName | Format-Table -AutoSize

Write-Host "Fin du diagnostic. Vous pouvez selectionner votre imprimante dans Parametres -> Imprimante Thermique." -ForegroundColor Green
