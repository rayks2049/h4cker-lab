import React, { useEffect, useRef, useState } from 'react';
import V86 from 'v86';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import linuxVmLogo from './assets/linux-vm-logo.png';
import wasmUrl from 'v86/build/v86.wasm?url';
import '@xterm/xterm/css/xterm.css';
import './browser-linux.css';

const biosBase = 'https://cdn.jsdelivr.net/gh/copy/v86@315b2b0/bios';
const kernelUrl = 'https://raw.githubusercontent.com/Hologram-Technologies/hologram-apps/921dbc0fcd17d2ae68b2908b8f9a369de6a09297/apps/buildroot6/images/buildroot-bzimage68.bin';
const storageName = 'h4cker-webparrot';
const storageKey = 'workspace';
const vmAssets = [
  ['seabios', `${biosBase}/seabios.bin`],
  ['vgabios', `${biosBase}/vgabios.bin`],
  ['kernel', kernelUrl],
];
const trainingRoot = '/tmp/h4cker-lab-training';
const trainingFiles = {
  'intro/scope-card.txt': 'AUTHORIZED SCOPE\nAllowed: portal.training.invalid\nExcluded: mail.training.invalid\nDiscovery clue: dev.training.invalid is not authorization',
  'network/hosts.txt': '192.0.2.1 gateway.training.invalid\n192.0.2.10 portal.training.invalid\n192.0.2.20 files.training.invalid',
  'network/routes.txt': '192.0.2.0/24 via 192.0.2.1 (simulated route)\n192.0.2.10 portal.training.invalid (simulated host)',
  'network/services.txt': '192.0.2.10 80/tcp open http\n192.0.2.10 443/tcp open https\n192.0.2.20 22/tcp open ssh',
  'network/dns.txt': 'training.invalid A 192.0.2.10\ntraining.invalid MX 10 mail.training.invalid\nportal.training.invalid CNAME web.training.invalid',
  'linux/clue.txt': 'Training note: inspect supplied files without modifying them.',
  'web/request.txt': 'GET /help HTTP/1.1\nHost: portal.training.invalid\nContent-Type: text/plain',
  'assessment/finding.txt': 'SIMULATED FINDING\nAsset: portal.training.invalid\nTool note: possible outdated component\nVersion: unknown\nStatus: needs validation',
  'final/review.txt': 'SIMULATED REVIEW\nIn scope: portal.training.invalid\nService: https\nVersion: unknown\nStatus: needs validation',
};
const trainingDirectories = [...new Set(Object.keys(trainingFiles).map((path) => `${trainingRoot}/${path.split('/')[0]}`))];

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function trainingSetup() {
  const commands = [`mkdir -p ${trainingDirectories.map(shellQuote).join(' ')}`];
  for (const [path, content] of Object.entries(trainingFiles)) {
    const file = shellQuote(`${trainingRoot}/${path}`);
    const lines = content.split(/\r?\n/).map(shellQuote).join(' ');
    commands.push(`[ -f ${file} ] || printf '%s\\n' ${lines} > ${file}`);
  }
  return commands;
}

function challengeSetup(challenge) {
  const content = challenge?.vmContent || challenge?.output;
  if (!content) return [];
  const lines = content.split(/\r?\n/).map(shellQuote).join(' ');
  return ['mkdir -p /tmp/ctf', `printf '%s\\n' ${lines} > /tmp/ctf/evidence.txt`];
}

function workspaceSetup(challenge) {
  return [...trainingSetup(), ...challengeSetup(challenge)];
}

