# Cartéo — droits Premium vérifiés (déploiement bloqué tant que les contrôles ne sont pas terminés)

## Source de vérité
- Apple App Store Server API + App Store Server Notifications V2 pour les achats iOS.
- Google Play Developer API + Real-time Developer Notifications pour les achats Android.
- Les achats sandbox/test ne doivent pas donner de droits en production.
- Premium offert: attribution par un administrateur authentifié côté serveur, jamais par un champ modifiable dans l'application.

## Modèle proposé
Collection protégée `premiumEntitlements/{firebaseAuthUid}` avec `source` (apple/google/admin), `verificationStatus` (verified), `status` (active/grace/expired/revoked), `expiresAt` (timestamp), `lifetime` (bool), `lastVerifiedAt`, identifiant de transaction ou token de paiement conservé de manière sécurisée. Associer les cartes par `ownerUID`, sans utiliser le slug comme preuve de propriété. Une projection serveur peut être écrite dans `profiles/{slug}.premiumEntitlement` uniquement par le backend privilégié.

## À développer AVANT fusion PR #15
1. Authentifier l'utilisateur Firebase lors de la soumission d'une transaction; vérifier transaction/produit/environnement/compte auprès d'Apple ou Google. Protéger contre la réutilisation d'un achat sur plusieurs comptes.
2. Vérifier cryptographiquement les notifications Apple; authentifier et valider les messages Pub/Sub Google, puis reconsulter Google Play. Rendre les événements idempotents et gérer leur ordre.
3. Réconcilier périodiquement les droits auprès des boutiques pour pallier les notifications manquées; ne jamais se fier au seul booléen `isPremium` de l'application.
4. Appliquer des règles Firestore qui interdisent à tout client de modifier les droits, `isPremium`, `premiumEntitlement`, `ownerUID` et autres champs privilégiés; préserver l'accès des anciennes cartes et tester l'ensemble avant le 31 octobre 2026.
5. Faire la vérification de droit côté serveur à chaque ouverture de carte (lecture fraîche de la projection). Une projection expirée doit être traitée comme gratuite. Pas d'appel aux API Apple/Google à chaque scan.
6. Wallet: conserver le QR et le slug; mettre à jour le pass avec les notifications Apple Wallet / mécanismes Google Wallet pertinents lors d'un changement de droit.
7. Tester: gratuit, achat Apple, achat Google, renouvellement, période de grâce, expiration sans ouverture de l'app, remboursement, Premium offert, révocation, cartes existantes et sandbox.

## Avertissement migration
Le code de PR #15 refuse volontairement les profils sans `premiumEntitlement` vérifié. Ne PAS déployer tant que les utilisateurs Premium existants ne sont pas migrés, et que les flux Apple/Google/admin ne fonctionnent pas. Aucune règle Firebase n'a été appliquée ni aucun abonnement réellement vérifié par ce changement.
