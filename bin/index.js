#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import picocolors from 'picocolors';
import ora from 'ora';
import prompts from 'prompts';
import * as asar from '@electron/asar';
import { execSync } from 'child_process';
import figlet from 'figlet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { blue, cyan, green, red, yellow, bold } = picocolors;

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

function printBanner() {
    try {
        const fullArt = figlet.textSync('Claude RTL', { font: 'ANSI Regular' }).split('\n');

        // Claude's official brand terracotta color (#D97757 -> RGB: 217, 119, 87)
        const r = 217, g = 119, b = 87;
        const colorPrefix = `\x1b[38;2;${r};${g};${b}m`;
        const colorSuffix = '\x1b[0m';

        console.log('');
        for (const line of fullArt) {
            if (!line.trim()) continue;
            console.log(colorPrefix + line + colorSuffix);
        }
        console.log('');
        console.log(`\x1b[2m  RTL & UI Patcher for Claude Desktop | ${pkg.version}\x1b[0m\n`);
    } catch (err) {
        // Fallback banner
        console.log(bold(cyan(`\n✨ Claude Smart RTL Patcher v${pkg.version}\n`)));
    }
}

printBanner();

function handleMacPermissionError(err) {
    if (os.platform() === 'darwin') {
        console.error(yellow('\nOn macOS, you can either:'));
        console.error(yellow('  1. Grant your terminal "App Management" permission to run without sudo.'));
        console.error(yellow('  2. Or, run this command with sudo (e.g. sudo npx claude-rtl)'));
        console.log(blue('\nOpening System Settings directly to App Management for you...'));
        try {
            execSync('open "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AppBundles"');
            console.log(green('✔ Settings opened! Please enable the toggle for your terminal, then try again.\n'));
        } catch (e) {
            console.error(yellow('To open manually, go to: System Settings > Privacy & Security > App Management\n'));
        }
    }
}

function getDefaultPath() {
    if (os.platform() === 'darwin') {
        return '/Applications/Claude.app/Contents/Resources/app.asar';
    } else if (os.platform() === 'win32') {
        return path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude', 'resources', 'app.asar');
    } else {
        return '/usr/lib/claude-desktop/resources/app.asar'; // placeholder
    }
}

function getStorePath() {
    if (os.platform() !== 'win32') return null;
    try {
        const stdout = execSync(
            'powershell -Command "Get-AppxPackage *Claude* | Select-Object -ExpandProperty InstallLocation"',
            { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }
        );
        const installDir = stdout.toString().trim();
        if (installDir) {
            const possiblePaths = [
                path.join(installDir, 'app', 'resources', 'app.asar'),
                path.join(installDir, 'resources', 'app.asar')
            ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    return p;
                }
            }
        }
    } catch (e) {
        // PowerShell command failed or package not found
    }
    return null;
}

function makeWritableRecursively(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const stats = fs.statSync(dir);
        if (stats.isDirectory()) {
            fs.chmodSync(dir, 0o777);
            const files = fs.readdirSync(dir);
            for (const file of files) {
                makeWritableRecursively(path.join(dir, file));
            }
        } else {
            fs.chmodSync(dir, 0o666);
        }
    } catch (e) {
        // Ignore permission errors if files cannot be modified
    }
}

function findExecutable(dir) {
    if (!fs.existsSync(dir)) return null;
    try {
        const files = fs.readdirSync(dir);
        // 1. Look for Claude.exe (case-insensitive)
        const claudeExe = files.find(f => f.toLowerCase() === 'claude.exe');
        if (claudeExe) return path.join(dir, claudeExe);

        // 2. Look for any other .exe files, ignoring common helpers
        const exes = files.filter(f => {
            const name = f.toLowerCase();
            return name.endsWith('.exe') &&
                !name.includes('helper') &&
                !name.includes('uninstall') &&
                !name.includes('elevate');
        });
        if (exes.length > 0) {
            return path.join(dir, exes[0]);
        }

        // 3. Fallback to any .exe
        const anyExe = files.find(f => f.toLowerCase().endsWith('.exe'));
        return anyExe ? path.join(dir, anyExe) : null;
    } catch (e) {
        return null;
    }
}

