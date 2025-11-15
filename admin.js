import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import {
    getFirestore,
    collection,
    getDocs,
    doc,
    setDoc,
    deleteDoc,
    serverTimestamp,
    query,
    where,
    orderBy
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';
import {
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    signInWithRedirect,
    getRedirectResult
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js';

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
    authDomain: "pagina-gen.firebaseapp.com",
    projectId: "pagina-gen",
    storageBucket: "pagina-gen.appspot.com",
    messagingSenderId: "876893109130",
    appId: "1:876893109130:web:862f79fc7a609e512ee673"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Variables globales
let currentUser = null;
let currentSection = 'cancionero';
let editingId = null;

// Función para convertir fecha a formato DD/MM/AAAA
function convertToDateFormat(dateString) {
    const months = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    
    const regex = /(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/i;
    const match = dateString.match(regex);
    
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = months[match[2].toLowerCase()] || '01';
        const year = match[3];
        return `${day}/${month}/${year}`;
    }
    
    return dateString;
}

// Función para parsear fecha DD/MM/AAAA a objeto Date
function parseDateDDMMYYYY(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
}

// ==================== AUTENTICACIÓN ====================

function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent || '');
}

document.getElementById('google-signin-btn').addEventListener('click', async () => {
    try {
        if (isMobileDevice()) {
            // en móviles usar redirect (más fiable que popup)
            await signInWithRedirect(auth, provider);
        } else {
            // en escritorio intentar popup
            await signInWithPopup(auth, provider);
        }
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        // Si el popup fue bloqueado o cancelado, fallback a redirect
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
            try {
                await signInWithRedirect(auth, provider);
                return;
            } catch (err) {
                console.error('Fallback a redirect falló:', err);
                alert('Error al iniciar sesión: ' + err.message);
                return;
            }
        }
        alert('Error al iniciar sesión: ' + (error.message || error));
    }
});

// Manejar resultado cuando se vuelve del redirect (importante en móviles)
(async function handleRedirectResult() {
    try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
            console.log('Sesión iniciada vía redirect:', result.user.email);
            // onAuthStateChanged también se ejecutará; no es necesario hacer más aquí
        }
    } catch (err) {
        // evitar spam de mensajes si no hay evento de auth
        if (err && err.code !== 'auth/no-auth-event') {
            console.error('Error al procesar redirect result:', err);
        }
    }
})();

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-panel').style.display = 'block';
        document.getElementById('user-email').textContent = user.email;
        
        loadCurrentSection();
    } else {
        currentUser = null;
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('main-panel').style.display = 'none';
    }
});

// ==================== NAVEGACIÓN ====================

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        changeSection(section);
    });
});

function changeSection(section) {
    currentSection = section;
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });
    
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `${section}-section`);
    });
    
    editingId = null;
    loadCurrentSection();
}

function loadCurrentSection() {
    if (!currentUser) return;
    
    switch (currentSection) {
        case 'cancionero':
            loadCanciones();
            break;
        case 'recursos':
            loadRecursos();
            break;
        case 'pasapalabra':
            loadPasapalabra();
            break;
        case 'frases':
            loadFrases();
            break;
        case 'lyrics':
            initLyricsCorrector();
            break;
        default:
            break;
    }
}

// ==================== CANCIONERO ====================

let allCanciones = [];

async function loadCanciones() {
    try {
        // pedir ordenado por fechaCreacion desc; si el campo no existe, se mantiene como null y se ordena cliente como fallback
        const q = query(collection(db, 'canciones'), orderBy('fechaCreacion', 'desc'));
        const querySnapshot = await getDocs(q);
        allCanciones = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // fallback: asegurar orden descendente por fechaCreacion en cliente (maneja distintos tipos / null)
        allCanciones.sort((a, b) => {
            const ta = a.fechaCreacion && a.fechaCreacion.toMillis ? a.fechaCreacion.toMillis() : (a.fechaCreacion || 0);
            const tb = b.fechaCreacion && b.fechaCreacion.toMillis ? b.fechaCreacion.toMillis() : (b.fechaCreacion || 0);
            return tb - ta;
        });
        displayCanciones(allCanciones);
    } catch (error) {
        console.error('Error al cargar canciones:', error);
    }
}

