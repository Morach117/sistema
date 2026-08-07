const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const fs = require('fs');

// Serve static frontend files (React dist)
const distPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
} else {
    app.use(express.static(path.join(__dirname, '/')));
}

// Rutas de API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/catalogo', require('./routes/catalogo'));
app.use('/api/bodega', require('./routes/bodega'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/traspasos', require('./routes/traspasos'));
app.use('/api/recepciones', require('./routes/recepciones'));
app.use('/api/captura', require('./routes/captura'));
app.use('/api/reclamaciones', require('./routes/reclamaciones'));
app.use('/api/evolucion-precios', require('./routes/evolucion'));

// Catch-all to serve index.html for SPA behavior
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
    }
    if (fs.existsSync(distPath)) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

const net = require('net');
const { exec } = require('child_process');

function getAvailablePort(desiredPort) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(desiredPort, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
        server.on('error', () => {
            resolve(getAvailablePort(Number(desiredPort) + 1));
        });
    });
}

const DESIRED_PORT = parseInt(process.env.PORT, 10) || 3000;

getAvailablePort(DESIRED_PORT).then((PORT) => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor Node.js corriendo exitosamente en http://localhost:${PORT}`);
        // Auto-open browser if launched directly or requested
        if (process.argv.includes('--open') || process.env.AUTO_OPEN === 'true') {
            exec(`start http://localhost:${PORT}`);
        }
    });
});
