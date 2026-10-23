ARG BUILD_FROM
FROM ${BUILD_FROM}

ARG BUILD_ARCH
ARG NODE_VERSION=22.11.0
ARG PWSH_VERSION=7.4.6
ARG TTYD_VERSION=1.7.7

ENV LANG=C.UTF-8 \
    POWERSHELL_TELEMETRY_OPTOUT=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl git jq less libicu72 nano openssh-client procps python3 rsync tmux xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Web terminal, Node (dashboard build) and PowerShell 7 (scripts/deploy-ha.ps1).
RUN case "${BUILD_ARCH}" in aarch64) arch=arm64; tarch=aarch64 ;; amd64) arch=x64; tarch=x86_64 ;; *) echo "unsupported ${BUILD_ARCH}"; exit 1 ;; esac \
    && curl -fsSL -o /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${tarch}" \
    && chmod +x /usr/local/bin/ttyd \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz" \
       | tar -xJ -C /usr/local --strip-components=1 \
    && mkdir -p /opt/powershell \
    && curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell-${PWSH_VERSION}-linux-${arch}.tar.gz" \
       | tar -xz -C /opt/powershell \
    && chmod +x /opt/powershell/pwsh \
    && ln -s /opt/powershell/pwsh /usr/local/bin/pwsh

COPY rootfs/ /
RUN sed -i 's/\r$//' /run.sh /usr/local/bin/setup-workspace /usr/local/bin/assistant \
       /etc/cursor-agent/login.sh /etc/cursor-agent/assistant-instructions.md \
    && chmod +x /run.sh /usr/local/bin/setup-workspace /usr/local/bin/assistant

CMD ["/run.sh"]
