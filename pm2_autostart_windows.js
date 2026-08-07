const fs = require('fs');
const path = require('path');

const startupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const shortcutPath = path.join(startupDir, 'PM2_Autostart.vbs');

const cwd = __dirname;

const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${cwd.replace(/\\/g, '\\\\')}"
WshShell.Run "cmd /c npx pm2 resurrect", 0, False
`;

fs.writeFileSync(shortcutPath, vbsContent);
console.log('✔ Inicio automático de PM2 en Windows configurado con éxito.');