function displayCanciones(canciones) {
    const list = document.getElementById('cancion-list');
    list.innerHTML = '';
    
    // Se asume que 'canciones' ya viene ordenado por fecha descendente
    canciones.forEach(cancion => {
        const item = document.createElement('div');
        item.className = `item ${editingId === cancion.id ? 'active' : ''}`;
        
        const estado = cancion.estado || 'pendiente';
        const categoria = cancion.categoria || 'gen';
        
        item.innerHTML = `
            <div class="item-title">${cancion.titulo}</div>
            <div class="item-subtitle">${cancion.artista || 'Sin artista'}</div>
            <span class="item-badge badge-${categoria}">${categoria}</span>
            <span class="item-badge badge-${estado}">${estado}</span>
        `;
        item.addEventListener('click', () => editCancion(cancion));
        list.appendChild(item);
    });
}

function editCancion(cancion) {
    editingId = cancion.id;
    // Guardar id en el dataset del formulario para evitar dependencias exclusivas de la variable global
    const form = document.getElementById('cancion-form');
    form.dataset.editingId = cancion.id;

    document.getElementById('cancion-form-title').textContent = '✏️ Editar Canción';
    document.getElementById('cancion-titulo').value = cancion.titulo || '';
    document.getElementById('cancion-artista').value = cancion.artista || '';
    document.getElementById('cancion-letra').value = cancion.letra || '';
    document.getElementById('cancion-categoria').value = cancion.categoria || 'gen';
    document.getElementById('cancion-estado').value = cancion.estado || 'pendiente';
    
    document.getElementById('cancion-cancel').style.display = 'inline-block';
    document.getElementById('cancion-delete').style.display = 'inline-block';
    displayCanciones(allCanciones);
}

function resetCancionForm() {
    editingId = null;
    const form = document.getElementById('cancion-form');
    // eliminar id guardado en el form
    delete form.dataset.editingId;

    document.getElementById('cancion-form-title').textContent = '➕ Nueva Canción';
    document.getElementById('cancion-form').reset();
    document.getElementById('cancion-cancel').style.display = 'none';
    document.getElementById('cancion-delete').style.display = 'none';
    displayCanciones(allCanciones);
}

document.getElementById('cancion-search').addEventListener('input', filterCanciones);
document.getElementById('cancion-filter-estado').addEventListener('change', filterCanciones);
document.getElementById('cancion-filter-categoria').addEventListener('change', filterCanciones);

function filterCanciones() {
    const search = document.getElementById('cancion-search').value.toLowerCase();
    const filterEstado = document.getElementById('cancion-filter-estado').value;
    const filterCategoria = document.getElementById('cancion-filter-categoria').value;
    
    let filtered = allCanciones.filter(c => {
        const matchSearch = (c.titulo || '').toLowerCase().includes(search) ||
                           (c.artista || '').toLowerCase().includes(search);
        const matchEstado = !filterEstado || (c.estado || 'pendiente') === filterEstado;
        const matchCategoria = !filterCategoria || (c.categoria || 'gen') === filterCategoria;
        
        return matchSearch && matchEstado && matchCategoria;
    });
    
    displayCanciones(filtered);
}

