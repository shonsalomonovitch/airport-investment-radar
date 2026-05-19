# AWS Deployment Guide — Airport Investment Radar

## Architecture Overview

```
EC2 Instance (Ubuntu 22.04, t3.small)
├── Docker container: server   → port 3000  (NestJS API)
├── Docker container: client   → port 4200  (Angular / Nginx)
└── Database: Prisma Cloud     → external   (already hosted, no setup needed)
```

Everything runs with one command: `docker compose up --build -d`

---

## Pre-Deploy — Fix Client API URL

The Angular client has `http://localhost:3000` hardcoded in `environment.ts`.
This must point to your real server before building.

**Option A — Update environment.ts directly (simplest):**

Edit `client/src/environments/environment.ts`:
```ts
export const environment = {
  production: false,
  apiBase: 'http://<YOUR_EC2_PUBLIC_IP>:3000',
};
```

**Option B — Create a production environment file:**

Create `client/src/environments/environment.prod.ts`:
```ts
export const environment = {
  production: true,
  apiBase: 'http://<YOUR_EC2_PUBLIC_IP>:3000',
};
```

Then commit and push to GitHub before deploying.

---

## Step 1 — Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Configure:
   - **Name:** `airport-investment-radar`
   - **AMI:** Ubuntu Server 22.04 LTS (free tier eligible)
   - **Instance type:** `t3.small` (2GB RAM — minimum for this app)
   - **Key pair:** create new → download `.pem` file → keep it safe
   - **Storage:** 20 GB gp3 (default is fine)

3. **Security Group — open these inbound ports:**

| Port | Protocol | Source    | Purpose              |
|------|----------|-----------|----------------------|
| 22   | TCP      | Your IP   | SSH access           |
| 80   | TCP      | 0.0.0.0/0 | HTTP (after SSL)     |
| 443  | TCP      | 0.0.0.0/0 | HTTPS (after SSL)    |
| 3000 | TCP      | 0.0.0.0/0 | NestJS API           |
| 4200 | TCP      | 0.0.0.0/0 | Angular client       |

4. Click **Launch Instance**
5. Note the **Public IPv4 address** — you will need it throughout

---

## Step 2 — SSH into the Instance

```bash
# Fix key permissions (required on Mac/Linux)
chmod 400 your-key.pem

# Connect
ssh -i your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

---

## Step 3 — Install Docker

Run these commands on the EC2 instance:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker using the official script
curl -fsSL https://get.docker.com | sh

# Add ubuntu user to docker group (so you don't need sudo every time)
sudo usermod -aG docker ubuntu

# Apply group change — log out and back in
exit
```

```bash
# SSH back in
ssh -i your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>

# Verify Docker is working
docker --version
docker compose version
```

---

## Step 4 — Clone the Repository

```bash
git clone https://github.com/shonsalomonovitch/airport-investment-radar.git
cd airport-investment-radar
```

---

## Step 5 — Create the .env File

The `.env` file is in `.gitignore` and must be created manually on the server.

```bash
nano server/.env
```

Paste the following (replace all placeholder values):

```
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_MODEL=claude-sonnet-4-6

AERODATABOX_API_KEY=your-aerodatabox-rapidapi-key

PORT=3000
ALLOWED_ORIGIN=http://<YOUR_EC2_PUBLIC_IP>:4200

DATABASE_URL=your-prisma-cloud-database-url
```

Save: `Ctrl+X` → `Y` → `Enter`

---

## Step 6 — Build and Run

```bash
docker compose up --build -d
```

This command:
1. Builds the NestJS server Docker image
2. Builds the Angular client Docker image (Nginx serves the compiled output)
3. Starts both containers in the background
4. On server startup, `prisma migrate deploy` runs automatically — creates all DB tables

**Monitor startup logs:**
```bash
docker compose logs server --follow
```

Wait until you see:
```
Server running on http://localhost:3000
FAA data loaded — X airports...
Loaded X US airports with IATA codes...
```

---

## Step 7 — Verify the Deployment

```bash
# Check both containers are running
docker compose ps

# Test the API health endpoint
curl http://<YOUR_EC2_PUBLIC_IP>:3000/alive

# Test the agent (replace with a real question)
curl -X POST http://<YOUR_EC2_PUBLIC_IP>:3000/agent/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Analyze BOS airport"}'
```

Open the client in a browser:
```
http://<YOUR_EC2_PUBLIC_IP>:4200
```

---

## Step 8 (Optional) — Add a Domain + HTTPS

If you have a domain name:

**1. Point DNS to your EC2 IP**
- In Route 53 (or your domain registrar), create an A record pointing `yourdomain.com` to your EC2 public IP

**2. Install Nginx and Certbot on the host**
```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

**3. Create Nginx host config**
```bash
sudo nano /etc/nginx/sites-available/airport-radar
```

Paste:
```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:4200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/airport-radar /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**4. Get a free SSL certificate**
```bash
sudo certbot --nginx -d yourdomain.com
```

Certbot automatically configures HTTPS and sets up auto-renewal.

---

## Useful Commands After Deploy

```bash
# View live logs
docker compose logs server --follow
docker compose logs client --follow

# Restart everything
docker compose restart

# Pull latest code and redeploy
git pull
docker compose up --build -d

# Stop everything
docker compose down

# Check resource usage
docker stats
```

---

## Cost Estimate

| Resource | Type | Monthly Cost |
|---|---|---|
| EC2 t3.small | On-demand | ~$15/mo |
| EC2 t3.small | Reserved 1yr | ~$7/mo |
| EC2 storage | 20GB gp3 | ~$1.60/mo |
| Prisma Cloud DB | Already set up | covered |
| Domain (optional) | Route 53 | ~$12/yr |

**Total: ~$9–17/month**

---

## Troubleshooting

**Container won't start:**
```bash
docker compose logs server
```
Most common cause: missing or wrong value in `server/.env`

**Client can't reach the API:**
- Check `environment.ts` has the correct EC2 IP on port 3000
- Check Security Group has port 3000 open to 0.0.0.0/0
- Check `ALLOWED_ORIGIN` in `.env` matches the client URL exactly

**Database migration fails on startup:**
```bash
docker compose logs server | grep -i "migration\|prisma\|error"
```
Most common cause: `DATABASE_URL` is wrong or the DB is unreachable

**Out of memory:**
- Upgrade to `t3.medium` (4GB RAM) — the FAA Excel files + Node.js can be heavy at startup
