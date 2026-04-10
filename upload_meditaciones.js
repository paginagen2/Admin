/**
 * Script Node.js para subir meditaciones a Firestore (colección "meditaciones").
 * Uso:
 * 1) Coloca tu archivo de credenciales de servicio: serviceAccountKey.json en la misma carpeta.
 * 2) Prepara un JSON con un array de meditaciones, ejemplo 'meditaciones.json':
 *    [ { "titulo": "...", "contenido": "...", "contexto": "..." }, ... ]
 * 3) Ejecuta: node upload_meditaciones.js meditaciones.json
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const svcPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(svcPath)) {
    console.error('ERROR: serviceAccountKey.json no encontrado en la carpeta. Añádelo antes de ejecutar.');
    process.exit(1);
}

const serviceAccount = require(svcPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function main() {
    const fileArg = process.argv[2] || 'meditaciones.json';
    const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
    if (!fs.existsSync(filePath)) {
        console.error('ERROR: archivo de meditaciones no encontrado:', filePath);
        process.exit(1);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let items;
    try {
        items = JSON.parse(raw);
    } catch (err) {
        console.error('ERROR: el archivo debe ser JSON válido con un array de objetos. ', err.message);
        process.exit(1);
    }

    if (!Array.isArray(items)) {
        console.error('ERROR: el JSON debe contener un array de meditaciones.');
        process.exit(1);
    }

    console.log(`Subiendo ${items.length} meditaciones a la colección 'meditaciones'...`);
    let i = 0;
    for (const it of items) {
        i++;
        const titulo = (it.titulo || '').toString().trim();
        const contenido = (it.contenido || '').toString().trim();
        const contexto = (it.contexto || '').toString().trim();

        if (!titulo || !contenido) {
            console.warn(`Saltando item ${i}: falta titulo o contenido`);
            continue;
        }

        const id = `meditacion_${Date.now()}_${i}`;
        const data = { titulo, contenido };
        if (contexto) data.contexto = contexto;

        try {
            await db.collection('meditaciones').doc(id).set(data);
            console.log(`  [${i}] OK -> ${id}`);
        } catch (err) {
            console.error(`  [${i}] ERROR al subir ${id}:`, err.message || err);
        }
    }

    console.log('Subida finalizada.');
    process.exit(0);
}

main().catch(err => {
    console.error('ERROR inesperado:', err);
    process.exit(1);
});