document.getElementById('cancion-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Priorizar el id guardado en el formulario (si existe)
    const form = document.getElementById('cancion-form');
    const formEditingId = form.dataset.editingId || null;

    const data = {
        titulo: document.getElementById('cancion-titulo').value.trim(),
        artista: document.getElementById('cancion-artista').value.trim(),
        letra: document.getElementById('cancion-letra').value.trim(),
        categoria: document.getElementById('cancion-categoria').value,
        estado: document.getElementById('cancion-estado').value,
        reproducciones: 0,
        fechaCreacion: serverTimestamp(),
        activa: true
    };
    
    // si editamos un documento existente, conservar campos previos cuando existan
    if (formEditingId) {
        const cancionExistente = allCanciones.find(c => c.id === formEditingId);
        if (cancionExistente && cancionExistente.reproducciones) {
            data.reproducciones = cancionExistente.reproducciones;
        }
        if (cancionExistente && cancionExistente.fechaCreacion) {
            data.fechaCreacion = cancionExistente.fechaCreacion;
        }
    }
    
    try {
        if (formEditingId) {
            // Actualizar documento existente (merge para evitar borrar campos extra)
            await setDoc(doc(db, 'canciones', formEditingId), data, { merge: true });
        } else {
            // Crear nuevo documento con id consistente
            const id = `cancion_${Date.now()}`;
            await setDoc(doc(db, 'canciones', id), data);
        }
        alert('✅ Canción guardada con éxito');
        resetCancionForm();
        loadCanciones();
    } catch (error) {
        console.error('Error al guardar canción:', error);
        alert('❌ Error al guardar la canción: ' + error.message);
    }
});

document.getElementById('cancion-cancel').addEventListener('click', resetCancionForm);

document.getElementById('cancion-delete').addEventListener('click', async () => {
    if (!editingId) return;
    
    if (confirm('¿Estás seguro de eliminar esta canción?')) {
        try {
            await deleteDoc(doc(db, 'canciones', editingId));
            alert('✅ Canción eliminada con éxito');
            resetCancionForm();
            loadCanciones();
        } catch (error) {
            console.error('Error al eliminar canción:', error);
            alert('❌ Error al eliminar la canción');
        }
    }
});

// ==================== RECURSOS ====================

let allRecursos = [];

async function loadRecursos() {
    try {
        const q = query(collection(db, 'recursos'), orderBy('fechaCreacion', 'desc'));
        const querySnapshot = await getDocs(q);
        allRecursos = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        allRecursos.sort((a, b) => {
            const ta = a.fechaCreacion && a.fechaCreacion.toMillis ? a.fechaCreacion.toMillis() : (a.fechaCreacion || 0);
            const tb = b.fechaCreacion && b.fechaCreacion.toMillis ? b.fechaCreacion.toMillis() : (b.fechaCreacion || 0);
            return tb - ta;
        });
        displayRecursos(allRecursos);
    } catch (error) {
        console.error('Error al cargar recursos:', error);
    }
}

function displayRecursos(recursos) {
    const list = document.getElementById('recurso-list');
    list.innerHTML = '';
    
    // Se asume que 'recursos' viene ordenado por fechaCreacion desc
    recursos.forEach(recurso => {
        const item = document.createElement('div');
        item.className = `item ${editingId === recurso.id ? 'active' : ''}`;
        
        const iconos = {
            'dinamicas': '💥',
            'juegos': '🎲',
            'reflexiones': '🤔',
            'retiros': '⛰️'
        };
        
        const icono = iconos[recurso.categoria] || '📋';
        
        item.innerHTML = `
            <div class="item-title">${icono} ${recurso.titulo || 'Sin título'}</div>
            <div class="item-subtitle">Categoría: ${recurso.categoria || 'Sin categoría'}</div>
            <span class="item-badge badge-${recurso.estado || 'pendiente'}">${recurso.estado || 'pendiente'}</span>
        `;
        item.addEventListener('click', () => editRecurso(recurso));
        list.appendChild(item);
    });
}