function createWindowsShortcut(exePath, destDir) {
    try {
        const desktopPath = path.join(os.homedir(), 'Desktop');
        const shortcutPath = path.join(desktopPath, 'Claude (Patched).lnk');

        // Normalize paths for Windows shells
        const normShortcutPath = shortcutPath.replace(/\//g, '\\');
        const normExePath = exePath.replace(/\//g, '\\');
        const normDestDir = destDir.replace(/\//g, '\\');

        const script = `$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('${normShortcutPath}'); $Shortcut.TargetPath = '${normExePath}'; $Shortcut.WorkingDirectory = '${normDestDir}'; $Shortcut.Save();`;
        // Escape single quotes for PowerShell
        const escapedScript = script.replace(/'/g, "''");

        execSync(`powershell -Command "${escapedScript}"`, { stdio: 'ignore' });
        return shortcutPath;
    } catch (e) {
        return null;
    }
}

async function getAsarPath() {
    let asarPath = getDefaultPath();
    if (fs.existsSync(asarPath)) {
        console.log(blue(`ℹ Found Claude Desktop installation at:`));
        console.log(`  ${asarPath}\n`);
        return { path: asarPath, isStore: false };
    }

    const storePath = getStorePath();
    if (storePath) {
        console.log(blue(`ℹ Found Microsoft Store Claude Desktop installation at:`));
        console.log(`  ${storePath}\n`);
        return { path: storePath, isStore: true };
    }

    console.log(yellow(`⚠ Could not find Claude Desktop at default location.`));
    const response = await prompts({
        type: 'text',
        name: 'customPath',
        message: 'Please enter the full path to app.asar:'
    });

    if (!response.customPath) {
        console.error(red('\n✖ Invalid path. Aborting.\n'));
        process.exit(1);
    }

    // Strip leading and trailing quotes if the user drag-and-dropped the file
    let cleanPath = response.customPath.trim();
    if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) || 
        (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
        cleanPath = cleanPath.slice(1, -1).trim();
    }

    const isStore = cleanPath.toLowerCase().includes('windowsapps');

    if (!fs.existsSync(cleanPath)) {
        console.error(red('\n✖ Invalid path or file does not exist. Aborting.\n'));
        process.exit(1);
    }
    return { path: cleanPath, isStore };
}

function calculateAsarHeaderHash(filePath) {
    const rawHeader = asar.getRawHeader(filePath);
    return crypto.createHash('sha256').update(rawHeader.headerString).digest('hex');
}

const args = process.argv.slice(2);
const isRestore = args.includes('--restore');

async function main() {
    let { path: asarPath, isStore } = await getAsarPath();
    let workingAsarPath = asarPath;
    let backupPath = asarPath + '.bak';
    
    const plistPath = os.platform() === 'darwin' ? path.join(path.dirname(asarPath), '..', 'Info.plist') : null;
    const plistBackupPath = plistPath ? plistPath + '.bak' : null;

    if (isRestore) {
        if (isStore) {
            const storeDestDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Claude-Patched');
            const shortcutPath = path.join(os.homedir(), 'Desktop', 'Claude (Patched).lnk');
            const spinner = ora('Removing patched Claude copy...').start();
            try {
                if (fs.existsSync(storeDestDir)) {
                    fs.rmSync(storeDestDir, { recursive: true, force: true });
                }
                if (fs.existsSync(shortcutPath)) {
                    fs.rmSync(shortcutPath, { force: true });
                }
                spinner.succeed('Successfully removed patched Claude copy!\n');
                process.exit(0);
            } catch (e) {
                spinner.fail('Failed to remove patched copy.');
                console.error(red(e.message));
                process.exit(1);
            }
        } else {
            if (!fs.existsSync(backupPath)) {
                console.error(red('✖ No backup found to restore.\n'));
                process.exit(1);
            }
            const spinner = ora('Restoring original files...').start();
            try {
                fs.copyFileSync(backupPath, asarPath);
                fs.rmSync(backupPath);

                if (plistBackupPath && fs.existsSync(plistBackupPath)) {
                    fs.copyFileSync(plistBackupPath, plistPath);
                    fs.rmSync(plistBackupPath);
                }

                spinner.succeed('Successfully restored original Claude Desktop!\n');
                process.exit(0);
            } catch (e) {
                spinner.fail('Failed to restore.');
                console.error(red(e.message));
                handleMacPermissionError(e);
                process.exit(1);
            }
        }
    }

    if (isStore) {
        console.log(red('\n⚠️  Microsoft Store Version Detected!'));
        console.log(yellow('Due to Windows security and package integrity restrictions,'));
        console.log(yellow('applications installed from the Microsoft Store cannot be patched directly.\n'));
        console.log(cyan('RECOMMENDED APPROACH:'));
        console.log(cyan('  1. Uninstall the Microsoft Store version of Claude.'));
        console.log(cyan('  2. Download and install the standalone version from: https://claude.ai/download'));
        console.log(cyan('     (This version auto-updates and can be patched without Administrator rights.)\n'));
        console.log(yellow('WORKAROUND APPROACH:'));
        console.log(yellow('  The patcher can copy Claude to your user directory, patch it there,'));
        console.log(yellow('  and create a desktop shortcut named "Claude (Patched)".'));
        console.log(yellow('  NOTE: This copy will NOT receive automatic updates from the Microsoft Store.'));
        console.log(yellow('        It will also take an extra ~200MB of disk space.\n'));

        const choice = await prompts({
            type: 'select',
            name: 'action',
            message: 'How would you like to proceed?',
            choices: [
                { title: 'Abort & download standalone version (Recommended)', value: 'abort' },
                { title: 'Proceed anyway with the local copy workaround', value: 'proceed' }
            ],
            initial: 0
        });

        if (!choice.action || choice.action === 'abort') {
            console.log(blue('\nAborted. Please install the standalone version and try again.\n'));
            process.exit(0);
        }

        console.log(cyan('\nℹ Working on a local copy to bypass WindowsApps restrictions...'));
        const storeDestDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Claude-Patched');
        const appDir = path.dirname(path.dirname(asarPath));

        const copySpinner = ora('Copying Claude to user directory (this may take a few seconds)...').start();
        try {
            if (fs.existsSync(storeDestDir)) {
                fs.rmSync(storeDestDir, { recursive: true, force: true });
            }
            fs.mkdirSync(storeDestDir, { recursive: true });
            if (typeof fs.cpSync === 'function') {
                fs.cpSync(appDir, storeDestDir, { recursive: true });
            } else {
                execSync(`xcopy "${appDir}" "${storeDestDir}" /E /I /H /Y`, { stdio: 'ignore' });
            }

            // Remove read-only attributes from the copied files
            makeWritableRecursively(storeDestDir);

            copySpinner.succeed('Claude application files successfully copied to user directory.');
            
            // Adjust paths to point to the local copy
            workingAsarPath = path.join(storeDestDir, 'resources', 'app.asar');
            backupPath = workingAsarPath + '.bak';
        } catch (e) {
            copySpinner.fail('Failed to copy application files.');
            console.error(red(e.message));
            process.exit(1);
        }
    }

    const spinner = ora('Checking permissions and backing up...').start();
    try {
        fs.accessSync(path.dirname(workingAsarPath), fs.constants.W_OK);
        if (plistPath) {
            fs.accessSync(plistPath, fs.constants.W_OK);
        }

        // Backup app.asar
        if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(workingAsarPath, backupPath);
        }

        // Backup Info.plist on macOS
        if (plistPath && !fs.existsSync(plistBackupPath)) {
            fs.copyFileSync(plistPath, plistBackupPath);
        }
    } catch (e) {
        spinner.fail('Permission Denied.');
        console.error(red('\nSystem Error: ' + e.message));
        if (os.platform() === 'win32') {
            console.error(yellow('\nPlease run your terminal (PowerShell/CMD) as Administrator and try again.\n'));
        } else if (os.platform() === 'darwin') {
            handleMacPermissionError(e);
        } else {
            console.error(yellow('\nPlease run this command with sudo.\n'));
        }
        process.exit(1);
    }
    
    const extractDir = path.join(path.dirname(workingAsarPath), 'app-extracted-claude-rtl-temp');
    spinner.text = 'Extracting app.asar (this may take a few seconds)...';
    try {
        if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
        }
        asar.extractAll(workingAsarPath, extractDir);
    } catch (e) {
        spinner.fail('Failed to extract ASAR.');
        console.error(red(e.message));
        process.exit(1);
    }

    spinner.text = 'Injecting RTL features and enabling DevTools...';
    try {
        const buildDir = path.join(extractDir, '.vite', 'build');
        if (!fs.existsSync(buildDir)) {
            throw new Error('.vite/build not found in ASAR. Unsupported Claude Desktop version.');
        }

        // Inject RTL Loader into index.pre.js
        const indexPrePath = path.join(buildDir, 'index.pre.js');
        if (!fs.existsSync(indexPrePath)) {
            throw new Error('.vite/build/index.pre.js not found in ASAR. Unsupported Claude Desktop version.');
        }

        let indexPreCode = fs.readFileSync(indexPrePath, 'utf8');
        
        if (indexPreCode.includes('/* CLAUDE RTL PATCH START */')) {
            spinner.succeed('Claude Desktop is already patched!');
            fs.rmSync(extractDir, { recursive: true, force: true });
            console.log(green('\n✨ Enjoy your RTL experience!\n'));
            process.exit(0);
        }

        const loaderCode = `
/* CLAUDE RTL PATCH START */
try {
    const { app } = require('electron');

    app.on('web-contents-created', (event, webContents) => {
        // Bypass CSP for data: URIs in font-src for this webContents session
        try {
            const sess = webContents.session;
            if (sess && !sess._cspPatched) {
                sess._cspPatched = true;
                sess.webRequest.onHeadersReceived((details, callback) => {
                    const responseHeaders = details.responseHeaders || {};
                    const url = details.url || '';
                    if (url.includes('claude.ai')) {
                        console.log("[RTL Patcher] Headers received for:", url);
                    }
                    for (const key of Object.keys(responseHeaders)) {
                        if (key.toLowerCase() === 'content-security-policy') {
                            const values = responseHeaders[key];
                            if (url.includes('claude.ai')) {
                                console.log("[RTL Patcher] Found CSP header. Original value:", values[0]);
                            }
                            if (Array.isArray(values)) {
                                responseHeaders[key] = values.map(val => {
                                    let newVal = val;
                                    if (val.includes('font-src')) {
                                        newVal = val.replace(/font-src\\s+([^;]+)/, (match, p1) => {
                                            if (!p1.includes('data:')) {
                                                return "font-src " + p1 + " data:";
                                            }
                                            return match;
                                        });
                                    } else if (val.includes('default-src')) {
                                        newVal = val.replace(/default-src\\s+([^;]+)/, (match, p1) => {
                                            return match + "; font-src " + p1 + " data:";
                                        });
                                    }
                                    if (url.includes('claude.ai')) {
                                        console.log("[RTL Patcher] Modified CSP value:", newVal);
                                    }
                                    return newVal;
                                });
                            }
                        }
                    }
                    callback({ cancel: false, responseHeaders });
                });
            }
        } catch (e) {
            console.error("[RTL Patcher] Failed to register CSP modifier:", e);
        }

        // DevTools Shortcut Handler (F12, Cmd+Option+I, Ctrl+Shift+I)
        webContents.on('before-input-event', (ev, input) => {
            const isShortcut = input.key === 'F12' || 
                (input.control && input.shift && input.key.toLowerCase() === 'i') || 
                (input.meta && input.alt && input.key.toLowerCase() === 'i');
            if (isShortcut && input.type === 'keyDown') {
                try {
                    webContents.toggleDevTools();
                    ev.preventDefault();
                } catch (e) {}
            }
        });

        // Inspect Element Menu
        webContents.on('context-menu', (ev, params) => {
            try {
                const { Menu, MenuItem } = require('electron');
                const menu = new Menu();
                menu.append(new MenuItem({
                    label: 'Inspect Element',
                    click: () => {
                        webContents.inspectElement(params.x, params.y);
                    }
                }));
                menu.popup();
            } catch (e) {}
        });

        webContents.on('console-message', (ev, level, message) => {
            if (typeof message === 'string' && message.startsWith('SAVE_RTL_CONFIG|')) {
                try {
                    const data = message.substring(16);
                    const configPath = require('path').join(require('os').homedir(), '.claude-rtl.json');
                    require('fs').writeFileSync(configPath, data);
                } catch (e) {}
            }
        });
        
        webContents.on('dom-ready', () => {
            try {
                const url = webContents.getURL() || '';
                if (url.includes('devtools') || url.includes('chrome-extension') || url === 'about:blank') {
                    return;
                }
                
                console.log("[RTL Patcher] dom-ready triggered for:", url);
                
                const path = require('path');
                const fs = require('fs');
                const fontPath = path.join(__dirname, 'Vazirmatn-Variable.woff2');
                const payloadPath = path.join(__dirname, 'payload.js');
                
                console.log("[RTL Patcher] __dirname is:", __dirname);
                console.log("[RTL Patcher] fontPath exists:", fs.existsSync(fontPath));
                console.log("[RTL Patcher] payloadPath exists:", fs.existsSync(payloadPath));
                
                if (!fs.existsSync(fontPath) || !fs.existsSync(payloadPath)) {
                    console.error("[RTL Patcher] Missing font or payload assets inside app.asar!");
                    return;
                }
                
                const fontBase64 = fs.readFileSync(fontPath).toString('base64');
                let payload = fs.readFileSync(payloadPath, 'utf8');
                
                // Read config
                let rtlConfig = { faFont: '', enFont: '', codeFont: '', lh: '1.6', isRTL: true, forceRTL: false, fixAtSign: true };
                try {
                    const configPath = path.join(require('os').homedir(), '.claude-rtl.json');
                    if (fs.existsSync(configPath)) {
                        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                        rtlConfig = { ...rtlConfig, ...cfg };
                    }
                } catch (e) {}

                // Replace placeholders in payload
                payload = payload.replace('__FONT_BASE64__', fontBase64);
                payload = payload.replace('__RTL_CONFIG__', JSON.stringify(rtlConfig));

                console.log("[RTL Patcher] Injecting payload.js into main frame...");
                webContents.executeJavaScript(payload)
                    .then(() => console.log("[RTL Patcher] Payload successfully executed!"))
                    .catch(err => console.error("[RTL Patcher] Failed to execute payload.js script:", err));
            } catch (e) {
                console.error("[RTL Patcher] Failed to read RTL patch assets:", e);
            }
        });
    });
} catch(e) {
    console.error("RTL patch initialization failed:", e);
}
/* CLAUDE RTL PATCH END */
`;

        // Append loader to index.pre.js
        indexPreCode += '\n' + loaderCode;
        fs.writeFileSync(indexPrePath, indexPreCode, 'utf8');

        // Copy font file
        const fontSource = path.join(__dirname, 'Vazirmatn-Variable.woff2');
        const fontDest = path.join(buildDir, 'Vazirmatn-Variable.woff2');
        if (fs.existsSync(fontSource)) {
            fs.copyFileSync(fontSource, fontDest);
        }

        // Copy payload file
        const payloadSource = path.join(__dirname, 'payload.js');
        const payloadDest = path.join(buildDir, 'payload.js');
        if (fs.existsSync(payloadSource)) {
            fs.copyFileSync(payloadSource, payloadDest);
        }

    } catch (e) {
        spinner.fail('Injection failed.');
        console.error(red(e.message));
        if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
        process.exit(1);
    }

    spinner.text = 'Repacking app.asar...';
    try {
        await asar.createPackage(extractDir, workingAsarPath);
        fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (e) {
        spinner.fail('Failed to repack ASAR.');
        console.error(red(e.message));
        process.exit(1);
    }

    // Update Info.plist with new hash on macOS
    if (plistPath && fs.existsSync(plistPath)) {
        spinner.text = 'Updating Info.plist ASAR Integrity hash...';
        try {
            const calculatedHash = calculateAsarHeaderHash(workingAsarPath);
            let plistContent = fs.readFileSync(plistPath, 'utf8');
            const hashRegex = /(<key>Resources\/app\.asar<\/key>[\s\S]*?<key>hash<\/key>\s*<string>)([a-f0-9]+)(<\/string>)/;
            
            if (hashRegex.test(plistContent)) {
                plistContent = plistContent.replace(hashRegex, `$1${calculatedHash}$3`);
                fs.writeFileSync(plistPath, plistContent, 'utf8');
            } else {
                throw new Error('Could not find ElectronAsarIntegrity.Resources/app.asar hash key in Info.plist');
            }

            // Re-sign application to fix macOS gatekeeper/signature checks
            spinner.text = 'Re-signing Claude.app...';
            const appPath = path.join(path.dirname(workingAsarPath), '../..');
            execSync(`codesign --force --deep --sign - "${appPath}"`);
            
        } catch (e) {
            spinner.fail('Failed to update Info.plist or re-sign App.');
            console.error(red(e.message));
            process.exit(1);
        }
    }

    spinner.succeed('Successfully patched Claude Desktop!');
    
    if (isStore) {
        const storeDestDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Claude-Patched');
        const exePath = findExecutable(storeDestDir);
        if (exePath) {
            const shortcutPath = createWindowsShortcut(exePath, storeDestDir);
            if (shortcutPath) {
                console.log(green(`✔ Created a desktop shortcut at: ${shortcutPath}`));
            }
            console.log(green(`\n✨ Patched Claude is ready! You can run it from the desktop shortcut or:`));
            console.log(cyan(`  ${exePath}\n`));
        } else {
            console.log(green(`\n✨ Patched Claude is ready in:`));
            console.log(cyan(`  ${storeDestDir}\n`));
        }
    } else {
        console.log(green('\n✨ RTL Features and DevTools have been enabled. Please restart Claude Desktop to see the changes.\n'));
    }
}

main().catch(e => {
    console.error(red('\n✖ An unexpected error occurred:'), e.message);
    process.exit(1);
});
