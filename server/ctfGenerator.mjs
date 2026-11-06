import { randomInt, randomUUID } from 'node:crypto';

const pick = (items) => items[randomInt(items.length)];
const points = { Easy: 100, Medium: 200, High: 300 };

function scopeChallenge(difficulty) {
  const allowed = `app-${randomInt(120, 990)}.training.invalid`;
  const excluded = `mail-${randomInt(120, 990)}.training.invalid`;
  const discovered = `dev-${randomInt(120, 990)}.training.invalid`;
  return {
    title: 'Read the scope card', category: 'Authorization', difficulty,
    prompt: 'Enter the only authorized hostname exactly as shown.',
    output: `SIMULATED SCOPE\nAllowed: ${allowed}\nExcluded: ${excluded}\nDiscovery note: ${discovered}`,
    hint: 'Use the owner-approved Allowed line. Discovery notes do not add targets to scope.',
    answer: allowed,
    explanation: `${allowed} is explicitly allowed. The excluded host and discovered hostname are not authorized.`,
  };
}

function serviceChallenge(difficulty) {
  const services = [{ port: 22, name: 'ssh' }, { port: 53, name: 'dns' }, { port: 80, name: 'http' }, { port: 443, name: 'https' }, { port: 25, name: 'smtp' }];
  const service = pick(services);
  return {
    title: 'Match the service label', category: 'Networking', difficulty,
    prompt: `What service label is shown for ${service.port}/tcp? Enter only the label (for example, https).`,
    output: `SIMULATED INVENTORY\n${service.port}/tcp open ${service.name}\nVersion: unknown`,
    hint: 'Enter the final word on the port line. Do not include the state word “open”.',
    answer: service.name,
    explanation: `The supplied record labels port ${service.port}/tcp as ${service.name}; the software version remains unknown.`,
  };
}

function permissionChallenge(difficulty) {
  const rows = [
    { bits: 'rw-r-----', answer: 'owner and group', words: 'the owner and group' },
    { bits: 'rw-------', answer: 'owner only', words: 'the owner only' },
    { bits: 'r--r--r--', answer: 'owner, group, and others', words: 'the owner, group, and others' },
    { bits: 'rwxr-x---', answer: 'owner and group', words: 'the owner and group' },
  ];
  const item = pick(rows);
  return {
    title: 'Read file permissions', category: 'Linux', difficulty,
    prompt: 'Who can read the file? Enter your answer in plain text.',
    output: `SIMULATED FILE LISTING\n${item.bits} learner team report.txt`,
    hint: 'The first triplet is for the owner, the second for the group, and the last for others.',
    answer: `FLAG{${item.answer}}`,
    explanation: `These permission bits allow ${item.words} to read the file.`,
  };
}

function httpChallenge(difficulty) {
  const paths = ['/help', '/status', '/profile', '/reports', '/settings', '/docs'];
  const path = `${pick(paths)}-${randomInt(2, 90)}`;
  return {
    title: 'Find the requested path', category: 'Web', difficulty,
    prompt: 'Enter the requested path exactly as shown, including its leading slash.',
    output: `SIMULATED HTTP REQUEST\n${pick(['GET', 'HEAD'])} ${path} HTTP/1.1\nHost: portal.training.invalid`,
    hint: 'The requested path follows the HTTP method. Convert `/` to `_` inside the flag.',
    answer: path,
    explanation: `The requested path is ${path}.`,
  };
}

function dnsChallenge(difficulty) {
  const host = `mx-${randomInt(100, 999)}.training.invalid`;
  return {
    title: 'Read the simulated DNS record', category: 'Reconnaissance', difficulty,
    prompt: 'Which hostname is named by the MX record? Enter it exactly, including dots and hyphens.',
    output: `SIMULATED DNS RESULTS\ntraining.invalid A 192.0.2.${randomInt(10, 240)}\ntraining.invalid MX 10 ${host}\nportal.training.invalid CNAME web-${randomInt(10, 99)}.training.invalid`,
    hint: 'Find the line labeled MX. Ignore the A and CNAME records.',
    answer: host,
    explanation: `${host} is the hostname in the MX record.`,
  };
}

function evidenceChallenge(difficulty) {
  const component = pick(['web framework', 'TLS library', 'database driver', 'HTTP service']);
  const missing = pick(['version evidence is missing', 'the affected build is unknown', 'no impact evidence is supplied']);
  return {
    title: 'Separate lead from finding', category: 'Assessment', difficulty,
    prompt: difficulty === 'High' ? `A scanner raised a possible issue for a ${component}, but ${missing}. Submit FLAG{needs_validation}.` : `A scanner raised a possible issue for a ${component}, but ${missing}. What is the finding status? Answer in plain text.`,
    output: `SIMULATED ASSESSMENT\nComponent: ${component}\nTool result: possible issue\nEvidence: ${missing}`,
    hint: 'A tool alert is a lead until evidence confirms that it applies.',
    answer: difficulty === 'High' ? 'FLAG{needs_validation}' : 'needs validation',
    explanation: 'This is a potential finding and needs validation before it can be reported as confirmed.',
  };
}

function integratedChallenge(difficulty) {
  const host = `web-${randomInt(120, 990)}.training.invalid`;
  const excluded = `admin-${randomInt(120, 990)}.training.invalid`;
  const port = pick([{ number: 443, service: 'https' }, { number: 80, service: 'http' }]);
  return {
    title: 'Write a careful summary', category: 'Evidence review', difficulty,
    prompt: `Only ${host} is in scope. Submit FLAG{<host>_<service>_version_unknown}; copy the hostname exactly and use underscores only between the fields.`,
    output: `SIMULATED REVIEW\nIn scope: ${host}\nExcluded: ${excluded}\n${port.number}/tcp open ${port.service}\nVersion: unknown\nFinding evidence: none`,
    hint: 'Use only the in-scope host and the observed service. Do not claim an unverified vulnerability.',
    answer: `FLAG{${host}_${port.service}_version_unknown}`,
    explanation: `${host} has an observed ${port.service} service in the supplied output; version and vulnerability status are unknown.`,
  };
}

const templates = {
  Easy: [scopeChallenge, serviceChallenge, permissionChallenge],
  Medium: [httpChallenge, dnsChallenge, evidenceChallenge],
  High: [integratedChallenge, evidenceChallenge],
};

export function generateChallenges(difficulty, roundNumber, count = 5) {
  return Array.from({ length: count }, (_, index) => {
    const challenge = pick(templates[difficulty] || templates.Easy)(difficulty);
    const caseId = `ROUND-${String(roundNumber).padStart(4, '0')}-CHALLENGE-${index + 1}`;
    return { id: randomUUID(), points: points[difficulty] || points.Easy, ...challenge, output: `${challenge.output}\nCase ID: ${caseId}` };
  });
}

export function publicChallenges(challenges) {
  return challenges.map(({ answer, explanation, ...challenge }) => challenge);
}