function editRecurso(recurso) {
    editingId = recurso.id;
    // Guardar id en el dataset del formulario
    const form = document.getElementById('recurso-form');
    form.dataset.editingId = recurso.id;
    
    document.getElementById('recurso-form-title').textContent = '✏️ Editar Recurso';
    document.getElementById('recurso-titulo').value = recurso.titulo || '';
    document.getElementById('recurso-categoria').value = recurso.categoria || 'dinamicas';
    document.getElementById('recurso-descripcion').value = recurso.descripcion || '';
    document.getElementById('recurso-objetivo').value = recurso.objetivo || '';
    document.getElementById('recurso-duracion').value = recurso.duracion || '';
    document.getElementById('recurso-participantes').value = recurso.participantes || '';
    
    document.getElementById('recurso-materiales').value = 
        (Array.isArray(recurso.materiales) ? recurso.materiales.join('\n') : recurso.materiales || '');
    
    document.getElementById('recurso-pasos').value = 
        (Array.isArray(recurso.pasos) ? recurso.pasos.join('\n') : recurso.pasos || '');
    
    document.getElementById('recurso-estado').value = recurso.estado || 'pendiente';
    document.getElementById('recurso-autor').value = recurso.autor || '';
    
    document.getElementById('recurso-cancel').style.display = 'inline-block';
    document.getElementById('recurso-delete').style.display = 'inline-block';
    displayRecursos(allRecursos);
}

function resetRecursoForm() {
    editingId = null;
    const form = document.getElementById('recurso-form');
    delete form.dataset.editingId;
    
    document.getElementById('recurso-form-title').textContent = '➕ Nuevo Recurso';
    document.getElementById('recurso-form').reset();
    document.getElementById('recurso-cancel').style.display = 'none';
    document.getElementById('recurso-delete').style.display = 'none';
    displayRecursos(allRecursos);
}

document.getElementById('recurso-search').addEventListener('input', filterRecursos);
document.getElementById('recurso-filter-estado').addEventListener('change', filterRecursos);
document.getElementById('recurso-filter-categoria').addEventListener('change', filterRecursos);

function filterRecursos() {
    const search = document.getElementById('recurso-search').value.toLowerCase();
    const filterEstado = document.getElementById('recurso-filter-estado').value;
    const filterCategoria = document.getElementById('recurso-filter-categoria').value;
    
    let filtered = allRecursos.filter(r => {
        const matchSearch = (r.titulo || '').toLowerCase().includes(search);
        const matchEstado = !filterEstado || (r.estado || 'pendiente') === filterEstado;
        const matchCategoria = !filterCategoria || (r.categoria || '') === filterCategoria;
        return matchSearch && matchEstado && matchCategoria;
    });
    
    displayRecursos(filtered);
}

document.getElementById('recurso-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const form = document.getElementById('recurso-form');
    const formEditingId = form.dataset.editingId || null;
    
    const materialesText = document.getElementById('recurso-materiales').value.trim();
    const pasosText = document.getElementById('recurso-pasos').value.trim();
    
    const data = {
        titulo: document.getElementById('recurso-titulo').value.trim(),
        categoria: document.getElementById('recurso-categoria').value,
        descripcion: document.getElementById('recurso-descripcion').value.trim(),
        objetivo: document.getElementById('recurso-objetivo').value.trim(),
        duracion: document.getElementById('recurso-duracion').value.trim(),
        participantes: document.getElementById('recurso-participantes').value.trim(),
        materiales: materialesText ? materialesText.split('\n').filter(m => m.trim()) : [],
        pasos: pasosText ? pasosText.split('\n').filter(p => p.trim()) : [],
        estado: document.getElementById('recurso-estado').value,
        autor: document.getElementById('recurso-autor').value.trim() || 'Administrador',
        fechaCreacion: serverTimestamp()
    };
    
    if (formEditingId) {
        const recursoExistente = allRecursos.find(r => r.id === formEditingId);
        if (recursoExistente && recursoExistente.fechaCreacion) {
            data.fechaCreacion = recursoExistente.fechaCreacion;
        }
    }
    
    try {
        if (formEditingId) {
            await setDoc(doc(db, 'recursos', formEditingId), data, { merge: true });
        } else {
            const id = `recurso_${Date.now()}`;
            await setDoc(doc(db, 'recursos', id), data);
        }
        alert('✅ Recurso guardado con éxito');
        resetRecursoForm();
        loadRecursos();
    } catch (error) {
        console.error('Error al guardar recurso:', error);
        alert('❌ Error al guardar el recurso: ' + error.message);
    }
});

