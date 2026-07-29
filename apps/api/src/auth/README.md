# Authentification v1

Better Auth est monté sous `/api/auth/*` avec le plugin officiel `username` :

- pseudonyme unique, insensible à la casse, de 3 à 24 caractères ;
- caractères autorisés : lettres ASCII, chiffres, point et tiret bas ;
- mot de passe de 12 à 128 caractères ;
- session de 7 jours et cookie `httpOnly`, `SameSite=Lax`, `Secure` en production ;
- changement de mot de passe authentifié et suppression avec mot de passe ;
- origine web explicitement autorisée et limitation de débit.

Better Auth conserve une colonne `email` obligatoire pour sa compatibilité
interne. L’API génère une adresse technique non personnelle sous
`players.invalid`, ne l’expose dans aucune réponse et bloque toutes les routes
publiques fondées sur l’email. Aucun service SMTP n’est nécessaire.

La v1 ne propose pas de récupération d’un mot de passe oublié. Un joueur
connecté peut changer son mot de passe ; sinon il doit créer un nouveau compte.
