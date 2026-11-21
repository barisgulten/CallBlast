FROM alpine:3.19

# Install Asterisk and required dependencies
RUN apk add --no-cache \
    asterisk \
    asterisk-sounds-en \
    asterisk-sample-config \
    asterisk-srtp \
    asterisk-curl \
    && rm -rf /var/cache/apk/*

# Remove default config files
RUN rm -rf /etc/asterisk/*

# Copy custom configuration files and entrypoint
COPY conf/ /etc/asterisk/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create custom sounds directory for callblast audio files
RUN mkdir -p /var/lib/asterisk/sounds/callblast /var/spool/asterisk/sounds/callblast /var/run/asterisk /var/log/asterisk \
    && chown -R asterisk:asterisk /var/lib/asterisk/sounds /var/spool/asterisk /etc/asterisk /var/run/asterisk /var/log/asterisk

# Expose SIP, ARI HTTP, and RTP ports
EXPOSE 5060/udp
EXPOSE 5060/tcp
EXPOSE 8088/tcp
EXPOSE 10000-10050/udp

# Run Asterisk via entrypoint
ENTRYPOINT ["/entrypoint.sh"]