document.getElementById('recurso-cancel').addEventListener('click', resetRecursoForm);

document.getElementById('recurso-delete').addEventListener('click', async () => {
    if (!editingId) return;
    
    if (confirm('¿Estás seguro de eliminar este recurso?')) {
        try {
            await deleteDoc(doc(db, 'recursos', editingId));
            alert('✅ Recurso eliminado con éxito');
            resetRecursoForm();
            loadRecursos();
        } catch (error) {
            console.error('Error al eliminar recurso:', error);
            alert('❌ Error al eliminar el recurso');
        }
    }
});

// ==================== PASAPALABRA ====================

let allReflexiones = [];

async function loadPasapalabra() {
    try {
        const querySnapshot = await getDocs(collection(db, 'pasapalabra'));
        allReflexiones = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayPasapalabra(allReflexiones);
    } catch (error) {
        console.error('Error al cargar pasapalabra:', error);
    }
}

function displayPasapalabra(reflexiones) {
    const list = document.getElementById('pasapalabra-list');
    list.innerHTML = '';
    
    if (reflexiones.length === 0) {
        return;
    }
    
    // Ordenar por fecha descendente (más reciente primero)
    reflexiones.sort((a, b) => {
        try {
            const dateA = parseDateDDMMYYYY(a.fecha || '01/01/2000');
            const dateB = parseDateDDMMYYYY(b.fecha || '01/01/2000');
            return dateB - dateA;
        } catch {
            return 0;
        }
    });
    
    reflexiones.forEach(reflexion => {
        const item = document.createElement('div');
        item.className = 'reflexion-item';
        item.innerHTML = `
            <div class="reflexion-header">
                <div>
                    <div class="reflexion-date">${reflexion.fecha || 'Sin fecha'}</div>
                    <div class="reflexion-title">${reflexion.titulo || 'Sin título'}</div>
                </div>
                <button class="btn-delete-reflexion" data-id="${reflexion.id}">🗑️ Eliminar</button>
            </div>
            <div class="reflexion-content">${(reflexion.reflexion || 'Sin contenido').substring(0, 250)}...</div>
        `;
        list.appendChild(item);
    });
    
    document.querySelectorAll('.btn-delete-reflexion').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (confirm('¿Estás seguro de eliminar esta reflexión?')) {
                try {
                    await deleteDoc(doc(db, 'pasapalabra', id));
                    alert('✅ Reflexión eliminada con éxito');
                    loadPasapalabra();
                } catch (error) {
                    console.error('Error al eliminar reflexión:', error);
                    alert('❌ Error al eliminar la reflexión');
                }
            }
        });
    });
}

// Buscador de pasapalabra
document.getElementById('pasapalabra-search').addEventListener('input', () => {
    const search = document.getElementById('pasapalabra-search').value.toLowerCase();
    
    const filtered = allReflexiones.filter(r => {
        return (r.fecha || '').toLowerCase().includes(search) ||
               (r.titulo || '').toLowerCase().includes(search);
    });
    
    displayPasapalabra(filtered);
});

document.getElementById('pasapalabra-process').addEventListener('click', () => {
    const rawText = document.getElementById('pasapalabra-raw').value;
    const lines = rawText.split('\n').filter(line => line.trim());
    
    const dateRegex = /\d+\s+de\s+\w+\s+de\s+\d{4}/i;
    const dateLine = lines.find(line => dateRegex.test(line));
    if (dateLine) {
        const formattedDate = convertToDateFormat(dateLine.trim());
        document.getElementById('pasapalabra-fecha').value = formattedDate;
    }
    
    const titleIndex = dateLine ? lines.indexOf(dateLine) + 1 : 0;
    if (titleIndex < lines.length) {
        const potentialTitle = lines[titleIndex];
        if (potentialTitle === potentialTitle.toUpperCase()) {
            document.getElementById('pasapalabra-titulo').value = potentialTitle.trim();
        }
    }
    
    const contentLines = lines.filter(line => {
        const lower = line.toLowerCase();
        return !dateRegex.test(line) &&
               line !== document.getElementById('pasapalabra-titulo').value &&
               !lower.includes('abrazos') &&
               !lower.includes('@') &&
               (!lower.match(/^[a-z\s]+$/i) || line.length > 50);
    });
    
    document.getElementById('pasapalabra-reflexion').value = contentLines.join('\n').trim();
});

