#!/bin/sh
set -e

# If CUCM_IP / CUCM_PORT are set via environment variables, update pjsip.conf dynamically
if [ -n "$CUCM_IP" ]; then
    SAFE_CUCM_PORT="${CUCM_PORT:-5060}"
    CUCM_IP_REGEX=$(printf '%s' "$CUCM_IP" | sed 's/\./\\\\./g')
    echo "[CallBlast] Configuring Asterisk with CUCM IP: $CUCM_IP:$SAFE_CUCM_PORT"
    sed -i -E "s|contact = sip:[^:]+:[0-9]+|contact = sip:$CUCM_IP:$SAFE_CUCM_PORT|g" /etc/asterisk/pjsip.conf
    sed -i -E "s|match = .*|match = $CUCM_IP,172.16.0.0/12,192.168.0.0/16,10.0.0.0/8|g" /etc/asterisk/pjsip.conf
    sed -i -E "s|match_header = From: /.*|match_header = From: /.*$CUCM_IP_REGEX.*/|g" /etc/asterisk/pjsip.conf
    sed -i -E "s|from_domain = [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|from_domain = $CUCM_IP|g" /etc/asterisk/pjsip.conf
fi

# If HOST_IP is set (e.g. Docker host LAN IP), update external addresses
if [ -n "$HOST_IP" ]; then
    echo "[CallBlast] Configuring Asterisk External IP: $HOST_IP"
    sed -i -E "s|external_signaling_address = [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|external_signaling_address = $HOST_IP|g" /etc/asterisk/pjsip.conf
    sed -i -E "s|external_media_address = [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|external_media_address = $HOST_IP|g" /etc/asterisk/pjsip.conf
    sed -i -E "s|media_address = [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|media_address = $HOST_IP|g" /etc/asterisk/pjsip.conf
fi

# Synchronize ARI credentials from environment variables if configured
if [ -n "$ARI_USERNAME" ] || [ -n "$ARI_PASSWORD" ]; then
    TARGET_ARI_USER="${ARI_USERNAME:-callblast}"
    TARGET_ARI_PASS="${ARI_PASSWORD:-changeme123}"
    echo "[CallBlast] Configuring Asterisk ARI user: $TARGET_ARI_USER"
    cat > /etc/asterisk/ari.conf <<EOF
[general]
enabled = yes
pretty = yes
allowed_origins = *

[$TARGET_ARI_USER]
type = user
read_only = no
password = $TARGET_ARI_PASS
password_format = plain
EOF
fi

# Ensure correct permissions and directory structure for sounds
mkdir -p /var/lib/asterisk/sounds/callblast
mkdir -p /var/lib/asterisk/sounds/en/callblast
mkdir -p /var/spool/asterisk/sounds/callblast
chmod -R 777 /var/lib/asterisk/sounds /var/spool/asterisk/sounds 2>/dev/null || true
chown -R asterisk:asterisk /etc/asterisk /var/run/asterisk /var/log/asterisk /var/lib/asterisk/sounds /var/spool/asterisk 2>/dev/null || true

# Execute asterisk command
exec asterisk -fvvv