function hasShellPrompt(buffer) {
  return buffer.match(/(?:^|\r?\n)((?:~|\/[^\s%]*)?\s*(?:%|#|\$)\s+)$/)?.[1] || '';
}

const modulePractice = {
  intro: { scenario: 'Review the supplied scope card and identify the approved host.', commands: ['cat /tmp/h4cker-lab-training/intro/scope-card.txt', "grep '^Allowed:' /tmp/h4cker-lab-training/intro/scope-card.txt"], checks: ['AUTHORIZED SCOPE', 'Allowed:'] },
  networking: { scenario: 'Inspect simulated hosts, routes, and service records.', commands: ['cat /tmp/h4cker-lab-training/network/hosts.txt', 'cat /tmp/h4cker-lab-training/network/routes.txt', "grep '443/tcp' /tmp/h4cker-lab-training/network/services.txt"], checks: ['portal.training.invalid', '192.0.2.0/24', '443/tcp'] },
  recon: { scenario: 'Inspect the supplied DNS records and locate the mail exchange.', commands: ['cat /tmp/h4cker-lab-training/network/dns.txt', "grep ' MX ' /tmp/h4cker-lab-training/network/dns.txt"], checks: ['training.invalid A', ' MX '] },
  scanning: { scenario: 'Review the simulated service inventory without contacting a host.', commands: ['cat /tmp/h4cker-lab-training/network/services.txt', "grep 'open' /tmp/h4cker-lab-training/network/services.txt"], checks: ['80/tcp', 'open'] },
  web: { scenario: 'Inspect a supplied HTTP request from the fictional application.', commands: ['cat /tmp/h4cker-lab-training/web/request.txt', "grep '^GET ' /tmp/h4cker-lab-training/web/request.txt"], checks: ['GET /help', 'GET /help'] },
  assessment: { scenario: 'Review the fictional finding and check its version evidence.', commands: ['cat /tmp/h4cker-lab-training/assessment/finding.txt', "grep '^Version:' /tmp/h4cker-lab-training/assessment/finding.txt"], checks: ['SIMULATED FINDING', 'Version: unknown'] },
  final: { scenario: 'Review the supplied assessment summary and its current status.', commands: ['cat /tmp/h4cker-lab-training/final/review.txt', "grep '^Status:' /tmp/h4cker-lab-training/final/review.txt"], checks: ['SIMULATED REVIEW', 'Status: needs validation'] },
};

function openWorkspace() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageName, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('snapshots')) request.result.createObjectStore('snapshots');
      if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadVmAssets() {
  const database = await openWorkspace();
  return Promise.all(vmAssets.map(([key, url]) => new Promise((resolve, reject) => {
    const request = database.transaction('assets').objectStore('assets').get(key);
    request.onsuccess = async () => {
      if (request.result instanceof ArrayBuffer) return resolve(request.result);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const transaction = database.transaction('assets', 'readwrite');
        transaction.objectStore('assets').put(buffer, key);
        transaction.oncomplete = () => resolve(buffer);
        transaction.onerror = () => resolve(buffer);
        transaction.onabort = () => resolve(buffer);
      } catch (error) {
        reject(new Error(`Could not download ${key}: ${error.message}`));
      }
    };
    request.onerror = () => reject(request.error);
  })));
}

async function readWorkspace() {
  const database = await openWorkspace();
  return new Promise((resolve, reject) => {
    const request = database.transaction('snapshots').objectStore('snapshots').get(storageKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeWorkspace(snapshot) {
  const database = await openWorkspace();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('snapshots', 'readwrite');
    transaction.objectStore('snapshots').put(snapshot, storageKey);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function clearWorkspace() {
  const database = await openWorkspace();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('snapshots', 'readwrite');
    transaction.objectStore('snapshots').delete(storageKey);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

export default function LinuxVMPractice({ module, lesson, challenge, standalone = false, autoStart = false, onHide, onPracticeComplete, onReady, saveWorkspaceRef }) {
  const terminalElement = useRef(null);
  const terminalRef = useRef(null);
  const emulatorRef = useRef(null);
  const runtimeSeedPending = useRef(false);
  const runtimeSeedInterruptStage = useRef(0);
  const runtimeSeedBuffer = useRef('');
  const runtimeSeedQueue = useRef([]);
  const seededChallengeId = useRef(null);
  const challengeRef = useRef(challenge);
  const onReadyRef = useRef(onReady);
  const commandInput = useRef('');
  const commandProgress = useRef(0);
  const pendingPracticeIndex = useRef(-1);
  const practiceOutputBuffer = useRef('');
  const practiceOutputStarted = useRef(false);
  const moduleTask = modulePractice[module?.id];
  const practiceCommands = lesson?.practiceCommands || moduleTask?.commands || [];
  const practiceExpectedOutput = lesson?.practiceExpectedOutput || moduleTask?.checks || (lesson?.title === 'Navigating and reading' ? ['/', `${trainingRoot}/linux/clue.txt`, 'Training note:'] : ['root', 'clue.txt']);
  const practiceCommandsRef = useRef(practiceCommands);
  const practiceExpectedOutputRef = useRef(practiceExpectedOutput);
  const onPracticeCompleteRef = useRef(onPracticeComplete);
  practiceCommandsRef.current = practiceCommands;
  practiceExpectedOutputRef.current = practiceExpectedOutput;
  onPracticeCompleteRef.current = onPracticeComplete;
  if (saveWorkspaceRef) saveWorkspaceRef.current = saveWorkspace;
  const [completedCommands, setCompletedCommands] = useState(0);
  const [started, setStarted] = useState(autoStart);
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  challengeRef.current = challenge;
  onReadyRef.current = onReady;

  useEffect(() => {
    commandInput.current = '';
    commandProgress.current = 0;
    pendingPracticeIndex.current = -1;
    practiceOutputBuffer.current = '';
    practiceOutputStarted.current = false;
    setCompletedCommands(0);
    onPracticeComplete?.(false);
  }, [lesson]);

  useEffect(() => {
    if (!challenge?.id || !challenge.vmContent || status !== 'ready' || seededChallengeId.current === challenge.id || !emulatorRef.current) return;
    seededChallengeId.current = challenge.id;
    runtimeSeedBuffer.current = '';
    runtimeSeedPending.current = true;
    runtimeSeedInterruptStage.current = 1;
    setStatus('loading');
    onReadyRef.current?.(false);
    terminalRef.current?.clear();
    runtimeSeedQueue.current = challengeSetup(challenge);
    emulatorRef.current.serial0_send('\u0003');
  }, [challenge, status]);

  useEffect(() => {
    if (!started || !terminalElement.current) return undefined;
    let cancelled = false;
    let emulator;
    let terminal;
    let fit;
    let bootTimeout;
    let bootBuffer = '';
    let bootStage = 0;

    async function startLinux() {
      setStatus('loading');
      setError('');
      try {
        const workspace = await readWorkspace().catch(() => null);
        if (cancelled) return;
        const restore = Boolean(workspace?.state);
        setStatus('Loading Linux VM files…');
        const [bios, vgaBios, kernel] = await loadVmAssets();
        if (cancelled) return;
        terminal = new Terminal({ cursorBlink: true, fontFamily: 'Consolas, monospace', fontSize: 13, theme: { background: '#080d0b', foreground: '#d4e7cf', cursor: '#b8ff5c' } });
        fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(terminalElement.current);
        terminalRef.current = terminal;
        fit.fit();
        terminal.onData((data) => {
          for (const char of data) {
            if (char === '\r') {
              const entered = commandInput.current.trim().replace(/\s+/g, ' ');
              const expected = practiceCommandsRef.current[commandProgress.current]?.trim().replace(/\s+/g, ' ');
              const challengeStep = challengeRef.current && (commandProgress.current === 0
                ? /^(ls|find|cd)\b/.test(entered)
                : /^(cat|grep|less|head|tail|awk|sed)\b/.test(entered));
              if (entered && (entered === expected || challengeStep)) {
                pendingPracticeIndex.current = commandProgress.current;
                practiceOutputBuffer.current = '';
                practiceOutputStarted.current = false;
              }
              commandInput.current = '';
            } else if (char === '\u007f' || char === '\b') commandInput.current = commandInput.current.slice(0, -1);
            else if (char === '\u0015' || char === '\u0003') commandInput.current = '';
            else if (char >= ' ') commandInput.current += char;
          }
          emulator?.serial0_send(data);
        });
        setStatus(restore ? 'Restoring saved workspace…' : 'Booting Linux…');
        emulator = new V86({
          wasm_path: wasmUrl,
          memory_size: 64 * 1024 * 1024,
          bios: { buffer: bios },
          vga_bios: { buffer: vgaBios },
          bzimage: { buffer: kernel },
          cmdline: 'console=ttyS0,115200n8 tsc=reliable mitigations=off random.trust_cpu=on',
          filesystem: {},
          ...(restore ? { initial_state: { buffer: workspace.state } } : {}),
          autostart: false,
          disable_keyboard: true,
          disable_mouse: true,
        });
        emulatorRef.current = emulator;
        emulator.add_listener('download-error', (event) => {
          const asset = event.file_name || 'Linux VM asset';
          const statusCode = event.request?.status;
          onReadyRef.current?.(false);
          setStatus('error');
          setError(`Could not load ${asset}${statusCode ? ` (HTTP ${statusCode})` : ''}. Check the connection or network filters, then choose Try again.`);
        });
        emulator.add_listener('serial0-output-byte', (byte) => {
          const char = String.fromCharCode(byte);
          if (bootStage < 2) {
            bootBuffer = (bootBuffer + char).slice(-1000);
            const prompt = hasShellPrompt(bootBuffer);
            if (prompt && bootStage === 0) {
              bootStage = 2;
              bootBuffer = '';
              const initialChallenge = challengeRef.current;
              if (initialChallenge?.id) seededChallengeId.current = initialChallenge.id;
              runtimeSeedPending.current = true;
              runtimeSeedBuffer.current = '';
              runtimeSeedQueue.current = workspaceSetup(initialChallenge);
              emulator.serial0_send(`${runtimeSeedQueue.current.shift()}\n`);
            }
            return;
          }
          if (runtimeSeedPending.current) {
            runtimeSeedBuffer.current = (runtimeSeedBuffer.current + char).slice(-1000);
            const prompt = hasShellPrompt(runtimeSeedBuffer.current);
            if (prompt) {
              if (runtimeSeedInterruptStage.current === 1) {
                runtimeSeedInterruptStage.current = 2;
                runtimeSeedBuffer.current = '';
                emulator.serial0_send('\u0015\r');
                return;
              }
              if (runtimeSeedInterruptStage.current === 2) {
                runtimeSeedInterruptStage.current = 0;
                runtimeSeedBuffer.current = '';
                emulator.serial0_send(`${runtimeSeedQueue.current.shift()}\n`);
                return;
              }
              if (runtimeSeedQueue.current.length) {
                runtimeSeedBuffer.current = '';
                emulator.serial0_send(`${runtimeSeedQueue.current.shift()}\n`);
                return;
              }
              runtimeSeedPending.current = false;
              runtimeSeedBuffer.current = '';
              terminal.reset();
              terminal.write(prompt);
              setStatus('ready');
              onReadyRef.current?.(true);
              window.clearTimeout(bootTimeout);
            }
            return;
          }
          terminal.write(char);
          if (pendingPracticeIndex.current >= 0 && !practiceOutputStarted.current) {
            if (char === '\n') practiceOutputStarted.current = true;
            return;
          }
          if (pendingPracticeIndex.current >= 0) {
            practiceOutputBuffer.current = (practiceOutputBuffer.current + char).slice(-2048);
            const prompt = hasShellPrompt(practiceOutputBuffer.current);
            if (prompt) {
              const challengePractice = Boolean(challengeRef.current);
              const commandOutput = practiceOutputBuffer.current.replace(prompt, '').trim();
              const commandSucceeded = !/No such file|not found|command not found|Permission denied|can't open|can't cd/i.test(commandOutput);
              const challengeStepSucceeded = challengePractice && commandSucceeded && (pendingPracticeIndex.current === 0 || Boolean(commandOutput));
              const expectedOutput = practiceExpectedOutputRef.current[pendingPracticeIndex.current];
              if (challengeStepSucceeded || (!challengePractice && practiceOutputBuffer.current.includes(expectedOutput))) {
                commandProgress.current += 1;
                setCompletedCommands(commandProgress.current);
                if (commandProgress.current === practiceCommandsRef.current.length) onPracticeCompleteRef.current?.(true);
              }
              pendingPracticeIndex.current = -1;
              practiceOutputBuffer.current = '';
              practiceOutputStarted.current = false;
            }
          }
        });
        emulator.add_listener('emulator-loaded', () => {
          setStatus('Booting Linux…');
          bootTimeout = window.setTimeout(() => {
            if (bootStage < 2 || runtimeSeedPending.current) {
              const bootOutput = runtimeSeedPending.current ? runtimeSeedBuffer.current : bootBuffer;
              if (bootOutput) terminal.write(`\r\n${bootOutput}\r\n`);
              onReadyRef.current?.(false);
              setStatus('error');
              setError('Linux did not reach its command prompt. Recent startup output is shown in the terminal. Choose Try again to restart it.');
            }
          }, 45_000);
          if (restore) {
            bootStage = 2;
            const initialChallenge = challengeRef.current;
            if (initialChallenge?.id) seededChallengeId.current = initialChallenge.id;
            runtimeSeedPending.current = true;
            runtimeSeedBuffer.current = '';
            runtimeSeedQueue.current = workspaceSetup(initialChallenge);
            emulator.run();
            emulator.serial0_send(`${runtimeSeedQueue.current.shift()}\n`);
          } else emulator.run();
        });
      } catch (cause) {
        if (!cancelled) { onReadyRef.current?.(false); setStatus('error'); setError(cause.message || 'The Linux VM could not start in this browser.'); }
      }
    }

    startLinux();
    const resize = () => fit?.fit();
    window.addEventListener('resize', resize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', resize);
      window.clearTimeout(bootTimeout);
      terminal?.dispose();
      terminalRef.current = null;
      emulator?.destroy();
      emulatorRef.current = null;
      seededChallengeId.current = null;
    };
  }, [started, retryCount]);

  async function saveWorkspace() {
    if (!emulatorRef.current) return true;
    setSaving(true);
    setError('');
    try {
      const state = await emulatorRef.current.save_state();
      await writeWorkspace({ state });
      setSaved(true);
      return true;
    } catch (cause) { setError(cause.message || 'The browser could not save this workspace.'); return false; }
    finally { setSaving(false); }
  }

  async function resetWorkspace() {
    try { await clearWorkspace(); onReadyRef.current?.(false); setSaved(false); setStarted(false); setStatus('idle'); }
    catch (cause) { setError(cause.message || 'The saved workspace could not be cleared.'); }
  }

  async function copySelection() {
    const selection = terminalRef.current?.getSelection();
    if (!selection) return;
    try { await navigator.clipboard.writeText(selection); }
    catch { setError('Clipboard access is unavailable. Use your browser’s copy shortcut.'); }
  }

  async function pasteClipboard() {
    try { terminalRef.current?.paste(await navigator.clipboard.readText()); }
    catch { setError('Clipboard access is unavailable. Use your browser’s paste shortcut.'); }
  }

  return <section id="linux-vm-practice-panel" className={`linux-vm-practice${standalone ? ' standalone' : ''}`}>
    {(lesson || challenge) && <section className="browser-linux-lesson-task"><div className="eyebrow">{challenge ? 'CTF VM PRACTICE' : `REQUIRED VM PRACTICE · ${lesson.title.toUpperCase()}`}</div><h3>{lesson?.practiceScenario || moduleTask?.scenario || `Inspect the supplied ${module?.title || 'training'} files.`}</h3><p>{lesson?.practiceInstructions || 'Run the listed commands in order. These local fixtures are fictional; network records do not make a network connection.'}</p><div>{challenge ? <><span className={completedCommands > 0 ? 'completed' : ''}>1. Explore the VM filesystem</span><span className={completedCommands > 1 ? 'completed' : ''}>2. Inspect relevant fictional evidence</span></> : practiceCommands.map((command, index) => <code className={index < completedCommands ? 'completed' : ''} key={command}><span>{index < completedCommands ? '✓' : `${index + 1}.`}</span> {command}</code>)}</div></section>}
    {error && <div className="ctf-notice">{error}</div>}
    <section className="browser-linux-workspace"><div className="browser-linux-workspace-head"><div><div className="eyebrow">LINUX VM</div><h2>Terminal <span className={`browser-linux-status ${status}`}>{status === 'idle' ? 'NOT STARTED' : status.toUpperCase()}</span></h2></div><div className="browser-linux-actions">{!started ? <button className="button primary vm-launch-button" onClick={() => setStarted(true)}>Linux <img src={linuxVmLogo} alt="Linux logo" /></button> : status === 'error' ? <><button className="button primary" onClick={() => { setError(''); setStatus('loading'); setRetryCount((count) => count + 1); }}>Try again <span>↻</span></button><button className="button quiet small" onClick={resetWorkspace}>Reset</button></> : <>{status === 'ready' && <><button className="button outline small" onClick={copySelection}>Copy</button><button className="button outline small" onClick={pasteClipboard}>Paste</button></>}<button className="button outline small" onClick={saveWorkspace} disabled={status !== 'ready' || saving}>{saving ? 'Saving…' : saved ? 'Save again' : 'Save workspace'}</button><button className="button quiet small" onClick={resetWorkspace}>Reset</button></>}{onHide && <button className="button quiet small" onClick={onHide} aria-controls="linux-vm-practice-panel" aria-expanded="true">Hide VM ⟶</button>}</div></div><div ref={terminalElement} className={`browser-linux-terminal${started ? '' : ' empty'}`}>{!started && <div><b>Ready when you are.</b><span>Start Linux to begin this lesson’s command practice.</span></div>}</div></section>
  </section>;
}
