# Image Node officielle
FROM node:18-alpine

# Dossier de travail dans le conteneur
WORKDIR /usr/src/app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install --production

# Copier tout le projet
COPY . .

# Exposer le port de l’API
EXPOSE 3000

# Lancer le serveur
CMD ["node", "src/server.js"]
