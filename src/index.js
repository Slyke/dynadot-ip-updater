// Dynadot DNS-01 Challenge IP Updater
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
  if (!response.ok) {
    throw new Error(`Failed to fetch records. Status: ${response.status}`);
  }
  const data = await response.json();
  return {
    topDomain: Array.from(new Set(data.GetDnsResponse.GetDns.NameServerSettings.MainDomains.map(JSON.stringify))).map(JSON.parse),
    subDomains: Array.from(new Set(data.GetDnsResponse.GetDns.NameServerSettings.SubDomains.map(JSON.stringify))).map(JSON.parse)
  };
};

const makeRequest = async (url, correlationId) => {
  if (LOG_API_URL) logWithTimestamp(`{${correlationId}} Making request to: ${url.replace(DYNADOT_API_KEY, '***')}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  return response.text();
};

const getPublicIP = async () => {
  if (MANUAL_IP) return MANUAL_IP;
  const response = await fetch('https://api.ipify.org');
  if (!response.ok) {
    throw new Error('Failed to fetch public IP');
  }
  return response.text();
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
    logWithTimestamp(`{${correlationId}} Subdomain0: ${SUBDOMAIN0}`);
    logWithTimestamp(`{${correlationId}} Manual IP: ${MANUAL_IP ? MANUAL_IP : 'No'}`);

    const domain = DYNADOT_UPDT_DOMAINS;
    const records = await fetchExistingRecords(domain, correlationId);
    logWithTimestamp(`{${correlationId}} Current Records: ${JSON.stringify(records)}`);

    const mainRecordIndex = records.topDomain.findIndex(
      (record) => record.RecordType.toLowerCase() === 'a'
    );
    if (mainRecordIndex !== -1) {
      records.topDomain[mainRecordIndex].Value = ip;
    } else {
      records.topDomain.push({ RecordType: 'A', Value: ip });
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
