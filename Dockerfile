FROM nginx:alpine

# Install necessary packages
RUN apk add --no-cache shadow wget unzip nodejs npm

# Add a new user
RUN useradd -m -u 1000 user

# Set the working directory
WORKDIR /app

# Copy relevant files from repo for configuration and deployment
COPY index.html /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
COPY package.json /app/package.json

# Download and uncompress test data
RUN wget https://github.com/andreped/wsi-visualization-demo/releases/download/sample-data/test-sample.zip \
    && unzip test-sample.zip -d /usr/share/nginx/html \
    && rm test-sample.zip

# Install npm dependencies
RUN cd /app && npm install

# Copy the installed dependencies to the nginx html directory
RUN cp -r node_modules/ /usr/share/nginx/html

# Change ownership of nginx directories to the new user
RUN chown -R user:user /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html

# Expose port 7860
EXPOSE 7860

# Switch to the new user
USER user

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
