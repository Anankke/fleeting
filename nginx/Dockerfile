FROM alpine:3.16 AS builder

ARG NGINX_VERSION=1.22.1
ARG NCHAN_VERSION=1.3.6

RUN apk add --no-cache build-base pcre-dev openssl-dev zlib-dev linux-headers curl

WORKDIR /build
RUN curl -fsSL https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz | tar xz && \
    curl -fsSL https://github.com/slact/nchan/archive/v${NCHAN_VERSION}.tar.gz | tar xz

RUN cd /build/nginx-${NGINX_VERSION} && \
    ./configure \
        --prefix=/etc/nginx \
        --sbin-path=/usr/sbin/nginx \
        --conf-path=/etc/nginx/nginx.conf \
        --error-log-path=/dev/stderr \
        --http-log-path=/dev/stdout \
        --pid-path=/var/run/nginx.pid \
        --with-http_ssl_module \
        --with-threads \
        --add-module=/build/nchan-${NCHAN_VERSION} && \
    make -j$(nproc) && \
    make install

FROM alpine:3.16
RUN apk add --no-cache pcre openssl
COPY --from=builder /usr/sbin/nginx /usr/sbin/nginx
COPY --from=builder /etc/nginx /etc/nginx
COPY nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /var/log/nginx /var/cache/nginx /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
