// Liste des lieux du jeu
const locations = [
    "Base Spatiale", "Sous-marin", "Hôpital", "Banque", 
    "École", "Restaurant", "Théâtre", "Poste de police", 
    "Casino", "Bateau pirate", "Supermarché", "Train de nuit"
];

// Simulation de l'attribution d'un rôle
// Dans le vrai jeu, Firebase décidera si le joueur est imposteur ou non
const isImpostor = Math.random() > 0.7; // 30% de chance d'être imposteur pour le test
const currentLocation = locations[Math.floor(Math.random() * locations.length)];

// Initialisation de la carte de rôle
const roleNameEl = document.getElementById('role-name');
const secretLocationEl = document.getElementById('secret-location');

if (isImpostor) {
    roleNameEl.innerText = "IMPOSTEUR";
    roleNameEl.className = "role-title impostor-text";
    secretLocationEl.innerText = "Inconnu";
    secretLocationEl.style.color = "#e74c3c";
} else {
    roleNameEl.innerText = "AGENT";
    roleNameEl.className = "role-title innocent-text";
    secretLocationEl.innerText = currentLocation;
}

// Remplissage de la liste des lieux
const listEl = document.getElementById('locations-list');
locations.sort().forEach(loc => {
    const div = document.createElement('div');
    div.className = 'location-item';
    div.innerText = loc;
    // Fonction pour rayer un lieu
    div.onclick = function() {
        this.classList.toggle('strike');
    };
    listEl.appendChild(div);
});

// Fonctions pour gérer le clic sur la carte
function showRole() {
    document.getElementById('hidden-state').style.display = 'none';
    document.getElementById('revealed-state').style.display = 'flex';
    document.getElementById('card').style.borderStyle = 'solid';
}

function hideRole() {
    document.getElementById('hidden-state').style.display = 'flex';
    document.getElementById('revealed-state').style.display = 'none';
    document.getElementById('card').style.borderStyle = 'dashed';
}
