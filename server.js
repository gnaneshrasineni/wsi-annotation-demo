const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

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

// Serve static files (your HTML, CSS, JS)
app.use(express.static('.'));

// Proxy SAM API requests
const samProxy = createProxyMiddleware({
    target: 'http://gnanesh.sci.utah.edu:8000',
    changeOrigin: true,
    pathRewrite: {
        '^/api/sam': '/sam' // Remove /api prefix when forwarding to SAM server
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying ${req.method} ${req.url} to SAM server`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`SAM server responded with status: ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        res.status(500).json({ 
            error: 'Proxy error', 
            details: err.message,
            target: 'http://gnanesh.sci.utah.edu:8000'
        });
    }
});

// Route all /api/sam/* requests through the proxy
app.use('/api/sam', samProxy);

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 Development server running at: http://localhost:${PORT}`);
    console.log(`📡 SAM API proxied through: http://localhost:${PORT}/api/sam`);
    console.log(`🎯 Original SAM server: http://gnanesh.sci.utah.edu:8000`);
    console.log(`\n✅ Open http://localhost:${PORT} in your browser\n`);
});