document.getElementById('pasapalabra-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        fecha: document.getElementById('pasapalabra-fecha').value.trim(),
        titulo: document.getElementById('pasapalabra-titulo').value.trim(),
        reflexion: document.getElementById('pasapalabra-reflexion').value.trim(),
        estado: 'publicado',
        createdAt: serverTimestamp()
    };
    
    if (!data.fecha || !data.titulo || !data.reflexion) {
        alert('❌ Por favor completa todos los campos');
        return;
    }
    
    try {
        const id = `pasapalabra_${Date.now()}`;
        await setDoc(doc(db, 'pasapalabra', id), data);
        alert('✅ Reflexión guardada con éxito');
        
        document.getElementById('pasapalabra-raw').value = '';
        document.getElementById('pasapalabra-form').reset();
        
        loadPasapalabra();
    } catch (error) {
        console.error('Error al guardar reflexión:', error);
        alert('❌ Error al guardar la reflexión: ' + error.message);
    }
});

// ==================== FRASES ====================

let allFrases = [];

async function loadFrases() {
    try {
        const q = query(collection(db, 'frases'), orderBy('fechaCreacion', 'desc'));
        const querySnapshot = await getDocs(q);
        allFrases = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // fallback: asegurar orden descendente por fechaCreacion en cliente
        allFrases.sort((a, b) => {
            const ta = a.fechaCreacion && typeof a.fechaCreacion.toMillis === 'function'
                ? a.fechaCreacion.toMillis()
                : (a.fechaCreacion || 0);
            const tb = b.fechaCreacion && typeof b.fechaCreacion.toMillis === 'function'
                ? b.fechaCreacion.toMillis()
                : (b.fechaCreacion || 0);
            return tb - ta;
        });
        displayFrases(allFrases);
    } catch (error) {
        console.error('Error al cargar frases:', error);
    }
}

function displayFrases(frases) {
    const list = document.getElementById('frase-list');
    list.innerHTML = '';

    // Se asume que 'frases' viene ordenado por fechaCreacion desc
    frases.forEach(frase => {
        const item = document.createElement('div');
        item.className = `item ${editingId === frase.id ? 'active' : ''}`;

        item.innerHTML = `
            <div class="item-title">"${(frase.frase || '').substring(0, 80)}..."</div>
            <div class="item-subtitle">— ${frase.autor || 'Anónimo'}</div>
            <span class="item-badge badge-${frase.estado || 'publicado'}">${frase.estado || 'publicado'}</span>
        `;
        item.addEventListener('click', () => editFrase(frase));
        list.appendChild(item);
    });
}

function editFrase(frase) {
    editingId = frase.id;
    // Guardar id en el dataset del formulario
    const form = document.getElementById('frase-form');
    form.dataset.editingId = frase.id;
    
    document.getElementById('frase-form-title').textContent = '✏️ Editar Frase';
    document.getElementById('frase-texto').value = frase.frase || '';
    document.getElementById('frase-autor').value = frase.autor || '';
    
    document.getElementById('frase-cancel').style.display = 'inline-block';
    document.getElementById('frase-delete').style.display = 'inline-block';
    displayFrases(allFrases);
}

function resetFraseForm() {
    editingId = null;
    const form = document.getElementById('frase-form');
    delete form.dataset.editingId;
    
    document.getElementById('frase-form-title').textContent = '➕ Nueva Frase';
    document.getElementById('frase-form').reset();
    document.getElementById('frase-cancel').style.display = 'none';
    document.getElementById('frase-delete').style.display = 'none';
    displayFrases(allFrases);
}

