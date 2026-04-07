FROM nginx:1.25-alpine

# Install nchan module — use a pre-built package from community repo
# For production, build from source or use nginxinc/nginx-unprivileged with nchan.
RUN apk add --no-cache nginx-mod-http-nchan 2>/dev/null || true

COPY nginx.conf /etc/nginx/nginx.conf
