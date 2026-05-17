#!/bin/bash
# =============================================================================
# RBX Royale - Daily Database Backup Script
# 
# Performs: mysqldump → gzip → upload to Backblaze B2 → cleanup old backups
# Schedule: Daily at 03:00 WIB (cron: 0 20 * * * UTC)
#
# Requirements:
#   - mysqldump (comes with MySQL)
#   - gzip
#   - aws CLI (for S3-compatible B2 upload)
#   - curl (for email notification via Resend)
#
# Setup:
#   1. Install aws CLI: curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && sudo ./aws/install
#   2. Configure B2 credentials: aws configure --profile b2
#      - Access Key: 005297815312ec20000000001
#      - Secret Key: K005ILzakYOpVWQ0lvpIyaqpZ+79OYo
#      - Region: us-east-005
#   3. chmod +x scripts/backup-db.sh
#   4. Add to crontab: crontab -e
#      0 20 * * * /path/to/rbx-royale/scripts/backup-db.sh >> /path/to/rbx-royale/logs/backup.log 2>&1
# =============================================================================

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

# Database
DB_NAME="audio_processing"
DB_USER="root"
DB_HOST="127.0.0.1"
DB_PORT="3306"
# DB_PASS="" # uncomment and set if password required

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups/db"
LOG_FILE="${PROJECT_DIR}/logs/backup.log"

# B2 / S3
B2_BUCKET="RBX-Storage"
B2_PATH="backups/db"
B2_ENDPOINT="https://s3.us-east-005.backblazeb2.com"
AWS_PROFILE="b2"

# Retention
LOCAL_RETAIN_DAYS=7
B2_RETAIN_DAYS=90

# Email notification (Resend)
RESEND_API_KEY="re_RMF8TgSV_D2EMotTKfW6AZYUsWCH3aijW"
EMAIL_FROM="RBX Community <support@muhwldns.me>"
EMAIL_TO="support@muhwldns.me"
NOTIFY_ON_SUCCESS=false  # set true to get daily success emails
NOTIFY_ON_FAILURE=true

# ─── Functions ────────────────────────────────────────────────────────────────

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  echo "[$(timestamp)] $1"
}

send_email() {
  local subject="$1"
  local body="$2"

  if [ -z "$RESEND_API_KEY" ]; then
    log "WARN: RESEND_API_KEY not set, skipping email"
    return 0
  fi

  curl -s -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"from\": \"${EMAIL_FROM}\",
      \"to\": [\"${EMAIL_TO}\"],
      \"subject\": \"${subject}\",
      \"html\": \"${body}\"
    }" > /dev/null 2>&1 || true
}

notify_success() {
  local filename="$1"
  local filesize="$2"
  local duration="$3"

  if [ "$NOTIFY_ON_SUCCESS" = true ]; then
    send_email \
      "RBX Backup OK - $(date '+%Y-%m-%d')" \
      "<p>Database backup completed successfully.</p><ul><li>File: ${filename}</li><li>Size: ${filesize}</li><li>Duration: ${duration}s</li><li>Uploaded to: B2/${B2_PATH}/${filename}</li></ul>"
  fi
}

notify_failure() {
  local error_msg="$1"

  if [ "$NOTIFY_ON_FAILURE" = true ]; then
    send_email \
      "RBX Backup FAILED - $(date '+%Y-%m-%d')" \
      "<p style='color:red;'><strong>Database backup failed!</strong></p><p>Error: ${error_msg}</p><p>Server: $(hostname)</p><p>Time: $(timestamp)</p>"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  local start_time=$(date +%s)
  local today=$(date '+%Y-%m-%d')
  local filename="${DB_NAME}-${today}.sql.gz"
  local filepath="${BACKUP_DIR}/${filename}"

  log "=== Starting backup: ${DB_NAME} ==="

  # Create backup directory
  mkdir -p "$BACKUP_DIR"
  mkdir -p "$(dirname "$LOG_FILE")"

  # 1. Dump database
  log "Dumping database..."
  local dump_cmd="mysqldump --single-transaction --routines --triggers --host=${DB_HOST} --port=${DB_PORT} --user=${DB_USER}"
  
  if [ -n "${DB_PASS:-}" ]; then
    dump_cmd="${dump_cmd} --password=${DB_PASS}"
  fi

  if ! ${dump_cmd} "$DB_NAME" | gzip > "$filepath"; then
    local err="mysqldump failed"
    log "ERROR: ${err}"
    notify_failure "$err"
    rm -f "$filepath"
    exit 1
  fi

  local filesize=$(du -h "$filepath" | cut -f1)
  log "Dump complete: ${filename} (${filesize})"

  # 2. Upload to B2
  log "Uploading to B2..."
  if ! aws s3 cp "$filepath" "s3://${B2_BUCKET}/${B2_PATH}/${filename}" \
    --endpoint-url "$B2_ENDPOINT" \
    --profile "$AWS_PROFILE" \
    --quiet; then
    local err="B2 upload failed"
    log "ERROR: ${err}"
    notify_failure "$err"
    exit 1
  fi

  log "Upload complete: s3://${B2_BUCKET}/${B2_PATH}/${filename}"

  # 3. Cleanup local backups (older than N days)
  log "Cleaning local backups older than ${LOCAL_RETAIN_DAYS} days..."
  find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${LOCAL_RETAIN_DAYS} -delete 2>/dev/null || true
  local local_count=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
  log "Local backups remaining: ${local_count}"

  # 4. Cleanup B2 backups (older than N days)
  log "Cleaning B2 backups older than ${B2_RETAIN_DAYS} days..."
  local cutoff_date=$(date -d "-${B2_RETAIN_DAYS} days" '+%Y-%m-%d' 2>/dev/null || date -v-${B2_RETAIN_DAYS}d '+%Y-%m-%d')
  
  aws s3 ls "s3://${B2_BUCKET}/${B2_PATH}/" \
    --endpoint-url "$B2_ENDPOINT" \
    --profile "$AWS_PROFILE" 2>/dev/null | while read -r line; do
    local file_date=$(echo "$line" | awk '{print $1}')
    if [[ "$file_date" < "$cutoff_date" ]]; then
      local old_file=$(echo "$line" | awk '{print $4}')
      if [ -n "$old_file" ]; then
        aws s3 rm "s3://${B2_BUCKET}/${B2_PATH}/${old_file}" \
          --endpoint-url "$B2_ENDPOINT" \
          --profile "$AWS_PROFILE" \
          --quiet 2>/dev/null || true
        log "Deleted old B2 backup: ${old_file}"
      fi
    fi
  done

  # 5. Done
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  log "=== Backup complete in ${duration}s ==="
  log "  File: ${filename}"
  log "  Size: ${filesize}"
  log "  Local: ${filepath}"
  log "  B2: s3://${B2_BUCKET}/${B2_PATH}/${filename}"
  log ""

  notify_success "$filename" "$filesize" "$duration"
}

# Run
main "$@"
