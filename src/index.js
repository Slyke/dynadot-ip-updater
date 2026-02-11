
// Dynadot IP Updater
import https from 'https';
import { URL } from 'url';
import { readFile } from 'fs/promises';
import crypto from 'crypto';

let packageJson = null;
try {
  const data = await readFile(new URL('./package.json', import.meta.url), 'utf-8');
  packageJson = JSON.parse(data);
} catch (error) {
  console.error('Error loading package.json:', error);
}

const DYNADOT_API_KEY = process.env.DYNADOT_API_KEY || 'your-dynadot-api-key';
const DYNADOT_UPDT_DOMAINS = process.env.DYNADOT_UPDT_DOMAINS || 'example.com';
const SUBDOMAIN0 = process.env.SUBDOMAIN0 || 'www';
const MANUAL_IP = process.env.MANUAL_IP || '';
const MERGE_ENTRIES = process.env.MERGE_ENTRIES === 'true';
const LOG_VERBOSE = process.env.LOG_VERBOSE === 'true';
const LOG_API_URL = process.env.LOG_API_URL === 'true';

const logWithTimestamp = (message) => {
  const timestamp = new Date().toISOString().replace('T', ' ');
  console.log(`[${timestamp}]: ${message}`);
};

const fetchExistingRecords = async (domain, correlationId) => {
  const url = `https://api.dynadot.com/api3.json?key=${DYNADOT_API_KEY}&command=get_dns&domain=${domain}`;
  if (LOG_API_URL) logWithTimestamp(`{${correlationId}} Fetching records from: ${url.replace(DYNADOT_API_KEY, '***')}`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch records. Status: ${response.status}`);

  const data = await response.json();
  const ns =
    data?.GetDnsResponse?.GetDns?.NameServerSettings ??
    data?.Response?.GetDns?.NameServerSettings ??
    data?.GetDns?.NameServerSettings ??
    {};

  return {
    topDomain: Array.from(new Set((ns.MainDomains || []).map((r) => JSON.stringify(r)))).map((r) => JSON.parse(r)),
    subDomains: Array.from(new Set((ns.SubDomains || []).map((r) => JSON.stringify(r)))).map((r) => JSON.parse(r))
  };
};

const makeRequest = async (url, correlationId) => {
  if (LOG_API_URL) logWithTimestamp(`{${correlationId}} Making request to: ${url.replace(DYNADOT_API_KEY, '***')}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return response.text();
};

const getPublicIP = async () => {
  if (MANUAL_IP) return MANUAL_IP;
  const response = await fetch('https://api.ipify.org');
  if (!response.ok) throw new Error('Failed to fetch public IP');
  return response.text();
};

const collectSubdomainEnv = (ip, correlationId) => {
  const subdomains = [];
  let index = 0;

  while (true) {
    const name = process.env[`SUBDOMAIN${index}`];

    if (index === 0 && !name) {
      subdomains.push({ Subhost: SUBDOMAIN0, RecordType: (process.env[`SUBDOMAIN${index}_TYPE`] || 'A').toUpperCase(), Value: process.env[`SUBDOMAIN${index}_VALUE`] || ip });
      logWithTimestamp(`{${correlationId}} SUBDOMAIN0 defaulted to: ${SUBDOMAIN0}`);
      index++;
      continue;
    }

    if (!name) break;

    const type = (process.env[`SUBDOMAIN${index}_TYPE`] || 'A').toUpperCase();
    const value = process.env[`SUBDOMAIN${index}_VALUE`] || ip;

    subdomains.push({ Subhost: name, RecordType: type, Value: value });
    logWithTimestamp(`{${correlationId}} Loaded SUBDOMAIN${index}: ${name} ${type} ${value}`);
    index++;
  }

  return subdomains;
};

const diffSubdomains = (oldList, newList, correlationId) => {
  const oldByKey = new Map(oldList.map((r) => [`${r.Subhost}|${r.RecordType}`, r]));
  const newByKey = new Map(newList.map((r) => [`${r.Subhost}|${r.RecordType}`, r]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, newRec] of newByKey.entries()) {
    if (!oldByKey.has(key)) added.push(newRec);
    else if (oldByKey.get(key).Value !== newRec.Value) changed.push({ from: oldByKey.get(key), to: newRec });
  }

  for (const [key, oldRec] of oldByKey.entries()) {
    if (!newByKey.has(key)) removed.push(oldRec);
  }

  if (!added.length && !removed.length && !changed.length) {
    logWithTimestamp(`{${correlationId}} Diff: no subdomain changes`);
    return;
  }

  added.forEach((r) => logWithTimestamp(`{${correlationId}} Added: ${r.Subhost} ${r.RecordType} ${r.Value}`));
  removed.forEach((r) => logWithTimestamp(`{${correlationId}} Removed: ${r.Subhost} ${r.RecordType} ${r.Value}`));
  changed.forEach((c) => logWithTimestamp(`{${correlationId}} Changed: ${c.from.Subhost} ${c.from.RecordType} ${c.from.Value} → ${c.to.Value}`));
};

(async () => {
  const correlationId = crypto.randomUUID();
  logWithTimestamp(`{${correlationId}} Starting Dynadot IP Updater`);
  logWithTimestamp(`{${correlationId}} Version: ${packageJson?.version || 'unknown'}`);
  logWithTimestamp(`{${correlationId}} Dynadot API Key: ${DYNADOT_API_KEY ? '***' : 'Not set'}`);

  try {
    const ip = await getPublicIP();
    logWithTimestamp(`{${correlationId}} Current IP: ${ip}`);
    logWithTimestamp(`{${correlationId}} Domain: ${DYNADOT_UPDT_DOMAINS}`);
    logWithTimestamp(`{${correlationId}} Manual IP: ${MANUAL_IP ? MANUAL_IP : 'No'}`);

    const domain = DYNADOT_UPDT_DOMAINS;
    let records = { topDomain: [], subDomains: [] };

    try {
      records = await fetchExistingRecords(domain, correlationId);
    } catch (err) {
      logWithTimestamp(`{${correlationId}} Error fetching existing records: ${err.message}`);
    }

    const mainRecordIndex = records.topDomain.findIndex((record) => record.RecordType.toLowerCase() === 'a');
    if (mainRecordIndex !== -1) {
      records.topDomain[mainRecordIndex].Value = ip;
    } else {
      records.topDomain.push({ RecordType: 'A', Value: ip });
    }

    const newSubdomains = collectSubdomainEnv(ip, correlationId);
    diffSubdomains(records.subDomains, newSubdomains, correlationId);
    if (!MERGE_ENTRIES) {
      logWithTimestamp(`{${correlationId}} Mode: REBUILD (overwriting all subdomains)`);
      records.subDomains = newSubdomains;
    } else {
      logWithTimestamp(`{${correlationId}} Mode: MERGE (preserving existing non-A records)`);

      const preserved = records.subDomains.filter(r => {
        const type = r.RecordType.toUpperCase();

        return !['A', 'AAAA'].includes(type);
      });

      const managedKeys = new Set(
        newSubdomains.map(r => `${r.Subhost}|${r.RecordType.toUpperCase()}`)
      );

      const preservedManagedSafe = records.subDomains.filter(r => {
        const key = `${r.Subhost}|${r.RecordType.toUpperCase()}`;
        return ['A', 'AAAA'].includes(r.RecordType.toUpperCase()) && !managedKeys.has(key);
      });

      records.subDomains = [
        ...newSubdomains,
        ...preserved,
        ...preservedManagedSafe
      ];

      logWithTimestamp(`{${correlationId}} Preserved ${preserved.length + preservedManagedSafe.length} existing records`);
    }

    const apiUrl = new URL('https://api.dynadot.com/api3.json');
    apiUrl.searchParams.append('key', DYNADOT_API_KEY);
    apiUrl.searchParams.append('command', 'set_dns2');
    apiUrl.searchParams.append('domain', domain);

    records.topDomain.forEach((record, index) => {
      apiUrl.searchParams.append(`main_record_type${index}`, record.RecordType.toLowerCase());
      apiUrl.searchParams.append(`main_record${index}`, record.Value);
    });

    records.subDomains.forEach((record, index) => {
      apiUrl.searchParams.append(`subdomain${index}`, record.Subhost);
      apiUrl.searchParams.append(`sub_record_type${index}`, record.RecordType.toLowerCase());
      apiUrl.searchParams.append(`sub_record${index}`, record.Value);
    });

    const response = await makeRequest(apiUrl.toString(), correlationId);
    logWithTimestamp(`{${correlationId}} DNS update response: ${response}`);
  } catch (error) {
    logWithTimestamp(`{${correlationId}} Error: ${error.message}`);
    process.exit(1);
  }
})();
