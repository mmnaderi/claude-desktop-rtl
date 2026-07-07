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
        const fullArt = figlet.textSync('Claude RTL', { font: 'RubiFont' }).split('\n');

        // Terracotta / Clay theme gradient colors (brand aligned)
        const hexColors = [
            '#D97757',
            '#E28A6D',
            '#EB9D83',
            '#F0AC95',
            '#F5C4B4',
            '#FADBCF'
        ];

        // Parse hex to RGB
        const colors = hexColors.map(hex => {
            const bigint = parseInt(hex.replace('#', ''), 16);
            return {
                r: (bigint >> 16) & 255,
                g: (bigint >> 8) & 255,
                b: bigint & 255
            };
        });

        const applyGradient = (text) => {
            let result = '';
            const len = text.length;
            for (let i = 0; i < len; i++) {
                const char = text[i];
                if (char === ' ' || char === '\n') {
                    result += char;
                    continue;
                }
                const factor = len > 1 ? i / (len - 1) : 0;
                
                // Find current segment in the multi-color transition
                const segments = colors.length - 1;
                const segmentFloat = factor * segments;
                const segmentIdx = Math.min(Math.floor(segmentFloat), segments - 1);
                const segmentFactor = segmentFloat - segmentIdx;

                const cStart = colors[segmentIdx];
                const cEnd = colors[segmentIdx + 1];

                const r = Math.round(cStart.r + segmentFactor * (cEnd.r - cStart.r));
                const g = Math.round(cStart.g + segmentFactor * (cEnd.g - cStart.g));
                const b = Math.round(cStart.b + segmentFactor * (cEnd.b - cStart.b));

                result += `\x1b[38;2;${r};${g};${b}m${char}\x1b[0m`;
            }
            return result;
        };

        console.log('');
        for (const line of fullArt) {
            if (!line.trim()) continue;
            console.log(applyGradient(line));
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

async function getAsarPath() {
    let asarPath = getDefaultPath();
    if (fs.existsSync(asarPath)) {
        console.log(blue(`ℹ Found Claude Desktop installation at:`));
        console.log(`  ${asarPath}\n`);
        return asarPath;
    }

    console.log(yellow(`⚠ Could not find Claude Desktop at default location.`));
    const response = await prompts({
        type: 'text',
        name: 'customPath',
        message: 'Please enter the full path to app.asar:'
    });

    if (!response.customPath || !fs.existsSync(response.customPath)) {
        console.error(red('\n✖ Invalid path. Aborting.\n'));
        process.exit(1);
    }
    return response.customPath;
}

function calculateAsarHeaderHash(filePath) {
    const rawHeader = asar.getRawHeader(filePath);
    return crypto.createHash('sha256').update(rawHeader.headerString).digest('hex');
}

const args = process.argv.slice(2);
const isRestore = args.includes('--restore');

async function main() {
    const asarPath = await getAsarPath();
    const backupPath = asarPath + '.bak';
    
    const plistPath = os.platform() === 'darwin' ? path.join(path.dirname(asarPath), '..', 'Info.plist') : null;
    const plistBackupPath = plistPath ? plistPath + '.bak' : null;

    if (isRestore) {
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

    const spinner = ora('Checking permissions and backing up...').start();
    try {
        fs.accessSync(path.dirname(asarPath), fs.constants.W_OK);
        if (plistPath) {
            fs.accessSync(plistPath, fs.constants.W_OK);
        }

        // Backup app.asar
        if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(asarPath, backupPath);
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
    
    const extractDir = path.join(path.dirname(asarPath), 'app-extracted-claude-rtl-temp');
    spinner.text = 'Extracting app.asar (this may take a few seconds)...';
    try {
        if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
        }
        asar.extractAll(asarPath, extractDir);
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
        await asar.createPackage(extractDir, asarPath);
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
            const calculatedHash = calculateAsarHeaderHash(asarPath);
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
            const appPath = path.join(path.dirname(asarPath), '../..');
            execSync(`codesign --force --deep --sign - "${appPath}"`);
            
        } catch (e) {
            spinner.fail('Failed to update Info.plist or re-sign App.');
            console.error(red(e.message));
            process.exit(1);
        }
    }

    spinner.succeed('Successfully patched Claude Desktop!');
    console.log(green('\n✨ RTL Features and DevTools have been enabled. Please restart Claude Desktop to see the changes.\n'));
}

main().catch(e => {
    console.error(red('\n✖ An unexpected error occurred:'), e.message);
    process.exit(1);
});
