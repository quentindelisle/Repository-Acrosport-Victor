# Acrosport – Composer son enchaînement (PWA)

Application hors-ligne, format portrait, pour la tablette du professeur.

## Installation
1. Déposer ce dossier sur un hébergement HTTPS (ex. GitHub Pages : pousser le dépôt, activer Pages sur la branche principale).
2. Ouvrir l'URL sur la tablette → « Ajouter à l'écran d'accueil ». L'appli fonctionne ensuite sans réseau.
   (Ouvrir `index.html` en local fonctionne aussi, mais sans installation ni mode hors-ligne garanti.)

## Utilisation
- **Espace prof → Classes** : importer la liste (CSV/TXT Pronote, Excel .xlsx/.ods, ou copier-coller). Initiales générées automatiquement, modifiables.
- **Espace prof → Groupes** : sélectionner des élèves et créer un groupe (3 à 6), ou répartir au hasard.
- **Groupes** (élèves) : chaque groupe ouvre son espace, ajoute figures et liaisons, touche les initiales pour attribuer les rôles (Porteur, Voltigeur, Parade, Aide), choisit 2 éléments statiques par élève, puis « Rend » l'enchaînement.
- **Synthèse & points** : points de difficulté par élève (porteur/voltigeur uniquement), alertes, export CSV, impression des fiches, réouverture d'un groupe.
- **Sauvegarde JSON** : export/import (fusion ou remplacement). Sauvegarde automatique locale à chaque modification.
- **Réglages** : barème (A 0,4 · B 0,6 · C 0,8 · D 1 par défaut), nombre de figures et d'éléments statiques exigés, code prof.

Fichiers : `index.html`, `app.js`, `data.js` (figures extraites du Code de figures, images incluses), `sw.js`, `manifest.webmanifest`, `icons/`, `vendor/xlsx.mini.min.js` (lecture Excel).
