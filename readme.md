# Dynadot DNS-01 Challenge IP Updater

This script automates the updating of A records for a given domain and subdomain using Dynadot's DNS API. It is designed for dynamic DNS setups where your public IP may change frequently.

## Features

- Fetches current public IP address (or uses a manually set one).
- Queries existing DNS records for a given domain.
- Updates the A record for the specified subdomain and root domain.
- Logs activity with timestamps and optional verbose API URL tracing.

## Requirements

- Node.js `18+` (ESM support required)
- Dynadot account and API key with DNS access

## Environment Variables

Set the following environment variables before running the script:

| Variable               | Description                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| `DYNADOT_API_KEY`      | **(required)** Your Dynadot API key                                         |
| `DYNADOT_UPDT_DOMAINS` | **(required)** Domain to update (e.g. `example.com`)                        |
| `SUBDOMAIN0`           | Subdomain to update A record for (default: `www`)                           |
| `MANUAL_IP`            | Optional manual IP to use instead of public IP detection                    |
| `LOG_VERBOSE`          | Set to `true` to enable verbose logging                                     |
| `LOG_API_URL`          | Set to `true` to log full API request URLs (API key will be masked)         |
| `MERGE_ENTRIES`        | Merge existing DNS records instead of overwriting entire zone (`true` = merge, `false` = rebuild) |

## Usage

```bash
# Set environment variables
export DYNADOT_API_KEY="your-api-key"
export DYNADOT_UPDT_DOMAINS="example.com"
export SUBDOMAIN0="www"
export LOG_VERBOSE=true
export LOG_API_URL=true

# Run the script
node index.js
```


Docker Update:

```
docker build -t dynadot-ip-update .

docker tag dynadot-ip-update DOMAIN.xyz/slyke/dynadot-ip-update:latest
docker tag dynadot-ip-update DOMAIN.xyz/slyke/dynadot-ip-update:v1.0.X
docker push DOMAIN.xyz/slyke/dynadot-ip-update:latest
docker push DOMAIN.xyz/slyke/dynadot-ip-update:v1.0.X
docker pull DOMAIN.xyz/slyke/dynadot-ip-update:latest

docker tag DOMAIN.xyz/slyke/dynadot-ip-update:latest IP:5000/slyke/dynadot-ip-update:latest

docker push IP:5000/slyke/dynadot-ip-update:latest
```