document.getElementById('frase-search').addEventListener('input', () => {
    const search = document.getElementById('frase-search').value.toLowerCase();
    
    const filtered = allFrases.filter(f => {
        return (f.frase || '').toLowerCase().includes(search) ||
               (f.autor || '').toLowerCase().includes(search);
    });
    
    displayFrases(filtered);
});

document.getElementById('frase-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const form = document.getElementById('frase-form');
    const formEditingId = form.dataset.editingId || null;
    
    const data = {
        frase: document.getElementById('frase-texto').value.trim(),
        autor: document.getElementById('frase-autor').value.trim(),
        estado: 'publicado',
        fechaCreacion: serverTimestamp()
    };
    
    if (formEditingId) {
        const fraseExistente = allFrases.find(f => f.id === formEditingId);
        if (fraseExistente && fraseExistente.fechaCreacion) {
            data.fechaCreacion = fraseExistente.fechaCreacion;
        }
    }
    
    try {
        if (formEditingId) {
            await setDoc(doc(db, 'frases', formEditingId), data, { merge: true });
        } else {
            const id = `frase_${Date.now()}`;
            await setDoc(doc(db, 'frases', id), data);
        }
        alert('✅ Frase guardada con éxito');
        resetFraseForm();
        loadFrases();
    } catch (error) {
        console.error('Error al guardar frase:', error);
        alert('❌ Error al guardar la frase: ' + error.message);
    }
});

document.getElementById('frase-cancel').addEventListener('click', resetFraseForm);

document.getElementById('frase-delete').addEventListener('click', async () => {
    if (!editingId) return;
    
    if (confirm('¿Estás seguro de eliminar esta frase?')) {
        try {
            await deleteDoc(doc(db, 'frases', editingId));
            alert('✅ Frase eliminada con éxito');
            resetFraseForm();
            loadFrases();
        } catch (error) {
            console.error('Error al eliminar frase:', error);
            alert('❌ Error al eliminar la frase');
        }
    }
});

// ==================== CORRECCIÓN DE LETRAS (ACORDES) ====================

function initLyricsCorrector() {
    if (window.lyricsCorrectorInit) return;
    window.lyricsCorrectorInit = true;

    const input = document.getElementById('lyrics-input');
    const output = document.getElementById('lyrics-output');
    const btnCorrect = document.getElementById('lyrics-correct-btn');
    const btnFormat = document.getElementById('lyrics-format-btn');
    const btnFinish = document.getElementById('lyrics-finish-btn');
    const btnCopy = document.getElementById('lyrics-copy-btn');
    const btnReplace = document.getElementById('lyrics-replace-btn');
    const btnClear = document.getElementById('lyrics-clear-btn');

    // Corregir acordes: solo normaliza a cifrado americano, SIN corchetes
    btnCorrect.addEventListener('click', () => {
        output.value = onlyNormalizeChords(input.value);
    });

    // Corregir formato: envuelve en corchetes (no cambia raíces)
    btnFormat.addEventListener('click', () => {
        output.value = formatLyricsChords(input.value);
    });

    // Poner a punto: normaliza primero, luego aplica formato (resultado final con corchetes)
    btnFinish.addEventListener('click', () => {
        const normalized = onlyNormalizeChords(input.value);
        output.value = formatLyricsChords(normalized);
    });

    btnCopy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(output.value);
            alert('✅ Resultado copiado al portapapeles');
        } catch (err) {
            console.error(err);
            alert('❌ No se pudo copiar: ' + err.message);
        }
    });

    btnReplace.addEventListener('click', () => {
        input.value = output.value;
    });

    btnClear.addEventListener('click', () => {
        input.value = '';
        output.value = '';
    });
}

