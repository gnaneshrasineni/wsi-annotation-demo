const http = require('http');
const httpProxy = require('http-proxy-middleware');
const express = require('express');
const path = require('path');

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Serve static files
app.use(express.static('.'));

// Proxy SAM API requests
const samProxy = httpProxy.createProxyMiddleware({
    target: 'http://gnanesh.sci.utah.edu:8000',
    changeOrigin: true,
    pathRewrite: {
        '^/api/sam': '/sam'
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Proxy error', details: err.message });
    }
});

app.use('/api/sam', samProxy);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
    console.log(`SAM API proxied through: http://localhost:${PORT}/api/sam`);
});