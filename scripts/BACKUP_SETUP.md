# Database Backup Setup

## Prerequisites

1. **AWS CLI** (for S3-compatible B2 upload):
   ```bash
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   rm -rf aws awscliv2.zip
   ```

2. **Configure B2 profile:**
   ```bash
   aws configure --profile b2
   # AWS Access Key ID: 005297815312ec20000000001
   # AWS Secret Access Key: K005ILzakYOpVWQ0lvpIyaqpZ+79OYo
   # Default region name: us-east-005
   # Default output format: json
   ```

3. **Verify connection:**
   ```bash
   aws s3 ls s3://RBX-Storage/ --endpoint-url https://s3.us-east-005.backblazeb2.com --profile b2
   ```

## Setup

```bash
# Make script executable
chmod +x scripts/backup-db.sh

# Create required directories
mkdir -p backups/db logs

# Test run
./scripts/backup-db.sh
```

## Cron Schedule

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 03:00 WIB = 20:00 UTC):
0 20 * * * /home/user/rbx-royale/scripts/backup-db.sh >> /home/user/rbx-royale/logs/backup.log 2>&1
```

Replace `/home/user/rbx-royale` with your actual project path.

## Verify Cron

```bash
# List active cron jobs
crontab -l

# Check backup log after first run
tail -f logs/backup.log
```

## Manual Backup

```bash
# Run backup manually anytime
./scripts/backup-db.sh
```

## Restore from Backup

```bash
# List available backups on B2
aws s3 ls s3://RBX-Storage/backups/db/ --endpoint-url https://s3.us-east-005.backblazeb2.com --profile b2

# Download specific backup
aws s3 cp s3://RBX-Storage/backups/db/audio_processing-2026-05-17.sql.gz ./restore.sql.gz \
  --endpoint-url https://s3.us-east-005.backblazeb2.com --profile b2

# Decompress
gunzip restore.sql.gz

# Restore (WARNING: this overwrites current data!)
mysql -u root audio_processing < restore.sql
```

## Configuration

Edit `scripts/backup-db.sh` to change:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_NAME` | `audio_processing` | Database name |
| `DB_USER` | `root` | MySQL user |
| `DB_PASS` | (empty) | MySQL password (uncomment if needed) |
| `LOCAL_RETAIN_DAYS` | `7` | Keep local backups for N days |
| `B2_RETAIN_DAYS` | `90` | Keep B2 backups for N days |
| `NOTIFY_ON_SUCCESS` | `false` | Email on success |
| `NOTIFY_ON_FAILURE` | `true` | Email on failure |
| `EMAIL_TO` | `support@muhwldns.me` | Alert recipient |

## Retention Policy

| Location | Retention | Estimated Size |
|----------|-----------|----------------|
| Local (VPS) | 7 days | ~70MB (7 × 10MB) |
| B2 (offsite) | 90 days | ~900MB (90 × 10MB) |

B2 free tier: 10GB. You're well within limits.
