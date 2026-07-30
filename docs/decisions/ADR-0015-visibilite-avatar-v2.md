# ADR-0015 — Visibilité de l’avatar en v2

- Statut : accepté
- Date : 2026-07-30
- Version cible : v2

## Contexte

Le multijoueur affiche le pseudonyme et l’avatar de l’adversaire. La v1
réservait la lecture du média au propriétaire, ce qui ne permet pas au second
navigateur d’afficher cette identité. La v2 ne possède ni profil public, ni
liste d’amis, ni stockage objet, ni modération de contenu libre.

Trois options ont été considérées :

1. conserver la lecture propriétaire et afficher une initiale à l’adversaire ;
2. émettre une capacité signée limitée à chaque partie ;
3. rendre l’avatar visible à tout joueur authentifié, sans ouvrir les autres
   champs du profil.

## Décision

- L’avatar est une identité de jeu visible aux joueurs authentifiés.
- Seul le propriétaire peut enregistrer, remplacer ou supprimer son avatar.
- La bio, les données du compte, les préférences, les statistiques et
  l’historique ne deviennent pas publics.
- La route de lecture exige une session valide et un identifiant opaque. Aucun
  endpoint ne liste les comptes ou leurs identifiants.
- Le média conserve ses limites v1 : JPEG, PNG ou WebP, signature vérifiée et
  taille maximale de 1 Mio.
- La suppression du compte retire immédiatement le média.

## Conséquences

Un adversaire peut conserver l’identifiant opaque reçu pendant une partie et
relire l’avatar tant qu’il possède un compte actif. Ce comportement est accepté
pour la première v2 privée, où l’avatar est traité comme une présentation
publique à l’intérieur du jeu.

Une option de confidentialité, des profils publics, des relations d’amitié, des
avatars modérés ou un stockage objet imposeront de remplacer cette politique
par une autorisation relationnelle ou une capacité signée.

## Vérification

- une requête sans session est refusée ;
- un joueur authentifié peut lire l’avatar d’un adversaire connu ;
- un joueur ne peut modifier ou supprimer que son propre avatar ;
- la réponse ne contient aucune bio ou métadonnée de compte ;
- la suppression du compte rend l’ancien média introuvable.