/* -----------------------
   Nueva implementación:
   - normalizePart(): normaliza una "parte" (lado de slash) inglesa o europea
   - normalizeChordToken(): divide por '/' y normaliza cada parte
   - onlyNormalizeChords(): aplica normalización en líneas de acordes
   - correctLyricsChords() ahora usa onlyNormalize + format (poner a punto usa btnFinish)
   ----------------------- */

const EURO_ROOTS = { sol: 'G', do: 'C', re: 'D', mi: 'E', fa: 'F', la: 'A', si: 'B' };
const SUFFIX_RE = /^(m|min|maj7|maj9|maj|M7|M|m7|min7|dim7|dim|aug7|aug|sus2|sus4|sus|add\d+|add|7|9|11|13|6|°|\+|\-|\d.*)?$/i;

function normalizeEnglishPart(part) {
    // part example: "G", "G#m7", "A/B"
    const m = part.match(/^([A-Ga-g])([#b♯♭s]?)(.*)$/);
    if (!m) return null;
    let root = m[1].toUpperCase();
    let acc = (m[2] || '').replace('♯', '#').replace('♭', 'b').replace(/s$/i, '#');
    let suffix = (m[3] || '');
    // suffix can be empty or must match allowed suffix pattern
    if (suffix && !SUFFIX_RE.test(suffix)) return null;
    return root + acc + suffix;
}

function normalizeEuropeanPart(part) {
    // part example: "Do", "Sim", "Sib", "Sol#m7"
    const m = part.match(/^([A-Za-zñÑáÁéÉíÍóÓúÚ]+)([#b♯♭s]?)(.*)$/i);
    if (!m) return null;
    const baseRaw = m[1].toLowerCase();
    const rootEng = EURO_ROOTS[baseRaw];
    if (!rootEng) return null;
    let acc = (m[2] || '').replace('♯', '#').replace('♭', 'b').replace(/s$/i, '#');
    let suffix = (m[3] || '');
    if (suffix && !SUFFIX_RE.test(suffix)) {
        // allow single-letter 'm' (minor) and common forms like 'min'
        if (!/^(m|min)/i.test(suffix)) return null;
    }
    // ensure minor written as 'm' (e.g., "Sim" -> suffix 'm' kept)
    return rootEng + acc + suffix;
}

function normalizeChordToken(token) {
    if (!token) return null;
    // strip surrounding brackets/parens and punctuation commonly attached
    const clean = token.replace(/^[\[\(\s]+|[\]\)\s,.;:]+$/g, '');
    if (!clean) return null;
    // split slash chords and normalize each side
    const parts = clean.split('/');
    const outParts = [];
    for (let p of parts) {
        if (!p) return null;
        // try english first
        let norm = normalizeEnglishPart(p);
        if (norm) { outParts.push(norm); continue; }
        // then european
        norm = normalizeEuropeanPart(p);
        if (norm) { outParts.push(norm); continue; }
        // not a chord part
        return null;
    }
    return outParts.join('/');
}

function isChordLike(token) {
    return normalizeChordToken(token) !== null;
}

function onlyNormalizeChords(text) {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    return lines.map(line => {
        if (line.trim() === '') return line;
        const tokens = line.split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return line;
        
        const normalized = tokens.map(t => {
            const nt = normalizeChordToken(t);
            return nt !== null ? nt : t;
        });
        return normalized.join(' ');
    }).join('\n');
}

function formatLyricsChords(text) {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    return lines.map(line => {
        if (line.trim() === '') return line;
        const tokens = line.split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return line;
        
        const formatted = tokens.map(t => {
            const nt = normalizeChordToken(t);
            return nt !== null ? `[${nt}]` : t;
        });
        return formatted.join(' ');
    }).join('\n');
}

function correctLyricsChords(text) {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    return lines.map(line => {
        if (line.trim() === '') return line;
        const tokens = line.split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) return line;
        
        const corrected = tokens.map(t => {
            const nt = normalizeChordToken(t);
            return nt !== null ? `[${nt}]` : t;
        });
        return corrected.join(' ');
    }).join('\n');
}