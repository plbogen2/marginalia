#!/bin/bash
set -e

echo "=== Starting Marginalia OCI VM Setup ==="

# 0. Create Swap File to prevent memory freezes on small instances
if [ ! -f "/swapfile" ] && [ "$(id -u)" -eq 0 -o -n "$SUDO_USER" ]; then
  echo "--> Creating a 2GB swap file to prevent OOM/freezing during builds..."
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "Swap file created and enabled."
fi

# 0.5. Disable Oracle Cloud Agent on low-memory (1GB) instances to free up ~400MB RAM
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
if [ "$TOTAL_MEM_KB" -lt 1500000 ]; then
  if systemctl is-active --quiet oracle-cloud-agent 2>/dev/null; then
    echo "--> Low-memory instance detected (< 1.5GB RAM). Disabling oracle-cloud-agent to reclaim ~400MB of memory..."
    sudo systemctl stop oracle-cloud-agent || true
    sudo systemctl disable oracle-cloud-agent || true
  fi
fi

# 1. Check and install core dependencies and security packages
echo "--> Installing core packages (git, curl, sqlite3, fail2ban, cron)..."
sudo apt-get update -y
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release git sqlite3 fail2ban cron

if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  rm get-docker.sh
fi

sudo usermod -aG docker $USER

if ! command -v docker-compose &> /dev/null; then
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

# 1.5. Configure Docker Daemon Log Rotation & BuildKit GC (Caps build cache at 2GB)
if [ ! -f "/etc/docker/daemon.json" ] || ! grep -q 'builder' /etc/docker/daemon.json; then
  echo "--> Configuring Docker container log rotation and BuildKit garbage collection (/etc/docker/daemon.json)..."
  sudo mkdir -p /etc/docker
  cat <<'EOF' | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "2GB"
    }
  }
}
EOF
  sudo systemctl restart docker || true
fi

# 1.6. Systemd Journald & Snap disk caps
if [ -f "/etc/systemd/journald.conf" ]; then
  echo "--> Capping systemd-journald logs to 100MB..."
  sudo sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=100M/' /etc/systemd/journald.conf
  sudo sed -i 's/^#\?SystemMaxFileSize=.*/SystemMaxFileSize=25M/' /etc/systemd/journald.conf
  sudo systemctl restart systemd-journald || true
  sudo journalctl --vacuum-size=100M || true
fi

if command -v snap &> /dev/null; then
  echo "--> Capping snap package revision retention to 2..."
  sudo snap set system refresh.retain=2 || true
fi

# 2. Configure local iptables firewall (Only ports 22, 80, and 443 are accepted externally)
echo "--> Hardening iptables firewall: closing internal ports (3000, 8765) and allowing 80/443..."
for port in 3000 8765; do
  while sudo iptables -D INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null; do :; done
  while sudo iptables -D FORWARD -p tcp --dport $port -j ACCEPT 2>/dev/null; do :; done
done
for port in 80 443; do
  while sudo iptables -D INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null; do :; done
  sudo iptables -I INPUT 1 -p tcp --dport $port -j ACCEPT
done
sudo iptables -I FORWARD 1 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
sudo iptables -N DOCKER-USER 2>/dev/null || true
sudo iptables -I DOCKER-USER 1 -j ACCEPT 2>/dev/null || true

if command -v netfilter-persistent &> /dev/null; then
  sudo netfilter-persistent save
fi

# Ensure fail2ban and cron are enabled and active
sudo systemctl enable --now fail2ban || true
sudo systemctl enable --now cron || true

# 4. Clone or update the repository
if [ ! -d "marginalia" ]; then
  echo "--> Cloning Marginalia repository with submodules..."
  git clone --recurse-submodules https://github.com/plbogen2/marginalia.git
  cd marginalia
else
  echo "--> Updating Marginalia repository..."
  cd marginalia
  git checkout -- Caddyfile 2>/dev/null || true
  git pull origin main
  git submodule sync
  git submodule update --init --recursive
  cp scripts/setup_vm.sh $HOME/setup_vm.sh 2>/dev/null && chmod +x $HOME/setup_vm.sh || true
fi

# 5. Setup environment configurations
if [ ! -f ".env" ]; then
  echo "--> Creating .env file..."
  SECRET=$(openssl rand -hex 24)
  cat <<EOT > .env
PORT=3000
SESSION_SECRET=$SECRET
GEMINI_API_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ALLOWED_USER=
PARLANDO_URL=http://parlando:8765
EOT
  echo ".env file created with secure session secrets."
fi

# 5.5. Configure automated maintenance cron jobs
echo "--> Configuring automated backup, disk watchdog, and maintenance cron jobs..."
chmod +x scripts/backup_db.sh scripts/disk_watchdog.sh scripts/hot_swap.sh
CRON_CMD_BACKUP="0 3 * * * /home/ubuntu/marginalia/scripts/backup_db.sh >> /var/log/marginalia_backup.log 2>&1"
CRON_CMD_WATCHDOG="*/30 * * * * /home/ubuntu/marginalia/scripts/disk_watchdog.sh >> /var/log/marginalia_disk_watchdog.log 2>&1"
CRON_CMD_PRUNE="0 4 * * 0 docker image prune -af --filter 'until=168h' >/dev/null 2>&1 && docker builder prune -f --keep-storage 2GB >/dev/null 2>&1"

( crontab -l 2>/dev/null | grep -v 'backup_db.sh' | grep -v 'disk_watchdog.sh' | grep -v 'docker image prune' ; echo "$CRON_CMD_BACKUP" ; echo "$CRON_CMD_WATCHDOG" ; echo "$CRON_CMD_PRUNE" ) | crontab -

# 6. Build and Start the application on ports 80 and 443 via zero-downtime hot swap
echo "--> Launching Marginalia containers on ports 80 and 443 via zero-downtime hot swap..."
./scripts/hot_swap.sh all

echo "=== Marginalia OCI VM Setup Complete! ==="
