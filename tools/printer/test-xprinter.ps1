param (
    [string]$PrinterName = ""
)

Write-Host "Envoi d'un ticket test ESC/POS natif..." -ForegroundColor Cyan

if (-not $PrinterName) {
    $found = Get-Printer | Where-Object { $_.Name -match "POS|XP|Thermal|Receipt" } | Select-Object -First 1
    if ($found) {
        $PrinterName = $found.Name
    } else {
        $PrinterName = (Get-CimInstance Win32_Printer | Where-Object Default -eq $true).Name
    }
}

if (-not $PrinterName) {
    Write-Host "Erreur : Aucune imprimante trouvee." -ForegroundColor Red
    exit 1
}

Write-Host "Imprimante cible : $PrinterName" -ForegroundColor Green

# Initialiser la chaîne ESC/POS
# ESC @ (Init), ESC a 1 (Centré), GS ! 17 (Double taille), ESC d 2, GS V 65 0 (Coupe)
$rawCode = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] bytes) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "Test Study Agent POS";
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@

Add-Type -TypeDefinition $rawCode

$stream = New-Object System.IO.MemoryStream
$stream.WriteByte(0x1B); $stream.WriteByte(0x40) # Init
$stream.WriteByte(0x1B); $stream.WriteByte(0x61); $stream.WriteByte(0x01) # Align Center
$stream.WriteByte(0x1D); $stream.WriteByte(0x21); $stream.WriteByte(0x11) # Double Size

$enc = [System.Text.Encoding]::GetEncoding(850)
$header = $enc.GetBytes("STUDY AGENT`n")
$stream.Write($header, 0, $header.Length)

$stream.WriteByte(0x1D); $stream.WriteByte(0x21); $stream.WriteByte(0x00) # Normal Size
$sub = $enc.GetBytes("TEST D'IMPRESSION DIRECTE`n--------------------------------`nESC/POS Direct Spooler OK !`n`n`n`n")
$stream.Write($sub, 0, $sub.Length)

# Massicot
$stream.WriteByte(0x1D); $stream.WriteByte(0x56); $stream.WriteByte(0x41); $stream.WriteByte(0x03)

$bytes = $stream.ToArray()
$res = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)

if ($res) {
    Write-Host "Ticket test imprime avec succes sur $PrinterName !" -ForegroundColor Green
} else {
    Write-Host "Echec de l'envoi vers $PrinterName." -ForegroundColor Red
}
